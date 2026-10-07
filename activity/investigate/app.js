"use strict";
/* Operation Heatmap, Part 2 "Unmask the operation". Questions live in the
   shared task panel (../quiz.js); this file only drives the artefact tabs. */

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
