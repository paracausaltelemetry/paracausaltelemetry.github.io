"use strict";
/* Renders a deterministic mock contribution graph. Training exercise only. */
(function () {
  const WEEKS = 53, DAYS = 7, CELL = 14;
  const grid = document.getElementById("grid");
  const monthsEl = document.getElementById("months");
  const countEl = document.getElementById("contribCount");
  if (!grid) return;

  // deterministic PRNG so the graph is stable across loads
  let s = 20260504 >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS - 1) * 7 - today.getDay());

  const level = [], monthForWeek = [];
  let total = 0;
  for (let w = 0; w < WEEKS; w++) {
    const col = new Date(start); col.setDate(start.getDate() + w * 7);
    monthForWeek.push(col.getMonth());
    for (let d = 0; d < DAYS; d++) {
      const day = new Date(col); day.setDate(col.getDate() + d);
      let lvl = 0;
      if (day <= today) {
        const deployed = (w >= 34 && w <= 52);  // away from late spring onward
        const rr = (w >= 44 && w <= 45);         // short spell home mid-tour
        if (deployed && !rr) {
          lvl = rnd() < 0.1 ? 1 : 0;
        } else {
          const weekend = (d === 0 || d === 6);
          const r = rnd();
          lvl = weekend ? (r < 0.5 ? 0 : r < 0.82 ? 1 : 2)
                        : (r < 0.18 ? 0 : r < 0.46 ? 1 : r < 0.73 ? 2 : r < 0.9 ? 3 : 4);
          if (rr) lvl = Math.min(lvl, 2);
        }
      }
      level.push(lvl);
      total += lvl;
    }
  }

  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const lvl = level[w * DAYS + d];
      const c = document.createElement("div");
      c.className = "cell" + (lvl ? " l" + lvl : "");
      grid.appendChild(c);
    }
  }

  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let i = 0;
  while (i < WEEKS) {
    const m = monthForWeek[i];
    let j = i; while (j < WEEKS && monthForWeek[j] === m) j++;
    const cnt = j - i;
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.width = (cnt * CELL - 3) + "px";
    span.textContent = cnt >= 2 ? names[m] : "";
    monthsEl.appendChild(span);
    i = j;
  }

  countEl.textContent = (total * 3).toLocaleString() + " contributions in the last year";
})();
