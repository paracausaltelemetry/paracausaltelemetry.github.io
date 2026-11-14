// Seasonal dress for the homepage hero card. Two themes (each with a dark and
// a light side) that the card can wear. Nothing outside the hero card
// changes, and the card is the standard one until a visitor picks a dress.
//
// The way in is a question-mark button in the corner of the card. It raises a
// dock of the emblems, runs a highlight along them, slows, and settles on
// one at random; pressing it again deals another. An emblem can also be picked
// directly, and "Standard" puts the ordinary card back.
//
// The choice lives in localStorage under "pt_dress" (a dress id, or absent for
// the standard card).
//
// A dress is /seasonal.css (the card's palette and layout) plus its art,
// /src/seasonal/<id>.svg, drawn by scripts/build-seasonal-art.py and inlined
// into the card so the stylesheet can colour and animate it. HMS Victory is a
// pixel scene behind the usual title and buttons. Skyfall is tartan and one
// emblem set in type that pulses, with the card to itself (the title stays
// in the document for assistive technology but the copy is not drawn). Both
// files are only requested while a dress is on. The inline first-paint script
// is pinned by a CSP hash and knows nothing about dresses, so a saved dress is
// applied here, as early as a module can run.

const STORAGE_KEY = "pt_dress";
const STYLESHEET = "/seasonal.css?v=dress12";
const sceneUrl = (id) => `/src/seasonal/${id}.svg?v=dress12`;

// The selector emblems are pixel art on a 32 by 32 grid, one string per row:
//   "#" ink (--text)   "o" accent (--accent-blue)   "+" shade (--muted)   "." empty
const TONES = { "#": "ink", o: "accent", "+": "shade" };

const pixelSvg = (rows) => {
  const rects = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const tone = TONES[row[x]];
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end += 1;
      if (tone) rects.push(`<rect class="dress-px-${tone}" x="${x}" y="${y}" width="${end - x}" height="1"/>`);
      x = end;
    }
  });
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join("")}</svg>`;
};

export const DRESSES = [
  {
    id: "navy",
    name: "HMS Victory",
    motto: "England expects · Trafalgar 1805",
    // Killick: the fouled anchor, a cable wound round the shank.
    art: [
      "..............####..............",
      ".............######.............",
      "............###..##o............",
      "............##....#ooo..........",
      "............##....##.oooo.......",
      "............###..###...oo.......",
      ".............######.....o.......",
      "..............####......oo......",
      ".......##.....#++#.....ooo......",
      ".......########++######oo.......",
      ".......#++++++++++++++oo#.......",
      ".......########++####ooo#.......",
      ".......##.....#++#ooooo##.......",
      ".....#........oooo........#.....",
      ".....##......ooo+#.......##.....",
      "....###....oooo++#.......###....",
      "....#+##..ooo.#++#......##+#....",
      "...##++##.oo..#++#.....##++##...",
      "...#++++##oo..#++#....##++++#...",
      "..##+++++#.o..#++#....#+++++##..",
      "..#++++####oo.#++#...####++++#..",
      ".#####+#...oo.#++#......#+#####.",
      ".....#+#...ooo#++#......#+#.....",
      ".....####.....ooo#.....####.....",
      "......###.....#+ooo....###......",
      ".......####...#++#oooo###.......",
      "........#####.#++#.#oo##........",
      ".........##+###++###+oo.........",
      "..........####++++###oo.........",
      ".............##++##.............",
      "..............####..............",
      "...............##..............."
    ]
  },
  {
    id: "skyfall",
    name: "Skyfall",
    // A royal stag, head on.
    art: [
      "......oo...............oo.......",
      "......o.................o.......",
      "....ooo.................oo......",
      "...ooo....oo.......oo....oo.....",
      "....ooo...oo.......oo....ooo....",
      ".....ooo.oo.........oo..ooo.....",
      "..oooooo.oo.........oo..oo......",
      "..o...ooooo.........oo.ooooooo..",
      ".......ooo...........oooo....o..",
      "........oo...........ooo........",
      "......o..o...........oo.........",
      "......oooooo........oo...o......",
      "..........oo........oooooo......",
      ".....#....oo.......oo.....#.....",
      ".....###...o.......o....###.....",
      "....##+###.oo#####oo#.###+##....",
      "....###++###++++++++###++###....",
      "......##++++++++++++++++##......",
      ".......###++++++++++++###.......",
      ".........##++++++++++##.........",
      "..........#++++++++++#..........",
      "..........##+#++++#+##..........",
      "...........#++++++++#...........",
      "...........#++++++++#...........",
      "...........##++++++##...........",
      "............#++++++#............",
      "............#++++++#............",
      "............#+####+#............",
      "............########............",
      ".............######.............",
      ".............######.............",
      "................................"
    ]
  }
];

const byId = (id) => DRESSES.find((dress) => dress.id === id) || null;

const readPreference = () => {
  try {
    return byId(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return null;
  }
};

const writePreference = (dress) => {
  try {
    if (dress) localStorage.setItem(STORAGE_KEY, dress.id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    /* storage disabled: the choice lasts for this page only */
  }
};

const ensureStylesheet = () => {
  if (document.querySelector("link[data-dress-sheet]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.dressSheet = "";
  document.head.append(link);
};

const scenes = new Map();
const loadScene = (id) => {
  if (!scenes.has(id)) {
    scenes.set(
      id,
      fetch(sceneUrl(id))
        .then((response) => (response.ok ? response.text() : ""))
        .catch(() => "")
    );
  }
  return scenes.get(id);
};

const applyDress = (dress) => {
  const card = document.getElementById("hero-card");
  if (!card) return;
  const root = document.documentElement;
  card.querySelectorAll(".dress-motto").forEach((node) => node.remove());
  const stale = card.querySelector(".dress-scene");
  if (!dress) {
    stale?.remove();
    delete root.dataset.dress;
  } else {
    ensureStylesheet();
    root.dataset.dress = dress.id;

    // A badge and a motto above the title, for the dresses that have them.
    const copy = card.querySelector(".hero-copy");
    if (dress.badge && dress.motto) {
      const badge = document.createElement("div");
      badge.className = "dress-motto dress-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = pixelSvg(dress.badge);
      copy?.prepend(badge);
    }
    if (dress.motto) {
      const motto = document.createElement("p");
      motto.className = "dress-motto";
      motto.textContent = dress.motto;
      copy?.insertBefore(motto, copy.querySelector("h1"));
    }

    if (stale?.dataset.dress !== dress.id) {
      stale?.remove();
      const scene = document.createElement("div");
      scene.className = "dress-scene";
      scene.dataset.dress = dress.id;
      scene.setAttribute("aria-hidden", "true");
      card.querySelector(".hero-dither")?.after(scene);
      // The scene is a static file from this origin, written by the build script.
      loadScene(dress.id).then((svg) => {
        if (scene.isConnected && svg.startsWith("<svg")) scene.innerHTML = svg;
      });
    }
  }
  // A body class as well: hero-dither.js re-reads its colour on body class changes.
  DRESSES.forEach(({ id }) => document.body.classList.toggle(`dress-${id}`, dress?.id === id));
};

// Wear a saved dress as soon as this module is evaluated, before DOMContentLoaded.
applyDress(readPreference());

// ── The dock ─────────────────────────────────────────────────────────────────

const DOCK_STYLE = `
.dress-riddle{position:absolute;left:clamp(.9rem,2vw,1.4rem);bottom:clamp(.9rem,2vw,1.4rem);z-index:2;display:grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;border:1px solid var(--line-strong);border-radius:0;color:var(--text);background:color-mix(in srgb,var(--bg) 80%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);cursor:pointer;transition:border-color 180ms ease,background-color 180ms ease}
.dress-riddle:hover,.dress-riddle:focus-visible{border-color:var(--text);background:var(--bg)}
.dress-riddle svg{width:20px;height:20px;transition:transform 520ms cubic-bezier(.22,1,.36,1)}
.dress-riddle:hover svg,.dress-riddle[aria-expanded="true"] svg{transform:rotate(-12deg) scale(1.12)}
.dress-px-ink{fill:var(--text)}.dress-px-accent{fill:var(--accent-blue)}.dress-px-shade{fill:var(--muted);opacity:.5}.dress-px-riddle{fill:currentColor}
.dress-dock{position:fixed;left:50%;bottom:max(1.5rem,env(safe-area-inset-bottom));z-index:60;display:grid;justify-items:center;gap:.7rem;transform:translate(-50%,1.75rem) scale(.94);transform-origin:50% 100%;opacity:0;pointer-events:none;transition:transform 520ms cubic-bezier(.22,1,.36,1),opacity 320ms ease}
.dress-dock.is-open{transform:translate(-50%,0) scale(1);opacity:1;pointer-events:auto}
.dress-dock-label{margin:0;padding:.35rem .8rem;border-radius:999px;color:var(--text);font:600 .72rem/1.3 var(--font-mono);letter-spacing:.14em;text-transform:uppercase;background:color-mix(in srgb,var(--bg) 78%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);opacity:0;transform:translateY(.4rem);transition:opacity 280ms ease,transform 420ms cubic-bezier(.22,1,.36,1)}
.dress-dock-label.is-shown{opacity:1;transform:none}
.dress-dock-shelf{display:flex;align-items:flex-end;gap:.55rem;padding:.6rem .7rem;border:1px solid color-mix(in srgb,var(--text) 16%,transparent);border-radius:1.4rem;background:color-mix(in srgb,var(--bg) 58%,transparent);-webkit-backdrop-filter:blur(26px) saturate(1.7);backdrop-filter:blur(26px) saturate(1.7);box-shadow:0 18px 50px -18px rgba(0,0,0,.55),inset 0 1px 0 color-mix(in srgb,var(--text) 10%,transparent)}
.dress-dock-tile{position:relative;display:grid;place-items:center;width:3.4rem;height:3.4rem;padding:0;border:1px solid color-mix(in srgb,var(--text) 12%,transparent);border-radius:.95rem;color:var(--text);background:color-mix(in srgb,var(--text) 7%,transparent);cursor:pointer;transform:translateY(var(--lift,0)) scale(var(--grow,1));transform-origin:50% 100%;transition:transform 340ms cubic-bezier(.22,1,.36,1),border-color 240ms ease,background-color 240ms ease;will-change:transform}
.dress-dock-tile svg{width:32px;height:auto;max-height:40px}
.dress-dock-tile::after{content:"";position:absolute;left:50%;bottom:-.42rem;width:.28rem;height:.28rem;border-radius:50%;background:var(--text);opacity:0;transform:translateX(-50%) scale(.4);transition:opacity 260ms ease,transform 420ms cubic-bezier(.22,1,.36,1)}
.dress-dock-tile[aria-pressed="true"]{border-color:color-mix(in srgb,var(--text) 46%,transparent);background:color-mix(in srgb,var(--text) 14%,transparent)}
.dress-dock-tile[aria-pressed="true"]::after{opacity:1;transform:translateX(-50%) scale(1)}
.dress-dock-tile:focus-visible,.dress-dock-plain:focus-visible{outline:2px solid var(--text);outline-offset:3px}
.dress-dock-rule{align-self:center;width:1px;height:2.2rem;background:color-mix(in srgb,var(--text) 18%,transparent)}
.dress-dock-plain{align-self:center;min-height:2.75rem;padding:0 .8rem;border:0;border-radius:.8rem;color:var(--muted);font:600 .68rem/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;background:transparent;cursor:pointer;transition:color 200ms ease,background-color 200ms ease}
.dress-dock-plain:hover{color:var(--text);background:color-mix(in srgb,var(--text) 8%,transparent)}
@media (max-width:520px){.dress-dock-shelf{gap:.4rem;padding:.5rem .55rem}.dress-dock-tile{width:2.9rem;height:2.9rem}.dress-dock-plain{padding:0 .5rem}}
@media (prefers-reduced-motion:reduce){.dress-dock,.dress-dock-tile,.dress-dock-label,.dress-riddle svg{transition-duration:1ms}}
@media print{.dress-riddle,.dress-dock{display:none}}
`;

// A question mark, drawn on the same grid as the emblems.
const RIDDLE = [
  "..??????..",
  ".????????.",
  "???....???",
  "???....???",
  ".......???",
  "......???.",
  ".....???..",
  "....???...",
  "....???...",
  "..........",
  "....???...",
  "....???..."
];

const riddleSvg = () => {
  const rects = [];
  RIDDLE.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "?") rects.push(`<rect class="dress-px-riddle" x="${x}" y="${y}" width="1" height="1"/>`);
    }
  });
  return `<svg viewBox="0 0 ${RIDDLE[0].length} ${RIDDLE.length}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join("")}</svg>`;
};

export function initSeasonal() {
  const card = document.getElementById("hero-card");
  if (!card || card.querySelector(".dress-riddle")) return;

  const style = document.createElement("style");
  style.textContent = DOCK_STYLE;
  document.head.append(style);

  const riddle = document.createElement("button");
  riddle.type = "button";
  riddle.className = "dress-riddle";
  riddle.setAttribute("aria-label", "Deal this card a theme at random");
  riddle.setAttribute("aria-expanded", "false");
  riddle.setAttribute("aria-controls", "dress-dock");
  riddle.innerHTML = riddleSvg();
  card.append(riddle);

  const dock = document.createElement("div");
  dock.className = "dress-dock";
  dock.id = "dress-dock";
  dock.setAttribute("role", "group");
  dock.setAttribute("aria-label", "Hero card themes");
  dock.inert = true;

  const label = document.createElement("p");
  label.className = "dress-dock-label";
  label.setAttribute("role", "status");

  const shelf = document.createElement("div");
  shelf.className = "dress-dock-shelf";
  const tiles = DRESSES.map((dress) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "dress-dock-tile";
    tile.setAttribute("aria-label", dress.name);
    tile.setAttribute("aria-pressed", "false");
    tile.innerHTML = pixelSvg(dress.badge || dress.art);
    return tile;
  });
  const rule = document.createElement("span");
  rule.className = "dress-dock-rule";
  rule.setAttribute("aria-hidden", "true");
  const plain = document.createElement("button");
  plain.type = "button";
  plain.className = "dress-dock-plain";
  plain.textContent = "Standard";
  shelf.append(...tiles, rule, plain);
  dock.append(label, shelf);
  document.body.append(dock);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let spinTimer = 0;
  let closeTimer = 0;
  let highlighted = -1;

  // Dock magnification: the tile under the highlight rises and grows, its
  // neighbours follow a little, and the CSS transition carries each one there.
  const highlight = (index) => {
    highlighted = index;
    tiles.forEach((tile, i) => {
      const distance = index < 0 ? 9 : Math.abs(i - index);
      tile.style.setProperty("--grow", distance === 0 ? "1.34" : distance === 1 ? "1.12" : "1");
      tile.style.setProperty("--lift", distance === 0 ? "-0.7rem" : distance === 1 ? "-0.22rem" : "0");
    });
  };

  const markChosen = (dress) => {
    tiles.forEach((tile, i) => tile.setAttribute("aria-pressed", String(DRESSES[i] === dress)));
  };

  const say = (text) => {
    label.textContent = text;
    label.classList.toggle("is-shown", Boolean(text));
  };

  const open = () => {
    window.clearTimeout(closeTimer);
    dock.inert = false;
    dock.classList.add("is-open");
    riddle.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    window.clearTimeout(spinTimer);
    window.clearTimeout(closeTimer);
    dock.classList.remove("is-open");
    dock.inert = true;
    riddle.setAttribute("aria-expanded", "false");
    highlight(-1);
    say("");
  };

  const closeSoon = (delay = 2200) => {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, delay);
  };

  const settle = (dress) => {
    window.clearTimeout(spinTimer);
    writePreference(dress);
    applyDress(dress);
    markChosen(dress);
    highlight(dress ? DRESSES.indexOf(dress) : -1);
    say(dress ? dress.name : "Standard");
    closeSoon();
  };

  const spin = () => {
    window.clearTimeout(spinTimer);
    const current = readPreference();
    const pool = DRESSES.filter((dress) => dress !== current);
    const target = pool[Math.floor(Math.random() * pool.length)];
    const count = DRESSES.length;
    const targetIndex = DRESSES.indexOf(target);
    open();
    say("");
    if (reducedMotion.matches) {
      settle(target);
      return;
    }
    const start = highlighted >= 0 ? highlighted : current ? DRESSES.indexOf(current) : count - 1;
    // Three full passes, then on to the target; each step a little slower than the last.
    const total = count * 3 + ((targetIndex - start + count) % count || count);
    let step = 0;
    const tick = () => {
      step += 1;
      highlight((start + step) % count);
      if (step >= total) {
        spinTimer = window.setTimeout(() => settle(target), 260);
        return;
      }
      const progress = step / total;
      spinTimer = window.setTimeout(tick, 62 + 340 * progress ** 3);
    };
    spinTimer = window.setTimeout(tick, 340);
  };

  riddle.addEventListener("click", spin);
  tiles.forEach((tile, i) => tile.addEventListener("click", () => settle(DRESSES[i])));
  plain.addEventListener("click", () => settle(null));
  dock.addEventListener("pointerenter", () => window.clearTimeout(closeTimer));
  dock.addEventListener("pointerleave", () => {
    if (dock.classList.contains("is-open")) closeSoon(1400);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dock.classList.contains("is-open")) {
      close();
      riddle.focus();
    }
  });

  markChosen(readPreference());
}
