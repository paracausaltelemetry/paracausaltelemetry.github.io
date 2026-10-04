"use strict";
/* Clickable post threads. Training exercise only. Posts in document order. */
const THREADS = [
  [ // r/oscp
    { a: "u/sec_student", t: "Which op, if you can say?" },
    { a: "u/j_hollis87", t: "Can't give specifics, but the Baltics, about six months, evenings and rubbish camp wifi only." }
  ],
  [ // r/homelab
    { a: "u/labrat", t: "Nice setup. What's your DC hostname convention?" },
    { a: "u/j_hollis87", t: "Keeping it simple, dc01.hollis.local. Attack box is MORPHEUS. Notes are on my github, same handle." }
  ],
  [ // r/cybersecurity
    { a: "u/blueteam_dad", t: "What's your current role, out of interest?" },
    { a: "u/j_hollis87", t: "Infantry, 3 DALES. Trying to jump ship into a cyber trade before I sign off." }
  ],
  [ // r/running
    { a: "u/fellhead", t: "Whereabouts do you run normally?" },
    { a: "u/j_hollis87", t: "Richmond at weekends, from camp at Catterick in the week. Swaledale Striders." }
  ],
  [ // r/army
    { a: "u/squaddie99", t: "Enjoy Tapa, it's grim in the winter." },
    { a: "u/j_hollis87", t: "Cheers, that's the one. Counting the days already." }
  ]
];

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const posts = [...document.querySelectorAll(".post")];
posts.forEach((post, i) => {
  post.addEventListener("click", () => {
    const body = post.querySelector(".b"); if (!body) return;
    const existing = body.querySelector(".rthread");
    if (existing) { existing.remove(); return; }
    const th = THREADS[i] || [];
    const div = document.createElement("div");
    div.className = "rthread";
    div.innerHTML = th.length
      ? th.map(c => '<div class="rc"><span class="a">' + esc(c.a) + "</span>" + esc(c.t) + "</div>").join("")
      : '<div class="rc">No comments yet.</div>';
    body.appendChild(div);
  });
});
