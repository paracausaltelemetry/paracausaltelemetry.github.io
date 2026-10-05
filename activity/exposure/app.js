"use strict";
/* Operation Heatmap, Part 3 "Operator exposure": on-site questions, same
   client-side scheme as Parts 1-2. Salted PBKDF2 hashes give per-question
   feedback; the third flag is AES-GCM ciphertext keyed off the answers. */

const DATA = {"iters":120000,"questions":[{"id":"panel","prompt":"The crew's live collection domain exposes more than its operators meant. In its certificate-transparency log, which host is the hidden admin panel?","salt":"d8df24c35701db3e6607a613550f59a1","hash":"78398ddafef77f79d57ee0dde91c042dc0ade4c726588d3f2777ea0e54cff9bc"},{"id":"endpoint","prompt":"The leaked portal config points stolen data somewhere. What host does it exfiltrate to?","salt":"59946e1d26d649e585d84e87c43e3011","hash":"71cca309b42c4e57e0f615b43e5d5d20b8f2eeb0e098a0e83c383b3752c022b1"},{"id":"campaign","prompt":"What internal campaign tag is baked into the beacon script?","salt":"51081a19d1eb04ccdc9f8baf99226b57","hash":"9b32083c4da4123f649a5696fbaa4138297d235c941ee39cdae01c5ad4e604f7"},{"id":"alias","prompt":"The operator signed an older paste under a different name, with the same PGP key. What was that earlier handle?","salt":"00ae4863939a71e2f602056f047e8f85","hash":"8d77ab113c319b63d7ee18b78e38994f643e4a0f0e8da01a779e5b55f1312917"},{"id":"campaigns","prompt":"The fraud report ties the crew's reused escrow address to how many named recruiter brands?","salt":"482f670571c27b00b9261d4315bf8086","hash":"845dc125d3aaf62eafccdafa048ff8f1333ef8d2df836a94943291855218b0a8"},{"id":"region","prompt":"From which country does the crew operate?","salt":"0774da0e1be2882526ca7181e76b4544","hash":"8ad4acfed68e688ec443c01016015e9f20b433eee1b8173cb961e9d7b6b23172"}],"flag":{"salt":"364f4e273aba4f0d8dd14abd1379bbb8","iv":"eb1ab0adc4106439049cf094","ct":"9c7a8cfbe7d1e884bf5e36469526be935e69018f03de75b24374da34bdcf22fdc324a0a1553cdb42f88239","iters":150000}};
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
const STORE="pt_heatmap_q3";

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
