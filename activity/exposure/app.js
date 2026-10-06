"use strict";
/* Operation Heatmap, Part 3 "Operator exposure": on-site questions, same
   client-side scheme as Parts 1-2. Salted PBKDF2 hashes give per-question
   feedback; the third flag is AES-GCM ciphertext keyed off the answers. */

const DATA = {"iters":120000,"questions":[{"id":"panel","prompt":"Which host is the crew's hidden admin panel?","salt":"d8df24c35701db3e6607a613550f59a1","hash":"78398ddafef77f79d57ee0dde91c042dc0ade4c726588d3f2777ea0e54cff9bc"},{"id":"panel_lead","prompt":"How many days before the Apex domain was registered was the panel given its certificate?","salt":"440fe1b23260621658c86ec228728138","hash":"89ec53be8c82310156a59c3e3463b450da5777dba08f608ef95bbaa52e8eae2a"},{"id":"cert_link","prompt":"Which certificate ID first ties the crew's own domain to its analytics host?","salt":"a22409c0ed28800e9f48cd7a363d53f8","hash":"35974669f1053b21b628c38edab7b63043e4bb96a483a8de622b553b8569dd48"},{"id":"endpoint","prompt":"Where does stolen candidate data end up? Give the host.","salt":"59946e1d26d649e585d84e87c43e3011","hash":"71cca309b42c4e57e0f615b43e5d5d20b8f2eeb0e098a0e83c383b3752c022b1"},{"id":"campaign","prompt":"What internal tag did the crew file this campaign under?","salt":"51081a19d1eb04ccdc9f8baf99226b57","hash":"9b32083c4da4123f649a5696fbaa4138297d235c941ee39cdae01c5ad4e604f7"},{"id":"alias","prompt":"What earlier handle did the operator use?","salt":"00ae4863939a71e2f602056f047e8f85","hash":"8d77ab113c319b63d7ee18b78e38994f643e4a0f0e8da01a779e5b55f1312917"},{"id":"wallet","prompt":"What is the operator's full escrow address?","salt":"cb075d730a8f015d97fbcb5f7c74ef60","hash":"8dfc12a868e7778fcef1891d1828e3fc24403c2d4d2f5a928e81c155f13e9416"},{"id":"campaigns","prompt":"How many recruiter brands can you prove paid out to the crew?","salt":"482f670571c27b00b9261d4315bf8086","hash":"845dc125d3aaf62eafccdafa048ff8f1333ef8d2df836a94943291855218b0a8"},{"id":"excluded","prompt":"Which brand on the crew's host can you not tie to the crew's money? Give the domain.","salt":"247bcc3bfd572e0f8c64e9277fb35cd1","hash":"7573e1d61ec0d49984ef25c8fab955752c8983afaebe6a01937e3b22a6577dcb"},{"id":"region","prompt":"From which country does the operator work?","salt":"0774da0e1be2882526ca7181e76b4544","hash":"8ad4acfed68e688ec443c01016015e9f20b433eee1b8173cb961e9d7b6b23172"}],"flag":{"salt":"16a6f84c4d99343cc28b819528e80c29","iv":"5ccf83ae6123bd46350c96be","ct":"3ade323d93f3b801c6957753968290978df4f0e91f419141de8e1a348c4184d20bb0961aec4f9091eb4915","iters":150000}};
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

/* ---- Lead 07, the stash: optional bonus flag ----
   Checked against its own salted hash only; it is not part of the Part 3 flag
   key, so the main flag never depends on it. Saved with the other answers. */
const BONUS={"salt":"4b86ea17adddf7c7df3742d0235b3d77","hash":"beb3d85a109232a233730aa5dc49aef53b0ea3f0f1ce2193e1512794eccb2d26"};
const bonusIn=document.getElementById("bonus-in");
if(bonusIn){
  const row=bonusIn.closest(".q"),mark=row.querySelector(".qmark"),stateEl=document.getElementById("bonus-state");
  let seq=0;
  const check=async()=>{
    const v=bonusIn.value;state.bonus=v;save();
    const mine=++seq;
    if(!norm(v)){row.classList.remove("ok","no","checking");mark.textContent="";stateEl.textContent="";bonusIn.removeAttribute("aria-invalid");return;}
    row.classList.add("checking");row.classList.remove("ok","no");mark.textContent="";
    const h=await deriveHashHex(norm(v),BONUS.salt,DATA.iters);
    if(mine!==seq) return;
    const good=h===BONUS.hash;
    row.classList.remove("checking");
    row.classList.toggle("ok",good);row.classList.toggle("no",!good);
    mark.textContent=good?"✓":"✗";
    stateEl.textContent=good?"Stash cracked":"Not yet";
    bonusIn.setAttribute("aria-invalid",good?"false":"true");
  };
  bonusIn.addEventListener("change",check);
  bonusIn.addEventListener("blur",check);
  if(state.bonus){bonusIn.value=state.bonus;queueMicrotask(check);}
}
