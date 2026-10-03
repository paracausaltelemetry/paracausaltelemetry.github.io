"use strict";

/* Weighted-overlap attribution demo. Fictional actor, public-reporting group patterns, for training only. */

// Technique weights. Generic techniques every crew shares count 1; motive and
// infrastructure signals that actually discriminate count more.
const W = {
  R1:1, R2:1, R3:2,
  P1:1, P2:2, P3:3, P4:3, P5:1,
  C1:1, C2:1, C3:2, C4:2, C5:1,
  O1:2, O2:3, O3:3, O4:3, O5:2, O6:3, O7:3
};

const LABEL = {
  R1:"military target selection", R2:"OSINT-tailored approach", R3:"clearance-led selection",
  P1:"fake recruiter personas", P2:"reused photo/bio", P3:"lookalike domain", P4:"fake careers portal", P5:"fresh thin accounts",
  C1:"unsolicited job approach", C2:"targeted flattery", C3:"too-good package", C4:"time pressure", C5:"fast move off-platform",
  O1:"requests ID documents", O2:"themed document lure", O3:"archive / enable-macros", O4:"credential portal harvest", O5:"probes operational detail", O6:"financial / fraud payoff", O7:"intelligence collection"
};

// Distinctive = weight 3. Used to explain WHY a match ranks where it does.
const isDistinctive = id => W[id] >= 3;

const GROUPS = [
  { key:"lazarus", name:"Lazarus (Operation Dream Job pattern)", nexus:"reported North Korea nexus",
    profile:["R1","R2","R3","P1","P2","P4","P5","C1","C2","C3","C5","O2","O3","O5","O7"] },
  { key:"charming", name:"Charming Kitten (APT35 pattern)", nexus:"reported Iran nexus",
    profile:["R1","R2","P1","P3","P4","P5","C1","C2","C5","O1","O4","O5","O7"] },
  { key:"fraud", name:"Organised identity-fraud crew", nexus:"non-state, financially motivated",
    profile:["P1","P2","P3","C1","C3","C4","C5","O1","O6"] },
  { key:"apt36", name:"Transparent Tribe (APT36 pattern)", nexus:"reported Pakistan nexus",
    profile:["R1","R2","P1","P5","C1","C2","C5","O2","O5","O7"] },
  { key:"apt28", name:"Fancy Bear (APT28 pattern)", nexus:"reported Russia nexus",
    profile:["R1","R2","P3","P4","C1","O4","O5","O7"] }
];

const wsum = ids => ids.reduce((a,id)=>a+(W[id]||0),0);

function score(selected, profile){
  const sel = new Set(selected), prof = new Set(profile);
  const inter = [...sel].filter(id => prof.has(id));
  const union = new Set([...selected, ...profile]);
  const pct = union.size ? Math.round(100 * wsum(inter) / wsum([...union])) : 0;
  const sharedDistinct = inter.filter(isDistinctive);
  const sharedGeneric = inter.filter(id => !isDistinctive(id));
  const gaps = [...prof].filter(id => !sel.has(id)); // in the group's pattern, not observed
  return { pct, inter, sharedDistinct, sharedGeneric, gaps };
}

const ids = Object.keys(W);
const boxes = ids.map(id => ({ id, el: document.getElementById("ttp-"+id) }));
const results = document.getElementById("results");
const verdict = document.getElementById("verdict");
const countEl = document.getElementById("count");

function selected(){ return boxes.filter(b => b.el && b.el.checked).map(b => b.id); }

function tag(id, cls){ return '<span class="tag '+cls+'">'+id+'</span>'; }

function render(){
  const sel = selected();
  countEl.textContent = sel.length + (sel.length === 1 ? " technique selected" : " techniques selected");

  if(!sel.length){
    results.innerHTML = '<p class="empty">Select techniques on the left to see matches.</p>';
    verdict.hidden = true;
    return;
  }

  const ranked = GROUPS
    .map(g => ({ g, ...score(sel, g.profile) }))
    .sort((a,b) => b.pct - a.pct);

  results.innerHTML = ranked.map((r,i) => {
    const distinct = r.sharedDistinct.length
      ? '<div class="break"><b>Distinctive overlap:</b> ' + r.sharedDistinct.map(id=>tag(id,"d")).join("") + '</div>'
      : '<div class="break"><b>Distinctive overlap:</b> none. The match rests on generic techniques only.</div>';
    const generic = r.sharedGeneric.length
      ? '<div class="break"><b>Shared but generic:</b> ' + r.sharedGeneric.map(id=>tag(id,"g")).join("") + '</div>'
      : '';
    const gaps = r.gaps.length
      ? '<div class="break"><b>In this pattern, not observed:</b> ' + r.gaps.map(id=>tag(id,"x")).join("") + '</div>'
      : '<div class="break"><b>In this pattern, not observed:</b> nothing, every signature technique is present.</div>';
    return (
      '<div class="res'+(i===0?" top":"")+'">'+
        '<div class="h"><span class="nm">'+r.g.name+' <span class="nx">'+r.g.nexus+'</span></span><span class="pc">'+r.pct+'%</span></div>'+
        '<div class="bar"><span style="width:'+r.pct+'%"></span></div>'+
        distinct + generic + gaps +
      '</div>'
    );
  }).join("");

  verdict.hidden = false;
}

boxes.forEach(b => b.el && b.el.addEventListener("change", render));
const clearBtn = document.getElementById("clear");
if(clearBtn) clearBtn.addEventListener("click", () => { boxes.forEach(b => { if(b.el) b.el.checked = false; }); render(); });

render();
