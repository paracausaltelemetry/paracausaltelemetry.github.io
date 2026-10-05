"use strict";
/* Operation Heatmap, Part 2 "Unmask the operation": on-site questions with
   client-side checking. Salted PBKDF2 hashes give per-question feedback; the
   second flag is AES-GCM ciphertext keyed off the correct answers, so neither
   the answers nor the flag appear in source. Same scheme as the launcher. */

const DATA = {"iters":120000,"questions":[{"id":"reg_email","prompt":"Before the registrant switched on privacy, what email address registered apex-defence-recruitment.com?","salt":"0b8118709274880ea93f9839643c215a","hash":"2467d70a5e57bbc4f71dddb727433b2e83a327d64852f4f1183eff2cdfee1bb5"},{"id":"reg_name","prompt":"What is the name of the person who first registered that domain?","salt":"6838468bb5ad05717d44e6cb76b785e4","hash":"554c617f63557e0c71af34ce37811503f0d6421253c649d9f0b5c43b83ad71e9"},{"id":"kit","prompt":"What is the name of the kit the careers portal was built with?","salt":"bcdb6ff3bb619a374f511220ca206b61","hash":"0997ebd4a29c7e1f643caa32ea5ddae7e56cccd5c67859c7d64aac1b08b006d2"},{"id":"analytics_id","prompt":"What tracking tag is wired into the fake recruiter sites?","salt":"c3154b164e3dd1d78951d56bfb7ed005","hash":"6ef5901c2250295d828dc421e63d6dab3f97c4c1c07eb33de3bacb7e624cbfb6"},{"id":"domains_count","prompt":"How many lookalike recruiter domains share the campaign's host?","salt":"31d1ca96768f6922b3bacd8b6c57abf6","hash":"ba2fa4da2f3104c6b4376e654e7dfd7dd6aa77f38fbe7bcce77d99534d7b6aec"},{"id":"doc_author","prompt":"What author handle is left in the role-pack document's metadata?","salt":"1b729a2a9e3255f3ffdcc1e886ad8660","hash":"661f8a14bf2aca5ecd393da96049eaa8b550735224fe59a344819ec6af331d07"},{"id":"operator","prompt":"What username does the operator trade under on the forum?","salt":"a5c0027a8cd6ac35e68a5fbfe6c8bc95","hash":"50050cae9325b4822b80076b9167133399e5a431d742106ca5e6123779f542cb"},{"id":"crew","prompt":"What does the crew call itself?","salt":"c0bf87f7cbe3b8152fe15945bd9c6a28","hash":"dafaec725e5f62f2e8706e081f618c239b66977417f6171f4acab7249ee24c3b"}],"flag":{"salt":"9eff82c2eefd618217234e513392521b","iv":"122d0ffb3838b441e766f7fd","ct":"7638ea3b5e5b3dad0b2bbd7bbf2aa39070ab36e7bf5d22aafe382bbc201e7922575c483db51a6c86bff9f5de7d6b4076f5","iters":150000}};
/* ---- helpers ---- */
function norm(s){
  return String(s).toLowerCase().trim()
    .replace(/[‘’'"`]/g,"")
    .replace(/\s+/g," ")
    .replace(/[.,;:!?]+$/g,"");
}
function hex2buf(h){const a=new Uint8Array(h.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;}
const enc=new TextEncoder();
const STORE="pt_heatmap_q2";

async function deriveHashHex(pass,saltHex,iters){
  const base=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:hex2buf(saltHex),iterations:iters,hash:"SHA-256"},base,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function tryFlag(){
  try{
    const material=DATA.questions.map(q=>norm(state[q.id]||"")).join("\n");
    const base=await crypto.subtle.importKey("raw",enc.encode(material),"PBKDF2",false,["deriveKey"]);
    const key=await crypto.subtle.deriveKey(
      {name:"PBKDF2",salt:hex2buf(DATA.flag.salt),iterations:DATA.flag.iters,hash:"SHA-256"},
      base,{name:"AES-GCM",length:256},false,["decrypt"]);
    const blob=hex2buf(DATA.flag.ct);
    const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:hex2buf(DATA.flag.iv)},key,blob);
    return new TextDecoder().decode(pt);
  }catch(e){return null;}
}

/* ---- state ---- */
let state={};        // id -> raw input
let solved={};       // id -> true
try{const s=JSON.parse(localStorage.getItem(STORE)||"{}");state=s.state||{};}catch(e){}

function save(){try{localStorage.setItem(STORE,JSON.stringify({state}));}catch(e){}}

/* ---- build the question list ---- */
const list=document.getElementById("qlist");
DATA.questions.forEach((q,i)=>{
  const row=document.createElement("div");row.className="q";row.dataset.id=q.id;
  row.innerHTML=
    '<div class="qn">'+String(i+1).padStart(2,"0")+'</div>'+
    '<div class="qmain">'+
      '<label class="qp" for="in-'+q.id+'">'+q.prompt+'</label>'+
      '<div class="qrow">'+
        '<input class="qin" id="in-'+q.id+'" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="state-'+q.id+'" aria-label="Answer">'+
        '<span class="qmark" aria-hidden="true"></span>'+
      '</div>'+
      '<span class="qstate" id="state-'+q.id+'"></span>'+
    '</div>';
  list.appendChild(row);
  const input=row.querySelector(".qin");
  if(state[q.id]) input.value=state[q.id];
  const mark=row.querySelector(".qmark");
  const stateEl=row.querySelector(".qstate");
  let seq=0;
  const check=async()=>{
    const v=input.value;state[q.id]=v;save();
    const mine=++seq;
    if(!norm(v)){row.classList.remove("ok","no","checking");mark.textContent="";stateEl.textContent="";solved[q.id]=false;input.removeAttribute("aria-invalid");updateProgress();return;}
    row.classList.add("checking");row.classList.remove("ok","no");mark.textContent="";
    const h=await deriveHashHex(norm(v),q.salt,DATA.iters);
    if(mine!==seq) return;
    const good=h===q.hash;
    solved[q.id]=good;
    row.classList.remove("checking");
    row.classList.toggle("ok",good);row.classList.toggle("no",!good);
    mark.textContent=good?"✓":"✗";
    stateEl.textContent=good?"Confirmed":"Not yet";
    input.setAttribute("aria-invalid",good?"false":"true");
    updateProgress();
  };
  input.addEventListener("change",check);
  input.addEventListener("blur",check);
  // revalidate restored answers on load
  if(state[q.id]) queueMicrotask(check);
});

/* ---- progress + flag ---- */
const cellsEl=document.getElementById("pcells");
const ptext=document.getElementById("ptext");
const flagWrap=document.getElementById("flagwrap");
const flagEl=document.getElementById("flag");
const total=DATA.questions.length;
/* one meter cell per question */
const cells=DATA.questions.map(()=>cellsEl.appendChild(document.createElement("i")));

async function updateProgress(){
  const n=DATA.questions.filter(q=>solved[q.id]).length;
  cells.forEach((c,i)=>c.classList.toggle("on",i<n));
  ptext.textContent=n+" of "+total+" correct";
  ptext.classList.toggle("done",n===total);
  if(n===total){
    const f=await tryFlag();
    if(f){
      flagEl.textContent=f;
      flagWrap.hidden=false;
      flagWrap.scrollIntoView({behavior:"smooth",block:"center"});
    }
  }else{
    flagWrap.hidden=true;
  }
}

/* reset (confirm destructive action) */
const resetBtn=document.getElementById("qreset");
if(resetBtn) resetBtn.addEventListener("click",()=>{
  if(!window.confirm("Clear all your answers and start over?")) return;
  state={};solved={};save();
  document.querySelectorAll(".q").forEach(r=>{r.classList.remove("ok","no","checking");const i=r.querySelector(".qin");i.value="";i.removeAttribute("aria-invalid");r.querySelector(".qmark").textContent="";r.querySelector(".qstate").textContent="";});
  updateProgress();
});

/* copy the flag */
const copyBtn=document.getElementById("flagcopy");
if(copyBtn) copyBtn.addEventListener("click",async()=>{
  const txt=flagEl.textContent||"";
  try{
    await navigator.clipboard.writeText(txt);
  }catch(e){
    const r=document.createRange();r.selectNodeContents(flagEl);
    const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);
    try{document.execCommand("copy");}catch(_){}
  }
  const was=copyBtn.textContent;copyBtn.textContent="Copied";
  setTimeout(()=>{copyBtn.textContent=was;},1600);
});

updateProgress();
