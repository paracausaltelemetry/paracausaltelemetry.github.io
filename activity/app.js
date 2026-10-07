"use strict";
/* Operation Heatmap launcher: on-site Part 1 questions with client-side
   answer checking. Only salted PBKDF2 hashes are stored for per-question
   feedback; the flag is AES-GCM ciphertext whose key is derived from the
   correct answers, so neither the answers nor the flag appear in source. */

const DATA = {"iters":120000,"questions":[{"id":"name","prompt":"What is the subject’s full name?","salt":"f8efcf3893caa88fff5a2399fdb17bf8","hash":"27f3bcebf981ee3ce1d97592765994054e6da1662923d2957a9cb1dfc54befec"},{"id":"user","prompt":"What username does he reuse across platforms?","salt":"17274e3330b947bb9f88396575aae1ef","hash":"b5526ef32579b2866c261ad5e7eeec45d167cdeb82c69a2cf5d5676f5a81cfc9"},{"id":"town","prompt":"Which town is his home area?","salt":"8b4f1c1c28682343df63b203d207b8e3","hash":"ed62e8e051fbf3008148717e934bc7eb08cf11e5ff886c68cd1a5244fa187020"},{"id":"base","prompt":"Where is he based during the week?","salt":"2fa8d6da26398175f512bed4d1b6fed4","hash":"25041bc0c5a1a7e6f966cbdbcd26575cdd74f8f47aa9ff16bb0d7bf5e27af0f2"},{"id":"club","prompt":"Which running club is he a member of?","salt":"56730f1f899e9604e06344a021826a37","hash":"09b8994df54d70cd2866ade29a0658eac10c85d9418340e4545e2bab79bc02f2"},{"id":"country","prompt":"Which country is he deployed to?","salt":"b3c2b6177716cbcbe7de61efd975b0ff","hash":"f5aba6f51aa99c9427a10273844e9bf2771b3e6394de487b9ea893b88cc5cfc5"},{"id":"camp","prompt":"Which camp is he deployed to?","salt":"4e73c96b6d77acac702babafcb017ea2","hash":"553adf8f25b3591b147aad3e7c269e18aee14059ad606fa38e249bc9bba464ae"},{"id":"home","prompt":"Which month is he due home?","salt":"aa9073acdbb47580b8c89f3549637a40","hash":"4d16c4e7bb4c6e813e3d1d70052f1d58c5ec9a2496d2f9724d465afdfa3fe478"},{"id":"box","prompt":"What is the name of his main machine / attack box?","salt":"168d514e807261660703b02b89049dc3","hash":"a316ac5bc4159e55d239abf88a4c5ff02261e5cd3e3acb58ac2d237812908df8"},{"id":"domain","prompt":"What is his home-lab domain?","salt":"d87c444885633c8db63bede137f0d87a","hash":"9088b5678da1cec6bdeb823167131831a1393404587aeb9c92ff665279420a22"},{"id":"email","prompt":"What is his personal email address?","salt":"1cc732f5167adcb4076e8364eed14acb","hash":"0c09ba48b7e3971ba55975e948a6837c69dd83dee5a720a98b9efbbd28e8fe56"},{"id":"rest","prompt":"Which day of the week is his usual rest day?","salt":"7adfec5d145934903c933550b96ac073","hash":"915b7c04b67c195191549665a0fd5c82a997a52f668bb574fd066a35a5a965da"},{"id":"recruit","prompt":"Who is the recruiter that approached him?","salt":"167974ac7dc0ad269708df611f11ee18","hash":"fa4599047fec014efa7d4c746ba1c09b42998de4998c2032742aa4f14df8d191"},{"id":"firm","prompt":"What company does the recruiter claim to be from?","salt":"06daf45e590b3cf1f062a32fa7831712","hash":"3f6211a9bb81d06830c542d882921fd4575229f92a1b401cd0a1101f686f5400"}],"flag":{"salt":"442bca8dc14fb3ebca1afa73e100ff5f","iv":"e770dbcd32fdc0954e7445b9","ct":"ea5bffa0f961781f8875145b1fc4f22add83882a9f8f1e9ea9c4816aa736e910fa2e8922c0bcf898d3403851c09681841783b82b32b88bfd84b8e4792a77","iters":150000}};

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
  /* each task is its own little form: type, then Submit or Enter */
  const row=document.createElement("form");row.className="q";row.dataset.id=q.id;row.noValidate=true;
  row.innerHTML=
    '<div class="qn">'+String(i+1).padStart(2,"0")+'</div>'+
    '<div class="qmain">'+
      '<label class="qp" for="in-'+q.id+'">'+q.prompt+'</label>'+
      '<div class="qrow">'+
        '<input class="qin" id="in-'+q.id+'" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="state-'+q.id+'" aria-label="Answer">'+
        '<span class="qmark" aria-hidden="true"></span>'+
        '<button type="submit" class="qsub">Submit</button>'+
      '</div>'+
      '<span class="qstate" id="state-'+q.id+'"></span>'+
    '</div>';
  list.appendChild(row);
  const input=row.querySelector(".qin");
  if(state[q.id]) input.value=state[q.id];
  const mark=row.querySelector(".qmark");
  const stateEl=row.querySelector(".qstate");
  const sub=row.querySelector(".qsub");
  const lock=on=>{input.readOnly=on;sub.disabled=on;sub.textContent=on?"Solved":"Submit";};
  let seq=0;
  const check=async()=>{
    const v=input.value;state[q.id]=v;save();
    const mine=++seq;
    if(!norm(v)){row.classList.remove("ok","no","checking");mark.textContent="";stateEl.textContent="";solved[q.id]=false;input.removeAttribute("aria-invalid");lock(false);updateProgress();return;}
    row.classList.add("checking");row.classList.remove("ok","no");mark.textContent="";
    const h=await deriveHashHex(norm(v),q.salt,DATA.iters);
    if(mine!==seq) return;
    const good=h===q.hash;
    solved[q.id]=good;
    row.classList.remove("checking");
    row.classList.toggle("ok",good);row.classList.toggle("no",!good);
    mark.textContent=good?"✓":"✗";
    stateEl.textContent=good?"Correct":"Incorrect, try again";
    input.setAttribute("aria-invalid",good?"false":"true");
    lock(good);
    updateProgress();
  };
  row.addEventListener("submit",e=>{e.preventDefault();check();});
  input.addEventListener("input",()=>{state[q.id]=input.value;save();if(row.classList.contains("no")){row.classList.remove("no");mark.textContent="";stateEl.textContent="";}});
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
  document.querySelectorAll(".q").forEach(r=>{r.classList.remove("ok","no","checking");const i=r.querySelector(".qin");i.value="";i.readOnly=false;i.removeAttribute("aria-invalid");const b=r.querySelector(".qsub");if(b){b.disabled=false;b.textContent="Submit";}r.querySelector(".qmark").textContent="";r.querySelector(".qstate").textContent="";});
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
