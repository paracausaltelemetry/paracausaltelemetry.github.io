"use strict";
/* Clickable game detail. Training exercise only. */
const GAMES = {
  arma3:   { last: "15 May 2026", ach: "412 / 480 achievements", note: "Zeus host. UK milsim sessions most nights." },
  squad:   { last: "18 May 2026", ach: "96 / 140 achievements",  note: "Runs with the same squad most evenings." },
  cs2:     { last: "12 May 2026", ach: "no achievements",        note: "Prime, UK servers." },
  greyhack:{ last: "20 May 2026", ach: "31 / 44 achievements",   note: "Open-world hacking sim." },
  hacknet: { last: "2 Apr 2026",  ach: "18 / 20 achievements",   note: "Terminal hacking sim." },
  tis:     { last: "Jan 2026",    ach: "9 / 30 achievements",    note: "Assembly-language puzzle game." }
};
document.querySelectorAll("#games .game").forEach(btn => {
  btn.addEventListener("click", () => {
    const next = btn.nextElementSibling;
    if (next && next.classList.contains("gdetail")) { next.remove(); return; }
    document.querySelectorAll("#games .gdetail").forEach(d => d.remove());
    const g = GAMES[btn.dataset.g]; if (!g) return;
    const d = document.createElement("div");
    d.className = "gdetail";
    d.innerHTML = "<b>Last played " + g.last + "</b> · 0.0 hrs past 2 weeks<br>" + g.ach + " · " + g.note;
    btn.insertAdjacentElement("afterend", d);
  });
});
