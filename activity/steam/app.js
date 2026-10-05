"use strict";
/* Clickable game detail. Training exercise only. */
const GAMES = {
  arma3:    { last: "15 May 2026", ach: "412 / 480 achievements", note: "Zeus host. UK milsim sessions most nights." },
  squad:    { last: "18 May 2026", ach: "96 / 140 achievements",  note: "Runs with the same squad most evenings." },
  rl:       { last: "19 May 2026", ach: "61 / 88 achievements",   note: "Casual 2s with mates." },
  cs2:      { last: "12 May 2026", ach: "no achievements",        note: "Prime, UK servers." },
  fm:       { last: "8 May 2026",  ach: "no achievements",        note: "Non-League to the Prem save, again." },
  bg3:      { last: "10 May 2026", ach: "40 / 54 achievements",   note: "Durge run, never finished it." },
  sdv:      { last: "Mar 2026",    ach: "28 / 40 achievements",   note: "Winding-down game." },
  dbd:      { last: "Feb 2026",    ach: "22 / 255 achievements",  note: "Only with Kerry." },
  greyhack: { last: "20 May 2026", ach: "31 / 44 achievements",   note: "Open-world hacking sim." },
  hacknet:  { last: "2 Apr 2026",  ach: "18 / 20 achievements",   note: "Terminal hacking sim." },
  valheim:  { last: "Dec 2025",    ach: "11 / 54 achievements",   note: "Shared world with the section, abandoned." },
  tis:      { last: "Jan 2026",    ach: "9 / 30 achievements",    note: "Assembly-language puzzle game." }
};
const buttons = [...document.querySelectorAll("#games .game")];
buttons.forEach(btn => {
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    document.querySelectorAll("#games .gdetail").forEach(d => d.remove());
    buttons.forEach(b => b.setAttribute("aria-expanded", "false"));
    if (open) return;
    const g = GAMES[btn.dataset.g]; if (!g) return;
    const d = document.createElement("div");
    d.className = "gdetail";
    const b = document.createElement("b");
    b.textContent = "Last played " + g.last;
    d.append(b, " · 0.0 hrs past 2 weeks", document.createElement("br"), g.ach + " · " + g.note);
    btn.insertAdjacentElement("afterend", d);
    btn.setAttribute("aria-expanded", "true");
  });
});

/* guest-view interactions */
const add = document.getElementById("addFriend");
if (add) add.addEventListener("click", () => {
  const on = add.getAttribute("aria-pressed") !== "true";
  add.setAttribute("aria-pressed", String(on));
  add.textContent = on ? "Invite Sent" : "Add Friend";
  if (window.mock) window.mock.toast(on ? "Friend invite sent to Jammy_H" : "Friend invite cancelled");
});
const topBtn = document.querySelector("[data-top]");
if (topBtn) topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
document.querySelectorAll(".fr, .grp").forEach(el => {
  const name = (el.querySelector(".n") || el).childNodes[0].textContent.trim();
  const isFriend = el.classList.contains("fr");
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("data-mock-title", name);
  el.setAttribute("data-mock", isFriend ? "This profile is private." : "Group and badge pages open outside this profile and are not part of the exercise.");
  el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
});
