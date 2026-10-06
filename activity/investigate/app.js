"use strict";
/* Operation Heatmap, Part 2 "Unmask the operation": on-site questions with
   client-side checking. Salted PBKDF2 hashes give per-question feedback; the
   second flag is AES-GCM ciphertext keyed off the correct answers, so neither
   the answers nor the flag appear in source. Same scheme as the launcher. */

const DATA = {"iters":120000,"questions":[{"id":"reg_email","prompt":"Before the registrant hid behind privacy, what email address registered the Apex domain?","salt":"133b8a3eb0fd8dd6d1efc46d995b483b","hash":"10d09f83255b3c1c032db8b4489c3c3b87d8d11870a394890981f1bba6f8db90"},{"id":"reg_name","prompt":"Who first registered it?","salt":"269eb5c02597a06499d85742c3c90baf","hash":"ef85c81c91edb3369d3d8c26ad83509f0865f4546a86e89e951887296672cae3"},{"id":"privacy_days","prompt":"How many days did the domain go unprotected before the registrant switched on privacy?","salt":"59bcaf2767a126b4dbb3700d01bc23d2","hash":"2f38e386042b192b13014941599ad62d1bba5de306ab7c40bbcdac621094b446"},{"id":"kit","prompt":"What kit was the careers portal built with?","salt":"23b3dc6c21854cf7d75c298f52682cb0","hash":"f0fd0b13c8f0292a4f065b58c76ad01e305095d0e2849214424eb92df56cba18"},{"id":"analytics_id","prompt":"What tracking ID ties the operator's sites together?","salt":"f4edd34d3eb7193dc91dc066311777ac","hash":"4ecf67c1bb30ad39dac2cc4e91935d1602e82b648bc6278a320476d3d23e25c2"},{"id":"domains_count","prompt":"How many lookalike recruiter domains share the campaign's host?","salt":"e79827421b68598721fe5873fba4041c","hash":"53ae2aaef014c23f1d0034879077bfc9e191304f8e56a9a17d12cd384195f9f5"},{"id":"last_brand","prompt":"Which lookalike brand went live most recently before Apex? Give the domain.","salt":"b165996b0734c71ef267a2fa84a441e7","hash":"08f97215d83a4dd6545aad62283a5b2c2163e7d1e23b4abcd5967d47dab219e9"},{"id":"doc_author","prompt":"Whose username is left inside the role pack?","salt":"838d8fa576c8f209f76477754b406734","hash":"fa692301b9c23c3b5ed1ce1ef7dcbace2f4b7f2171eafb3c844bff94a485746f"},{"id":"modify_utc","prompt":"At what time UTC was the role pack last edited? Answer as HH:MM.","salt":"f97cce46454deb17345504d7b301b99f","hash":"61089d2dc339800e6584b12f0161b774763faf9c639ebbef18efed3dbcdfeb6a"},{"id":"operator","prompt":"What username does the operator trade under?","salt":"5aff4c7d41b2eb44bcdad9e4af982fa8","hash":"048467a056a1bef64926666d11a83d37f10a8595b9e5f03291e83412e7baffaa"},{"id":"crew","prompt":"What does the crew call itself?","salt":"fcc3d746eba6f07803c740c09a6cc773","hash":"17978cd870cb8f2609cec1518f543083ce56b5985208067e7d619c7b2d16d35b"}],"flag":{"salt":"8db8fc79b97db1a157a2791dc9d83d2b","iv":"d58c1f3bca98e96be282102e","ct":"2fac1cbb3fafc83f1410acce850cebebb085c867f07694ceba1b011c3a76784985cfbef0ba2aa250128821a21254729d0b","iters":150000}};
/* ---- helpers ---- */
function norm(s){
  var N={zero:"0",one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",ten:"10",eleven:"11",twelve:"12"};
  s=String(s).toLowerCase().trim()
    .replace(/[‘’'"`]/g,"")
    .replace(/\s+/g," ")
    .replace(/[.,;:!?]+$/g,"")
    .replace(/^the /,"")
    .replace(/^republic of /,"");
  if(N.hasOwnProperty(s)) s=N[s];
  s=s.replace(/ (garrison|collective|regiment|battalion|barracks|camp)$/,"");
  return s;
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

/* ---- artefact tabs (WHOIS current/history, portal page/source) ----
   Lives here rather than inline: the CSP only allows the hashed theme script. */
document.querySelectorAll('[role="tablist"]').forEach(tl=>{
  const tabs=[...tl.querySelectorAll('[role="tab"]')];
  const show=(t,focus)=>{
    tabs.forEach(x=>{const on=x===t;x.setAttribute("aria-selected",String(on));x.tabIndex=on?0:-1;const p=document.getElementById(x.getAttribute("aria-controls"));if(p)p.hidden=!on;});
    if(focus)t.focus();
  };
  tabs.forEach((t,i)=>{
    t.addEventListener("click",()=>show(t));
    t.addEventListener("keydown",e=>{
      const step={ArrowRight:1,ArrowLeft:-1}[e.key];
      if(step===undefined)return;
      e.preventDefault();
      show(tabs[(i+step+tabs.length)%tabs.length],true);
    });
  });
});
