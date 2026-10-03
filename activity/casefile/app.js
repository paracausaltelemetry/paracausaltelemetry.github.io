"use strict";

/* Analyst casefile. Autosaves to localStorage on this browser only. No upload. */

const KEY = "heatmap_casefile_v1";
const fields = [...document.querySelectorAll("[data-k]")];
const savedEl = document.getElementById("saved");

function load(){
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch(e) { data = {}; }
  fields.forEach(f => { if(data[f.dataset.k] != null) f.value = data[f.dataset.k]; });
  // Default the date to today if empty.
  const d = document.getElementById("date");
  if(d && !d.value){
    try {
      d.value = new Date().toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"});
    } catch(e){}
  }
}

let t;
function save(){
  const data = {};
  fields.forEach(f => data[f.dataset.k] = f.value);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    stamp("Saved");
  } catch(e) {
    stamp("Could not save in this browser");
  }
}
function stamp(msg){
  savedEl.textContent = msg + " · " + new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

fields.forEach(f => f.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 400); }));

function asText(){
  const g = id => (document.getElementById(id) || {}).value || "";
  return [
    "OPERATION HEATMAP — ANALYST CASEFILE",
    "",
    "Analyst / team: " + g("analyst"),
    "Date: " + g("date"),
    "Reference: " + g("ref"),
    "",
    "ASSESSMENT (BLUF)",
    g("bluf"),
    "",
    "OBSERVED TTPs",
    g("ttps"),
    "",
    "ATTRIBUTION",
    "Leading hypothesis: " + g("hyp"),
    "Confidence: " + g("conf"),
    "Reason / what would change it: " + g("confwhy"),
    "Competing hypothesis: " + g("alt"),
    "Limits of attribution: " + g("limit"),
    "",
    "PROTECTIVE RECOMMENDATION",
    g("protect"),
    "",
    "VERDICT",
    g("verdict"),
    ""
  ].join("\n");
}

const expBtn = document.getElementById("export");
if(expBtn) expBtn.addEventListener("click", () => {
  const blob = new Blob([asText()], {type:"text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "heatmap-casefile.txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const printBtn = document.getElementById("print");
if(printBtn) printBtn.addEventListener("click", () => window.print());

const resetBtn = document.getElementById("reset");
if(resetBtn) resetBtn.addEventListener("click", () => {
  if(!confirm("Clear the whole casefile on this browser? This cannot be undone.")) return;
  try { localStorage.removeItem(KEY); } catch(e){}
  fields.forEach(f => f.value = "");
  stamp("Cleared");
  load();
});

load();
