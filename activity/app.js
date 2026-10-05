"use strict";
/* Operation Heatmap launcher: on-site Part 1 questions with client-side
   answer checking. Only salted PBKDF2 hashes are stored for per-question
   feedback; the flag is AES-GCM ciphertext whose key is derived from the
   correct answers, so neither the answers nor the flag appear in source. */

const DATA = {"iters":120000,"questions":[{"id":"name","prompt":"What is the subject’s full name?","where":"Cross-check the profile against a commit author line.","fmt":"First and last name","salt":"a8172ae7dc7e5a6001d7c9b9f13aa1e3","hash":"93146b7ace3583091be4ecd56290218f56f6bb6c7b7875033962a4f6a3aa96ec"},{"id":"user","prompt":"What username does he reuse across platforms?","where":"The same handle turns up on five different sites.","fmt":"the handle","salt":"7961a73cd8a1412fd3764151f958d5fb","hash":"6480e45d82b735181974881651f6f56221a99a53013d8ccac2caecd596ec1945"},{"id":"town","prompt":"Which town is his home area?","where":"Weekend runs, photo EXIF and the race photo agree.","fmt":"one word","salt":"fc37007ce4d202ba07467f62bd57bfde","hash":"48bae23a5f8fc28bccb1680e5014dd2290a8ee9338be7e1253b775bf2fda5b5a"},{"id":"base","prompt":"Where is he based during the week?","where":"Weekday run starts, a gate photo, a Reddit comment.","fmt":"the garrison, one word","salt":"6438414713f0b52a2e29259f42ed29bd","hash":"982be2b323532a3a437836b9d0bf3c2f2076b2c8ff14422c6698d93d5204a682"},{"id":"club","prompt":"Which running club is he a member of?","where":"The race bib and his profile.","fmt":"the club name","salt":"0db4b488296adbd8bdf87943db6137ac","hash":"1f52fcbc047f301726c623b3df8fc95627d69b8d31bd5cb68f0bc470c295e172"},{"id":"country","prompt":"Which country is he deployed to?","where":"GPS tracks, local times (UTC+3) and a boarding pass.","fmt":"one word","salt":"09dfdef18fac6f4cba70c27f83e415a9","hash":"f4bc577bb0ca7cc556ef652e0f375661b87dd428aef4401690ec5213c8fe7155"},{"id":"camp","prompt":"Which camp is he deployed to?","where":"An r/army thread names it.","fmt":"one word","salt":"c1e6b0205429fad66bb13566322284ef","hash":"b48b9bcbe381416a80075c69b3b676bb0f0fc1ff9344b9a581a8006f79b76f79"},{"id":"home","prompt":"Which month is he due home?","where":"A “100 days” post and a partner’s comment.","fmt":"the month","salt":"3061af000b09d313482d9cddf7968ff3","hash":"e83f7cc6d8bec6965a168e27f7c17f019e1c08d66115047916ab9a567c00585b"},{"id":"box","prompt":"What is the name of his main machine / attack box?","where":"A committed dotfile, echoed in an r/homelab thread.","fmt":"one word","salt":"d8d1d930d98a30edbb6b0dce4e8dafd2","hash":"3fa53af437a51f087b8781704f3166cc975229ac21bcb74410006a9d6228a72a"},{"id":"domain","prompt":"What is his home-lab domain?","where":"The dotfiles and the same r/homelab thread.","fmt":"e.g. name.local","salt":"b44979f95f3f89cbcb1d77243b161511","hash":"e5c660b91dcb207e5bd8675e2db330e06bded9a8a0783fc88d696c7377ed0cf2"},{"id":"email","prompt":"What is his personal email address?","where":"His GitHub commit identity gives it away.","fmt":"full email address","salt":"a377a47d1fe07dd5fdc0e7e8531c0d85","hash":"ccb3fb022e4bd8458d085fccb4d8f77b783c92c744cb45d990bc6ceb63344b31"},{"id":"rest","prompt":"Which day of the week is his usual rest day?","where":"Read the weekly pattern in his Pacelog feed.","fmt":"a weekday","salt":"4fe489913857c6518f16b9acfea4cffa","hash":"fdf4696cf7656cbdf09536985a361538d25989aff863f58401ad8e3fd5c283d2"},{"id":"recruit","prompt":"Who is the recruiter that approached him?","where":"The JobHunt messages.","fmt":"first and last name","salt":"ba011e9e4ef5acc0e08c25006adeb11b","hash":"0e4cc90eb396e213a3be60633864b85feb4dc1c6e25707467dc52c2d9cefb67c"},{"id":"firm","prompt":"What company does the recruiter claim to be from?","where":"The JobHunt recruiter profile.","fmt":"one word","salt":"26f421cf6d07e627407ffa6241829095","hash":"24443099749fff493731d8841364eb1ce049b7afd84ad670238dc4095dd83c20"}],"flag":{"salt":"73fdfaf69e5045a44cc5feb030507334","iv":"2a480e57cfcffef93b05e06e","ct":"fabca1ebab337d5f56bcf091fc0de915a263c1ce73d3c7e5633a026ed6790b168e9ce7d337cea30c9c62731356fbe87251bc9507a15a2b4f5297998b8520","iters":150000}};

/* ---- helpers ---- */
function norm(s){
  return String(s).toLowerCase().trim()
    .replace(/[‘’'"`]/g,"")
    .replace(/\s+/g," ")
    .replace(/[.,;:!?]+$/g,"");
}
function hex2buf(h){const a=new Uint8Array(h.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;}
const enc=new TextEncoder();
const STORE="pt_heatmap_q";

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
      '<p class="qw" id="hint-'+q.id+'">'+q.where+'</p>'+
      '<div class="qrow">'+
        '<input class="qin" id="in-'+q.id+'" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="hint-'+q.id+' state-'+q.id+'" placeholder="'+q.fmt+'">'+
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
