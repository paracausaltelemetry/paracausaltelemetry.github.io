"use strict";
/* Task drawer behaviour. Open by default on wide screens, closed on narrow
   ones; the reader's last choice is remembered. The edge tab mirrors the
   progress count from the drawer. Esc or the backdrop closes the overlay. */
(function () {
  const drawer = document.getElementById("tasks");
  if (!drawer) return;
  const body = document.body;
  const KEY = "pt_heatmap_tasks_open";
  const wide = window.matchMedia("(min-width:1180px)");
  const toggles = [...document.querySelectorAll("[data-tasks-toggle]")];
  const tab = document.querySelector(".tasks-tab");
  const close = drawer.querySelector(".tasks-close");

  const scrim = document.createElement("div");
  scrim.className = "tasks-scrim";
  scrim.addEventListener("click", () => set(false, true));
  body.appendChild(scrim);

  function saved() {
    try { const v = localStorage.getItem(KEY); return v === null ? null : v === "1"; } catch (e) { return null; }
  }
  function set(open, remember, focus) {
    body.classList.toggle("tasks-open", open);
    toggles.forEach(t => t.setAttribute("aria-expanded", String(open)));
    if (remember) { try { localStorage.setItem(KEY, open ? "1" : "0"); } catch (e) { /* not essential */ } }
    if (focus) (open ? close : tab).focus();
  }
  toggles.forEach(t => t.addEventListener("click", () => set(!body.classList.contains("tasks-open"), true, true)));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && body.classList.contains("tasks-open") && !wide.matches) set(false, true, true);
  });

  /* narrow screens always start closed: the overlay would cover the page */
  set(wide.matches && saved() !== false);

  /* links to #qh (the old answer-sheet anchor) open the drawer instead */
  document.querySelectorAll('a[href="#qh"]').forEach(a => a.addEventListener("click", e => {
    e.preventDefault(); set(true, true, true);
  }));

  /* mirror "n of N correct" into the edge tab */
  const count = document.getElementById("ptext");
  const n = tab && tab.querySelector(".n");
  if (count && n) {
    const sync = () => { const m = count.textContent.match(/(\d+) of (\d+)/); if (m) n.textContent = m[1] + "/" + m[2]; };
    new MutationObserver(sync).observe(count, { childList: true, characterData: true, subtree: true });
    sync();
  }
})();
