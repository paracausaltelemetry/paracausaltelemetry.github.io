"use strict";
/* ATT&CK-style attribution matrix. Fictional actor, public-reporting patterns, training only. */

const W = {
  R1:1, R2:1, R3:2,
  P1:1, P2:2, P3:3, P4:3, P5:1,
  C1:1, C2:1, C3:2, C4:2, C5:1,
  O1:2, O2:3, O3:3, O4:3, O5:2, O6:3, O7:3
};
const isDistinctive = id => W[id] >= 3;

const GROUPS = [
  { key:"lazarus", name:"Lazarus (Operation Dream Job)", nexus:"reported North Korea nexus",
    profile:["R1","R2","R3","P1","P2","P4","P5","C1","C2","C3","C5","O2","O3","O5","O7"] },
  { key:"charming", name:"Charming Kitten (APT35)", nexus:"reported Iran nexus",
    profile:["R1","R2","P1","P3","P4","P5","C1","C2","C5","O1","O4","O5","O7"] },
  { key:"fraud", name:"Organised identity-fraud crew", nexus:"non-state, financially motivated",
    profile:["P1","P2","P3","C1","C3","C4","C5","O1","O6"] },
  { key:"apt36", name:"Transparent Tribe (APT36)", nexus:"reported Pakistan nexus",
    profile:["R1","R2","P1","P5","C1","C2","C5","O2","O5","O7"] },
  { key:"apt28", name:"Fancy Bear (APT28)", nexus:"reported Russia nexus",
    profile:["R1","R2","P3","P4","C1","O4","O5","O7"] }
];

const wsum = ids => ids.reduce((a, id) => a + (W[id] || 0), 0);

function score(selected, profile) {
  const sel = new Set(selected), prof = new Set(profile);
  const inter = [...sel].filter(id => prof.has(id));
  const union = new Set([...selected, ...profile]);
  const pct = union.size ? Math.round(100 * wsum(inter) / wsum([...union])) : 0;
  return {
    pct,
    sharedDistinct: inter.filter(isDistinctive),
    gaps: [...prof].filter(id => !sel.has(id))
  };
}

const cells = [...document.querySelectorAll(".cell")];
const results = document.getElementById("results");
const verdict = document.getElementById("verdict");
const countEl = document.getElementById("count");
const tag = (id, cls) => '<span class="tag ' + cls + '">' + id + "</span>";

function selected() { return cells.filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.dataset.ttp); }

function render() {
  const sel = selected();
  countEl.textContent = sel.length + (sel.length === 1 ? " technique selected" : " techniques selected");
  if (!sel.length) {
    results.innerHTML = '<p class="empty">Select techniques to rank known patterns.</p>';
    verdict.hidden = true;
    return;
  }
  const ranked = GROUPS.map(g => ({ g, ...score(sel, g.profile) })).sort((a, b) => b.pct - a.pct);
  results.innerHTML = ranked.map((r, i) => {
    const distinct = r.sharedDistinct.length
      ? '<div class="break"><b>Distinctive overlap:</b> ' + r.sharedDistinct.map(id => tag(id, "d")).join("") + "</div>"
      : '<div class="break"><b>Distinctive overlap:</b> none. Generic techniques only.</div>';
    const gaps = r.gaps.length
      ? '<div class="break"><b>In this pattern, not seen:</b> ' + r.gaps.map(id => tag(id, "x")).join("") + "</div>"
      : "";
    return '<div class="res' + (i === 0 ? " top" : "") + '">' +
      '<div class="h"><span class="nm">' + r.g.name + '<span class="nx">' + r.g.nexus + '</span></span><span class="pc">' + r.pct + '%</span></div>' +
      '<div class="bar"><span style="width:' + r.pct + '%"></span></div>' +
      (i === 0 ? distinct + gaps : "") +
    "</div>";
  }).join("");
  verdict.hidden = false;
}

cells.forEach(c => c.addEventListener("click", () => {
  c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true");
  render();
}));
const clearBtn = document.getElementById("clear");
if (clearBtn) clearBtn.addEventListener("click", () => {
  cells.forEach(c => c.setAttribute("aria-pressed", "false"));
  render();
});
render();
