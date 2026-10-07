"use strict";
/* Operation Heatmap task panel, on every /activity page (mock platforms
   included) so students can answer while they search.

   Questions for all three parts live here. Only salted PBKDF2 hashes are
   stored for per-question feedback; each part's flag is AES-GCM ciphertext
   keyed off that part's correct answers, so neither answers nor flags appear
   in source. Progress is kept per part in localStorage (pt_heatmap_q,
   pt_heatmap_q2, pt_heatmap_q3), the same keys the per-page scripts used.

   Layout: docked on the right on wide screens (the page makes room), an
   overlay below 1180px. The "Tasks" button in the exercise navbar opens it;
   T toggles it outside text fields. */
(function () {
  const PARTS = [
    { n: 1, key: "pt_heatmap_q", title: "Find him", flag: { stamp: "First flag", h: "Flag unlocked", p: "You have built the full picture. Submit this to your facilitator, then move on to Part 2." }, data: {"iters":120000,"questions":[{"id":"name","prompt":"What is the subject’s full name?","salt":"f8efcf3893caa88fff5a2399fdb17bf8","hash":"27f3bcebf981ee3ce1d97592765994054e6da1662923d2957a9cb1dfc54befec"},{"id":"user","prompt":"What username does he reuse across platforms?","salt":"17274e3330b947bb9f88396575aae1ef","hash":"b5526ef32579b2866c261ad5e7eeec45d167cdeb82c69a2cf5d5676f5a81cfc9"},{"id":"town","prompt":"Which town is his home area?","salt":"8b4f1c1c28682343df63b203d207b8e3","hash":"ed62e8e051fbf3008148717e934bc7eb08cf11e5ff886c68cd1a5244fa187020"},{"id":"base","prompt":"Where is he based during the week?","salt":"2fa8d6da26398175f512bed4d1b6fed4","hash":"25041bc0c5a1a7e6f966cbdbcd26575cdd74f8f47aa9ff16bb0d7bf5e27af0f2"},{"id":"club","prompt":"Which running club is he a member of?","salt":"56730f1f899e9604e06344a021826a37","hash":"09b8994df54d70cd2866ade29a0658eac10c85d9418340e4545e2bab79bc02f2"},{"id":"country","prompt":"Which country is he deployed to?","salt":"b3c2b6177716cbcbe7de61efd975b0ff","hash":"f5aba6f51aa99c9427a10273844e9bf2771b3e6394de487b9ea893b88cc5cfc5"},{"id":"camp","prompt":"Which camp is he deployed to?","salt":"4e73c96b6d77acac702babafcb017ea2","hash":"553adf8f25b3591b147aad3e7c269e18aee14059ad606fa38e249bc9bba464ae"},{"id":"home","prompt":"Which month is he due home?","salt":"aa9073acdbb47580b8c89f3549637a40","hash":"4d16c4e7bb4c6e813e3d1d70052f1d58c5ec9a2496d2f9724d465afdfa3fe478"},{"id":"box","prompt":"What is the name of his main machine / attack box?","salt":"168d514e807261660703b02b89049dc3","hash":"a316ac5bc4159e55d239abf88a4c5ff02261e5cd3e3acb58ac2d237812908df8"},{"id":"domain","prompt":"What is his home-lab domain?","salt":"d87c444885633c8db63bede137f0d87a","hash":"9088b5678da1cec6bdeb823167131831a1393404587aeb9c92ff665279420a22"},{"id":"email","prompt":"What is his personal email address?","salt":"1cc732f5167adcb4076e8364eed14acb","hash":"0c09ba48b7e3971ba55975e948a6837c69dd83dee5a720a98b9efbbd28e8fe56"},{"id":"rest","prompt":"Which day of the week is his usual rest day?","salt":"7adfec5d145934903c933550b96ac073","hash":"915b7c04b67c195191549665a0fd5c82a997a52f668bb574fd066a35a5a965da"},{"id":"recruit","prompt":"Who is the recruiter that approached him?","salt":"167974ac7dc0ad269708df611f11ee18","hash":"fa4599047fec014efa7d4c746ba1c09b42998de4998c2032742aa4f14df8d191"},{"id":"firm","prompt":"What company does the recruiter claim to be from?","salt":"06daf45e590b3cf1f062a32fa7831712","hash":"3f6211a9bb81d06830c542d882921fd4575229f92a1b401cd0a1101f686f5400"}],"flag":{"salt":"442bca8dc14fb3ebca1afa73e100ff5f","iv":"e770dbcd32fdc0954e7445b9","ct":"ea5bffa0f961781f8875145b1fc4f22add83882a9f8f1e9ea9c4816aa736e910fa2e8922c0bcf898d3403851c09681841783b82b32b88bfd84b8e4792a77","iters":150000}} },
    { n: 2, key: "pt_heatmap_q2", title: "Unmask the operation", flag: { stamp: "Second flag", h: "Operation unmasked", p: "You followed the infrastructure to the crew behind the front. Submit this alongside the Part 1 flag, score the behaviour in the attribution matrix, then write it up in the casefile." }, data: {"iters":120000,"questions":[{"id":"reg_email","prompt":"Before the registrant hid behind privacy, what email address registered the Apex domain?","salt":"133b8a3eb0fd8dd6d1efc46d995b483b","hash":"10d09f83255b3c1c032db8b4489c3c3b87d8d11870a394890981f1bba6f8db90"},{"id":"reg_name","prompt":"Who first registered it?","salt":"269eb5c02597a06499d85742c3c90baf","hash":"ef85c81c91edb3369d3d8c26ad83509f0865f4546a86e89e951887296672cae3"},{"id":"privacy_days","prompt":"How many days did the domain go unprotected before the registrant switched on privacy?","salt":"59bcaf2767a126b4dbb3700d01bc23d2","hash":"2f38e386042b192b13014941599ad62d1bba5de306ab7c40bbcdac621094b446"},{"id":"kit","prompt":"What kit was the careers portal built with?","salt":"23b3dc6c21854cf7d75c298f52682cb0","hash":"f0fd0b13c8f0292a4f065b58c76ad01e305095d0e2849214424eb92df56cba18"},{"id":"analytics_id","prompt":"What tracking ID ties the operator's sites together?","salt":"f4edd34d3eb7193dc91dc066311777ac","hash":"4ecf67c1bb30ad39dac2cc4e91935d1602e82b648bc6278a320476d3d23e25c2"},{"id":"domains_count","prompt":"How many lookalike recruiter domains share the campaign's host?","salt":"e79827421b68598721fe5873fba4041c","hash":"53ae2aaef014c23f1d0034879077bfc9e191304f8e56a9a17d12cd384195f9f5"},{"id":"last_brand","prompt":"Which lookalike brand went live most recently before Apex? Give the domain.","salt":"b165996b0734c71ef267a2fa84a441e7","hash":"08f97215d83a4dd6545aad62283a5b2c2163e7d1e23b4abcd5967d47dab219e9"},{"id":"doc_author","prompt":"Whose username is left inside the role pack?","salt":"838d8fa576c8f209f76477754b406734","hash":"fa692301b9c23c3b5ed1ce1ef7dcbace2f4b7f2171eafb3c844bff94a485746f"},{"id":"modify_utc","prompt":"At what time UTC was the role pack last edited? Answer as HH:MM.","salt":"f97cce46454deb17345504d7b301b99f","hash":"61089d2dc339800e6584b12f0161b774763faf9c639ebbef18efed3dbcdfeb6a"},{"id":"operator","prompt":"What username does the operator trade under?","salt":"5aff4c7d41b2eb44bcdad9e4af982fa8","hash":"048467a056a1bef64926666d11a83d37f10a8595b9e5f03291e83412e7baffaa"},{"id":"crew","prompt":"What does the crew call itself?","salt":"fcc3d746eba6f07803c740c09a6cc773","hash":"17978cd870cb8f2609cec1518f543083ce56b5985208067e7d619c7b2d16d35b"}],"flag":{"salt":"8db8fc79b97db1a157a2791dc9d83d2b","iv":"d58c1f3bca98e96be282102e","ct":"2fac1cbb3fafc83f1410acce850cebebb085c867f07694ceba1b011c3a76784985cfbef0ba2aa250128821a21254729d0b","iters":150000}} },
    { n: 3, key: "pt_heatmap_q3", title: "Burn the operator", flag: { stamp: "Third flag", h: "Operator burned", p: "Infrastructure reuse, a recycled key and a shared wallet took you from a crew name to one person and one region. This is where real reporting stops: behaviour and infrastructure, held at the confidence the evidence supports." }, data: {"iters":120000,"questions":[{"id":"panel","prompt":"Which host is the crew's hidden admin panel?","salt":"d8df24c35701db3e6607a613550f59a1","hash":"78398ddafef77f79d57ee0dde91c042dc0ade4c726588d3f2777ea0e54cff9bc"},{"id":"panel_lead","prompt":"How many days before the Apex domain was registered was the panel given its certificate?","salt":"440fe1b23260621658c86ec228728138","hash":"89ec53be8c82310156a59c3e3463b450da5777dba08f608ef95bbaa52e8eae2a"},{"id":"cert_link","prompt":"Which certificate ID first ties the crew's own domain to its analytics host?","salt":"a22409c0ed28800e9f48cd7a363d53f8","hash":"35974669f1053b21b628c38edab7b63043e4bb96a483a8de622b553b8569dd48"},{"id":"endpoint","prompt":"Where does stolen candidate data end up? Give the host.","salt":"59946e1d26d649e585d84e87c43e3011","hash":"71cca309b42c4e57e0f615b43e5d5d20b8f2eeb0e098a0e83c383b3752c022b1"},{"id":"campaign","prompt":"What internal tag did the crew file this campaign under?","salt":"51081a19d1eb04ccdc9f8baf99226b57","hash":"9b32083c4da4123f649a5696fbaa4138297d235c941ee39cdae01c5ad4e604f7"},{"id":"alias","prompt":"What earlier handle did the operator use?","salt":"00ae4863939a71e2f602056f047e8f85","hash":"8d77ab113c319b63d7ee18b78e38994f643e4a0f0e8da01a779e5b55f1312917"},{"id":"wallet","prompt":"What is the operator's full escrow address?","salt":"cb075d730a8f015d97fbcb5f7c74ef60","hash":"8dfc12a868e7778fcef1891d1828e3fc24403c2d4d2f5a928e81c155f13e9416"},{"id":"campaigns","prompt":"How many recruiter brands can you prove paid out to the crew?","salt":"482f670571c27b00b9261d4315bf8086","hash":"845dc125d3aaf62eafccdafa048ff8f1333ef8d2df836a94943291855218b0a8"},{"id":"excluded","prompt":"Which brand on the crew's host can you not tie to the crew's money? Give the domain.","salt":"247bcc3bfd572e0f8c64e9277fb35cd1","hash":"7573e1d61ec0d49984ef25c8fab955752c8983afaebe6a01937e3b22a6577dcb"},{"id":"region","prompt":"From which country does the operator work?","salt":"0774da0e1be2882526ca7181e76b4544","hash":"8ad4acfed68e688ec443c01016015e9f20b433eee1b8173cb961e9d7b6b23172"}],"flag":{"salt":"16a6f84c4d99343cc28b819528e80c29","iv":"5ccf83ae6123bd46350c96be","ct":"3ade323d93f3b801c6957753968290978df4f0e91f419141de8e1a348c4184d20bb0961aec4f9091eb4915","iters":150000}},
      /* Lead 07, the stash: optional, checked by its own hash, not part of the flag key */
      bonus: { id: "bonus", prompt: "What flag is sealed in the stash?", note: "Optional, very hard. From Part 3, Lead 07.", salt: "4b86ea17adddf7c7df3742d0235b3d77", hash: "beb3d85a109232a233730aa5dc49aef53b0ea3f0f1ce2193e1512794eccb2d26" } }
  ];

  /* ---------- crypto helpers ---------- */
  function norm(s) {
    const N = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
    s = String(s).toLowerCase().trim()
      .replace(/[‘’'"`]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?]+$/g, "")
      .replace(/^the /, "")
      .replace(/^republic of /, "");
    if (Object.prototype.hasOwnProperty.call(N, s)) s = N[s];
    return s.replace(/ (garrison|collective|regiment|battalion|barracks|camp)$/, "");
  }
  const enc = new TextEncoder();
  const hex2buf = h => { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; };
  async function hashHex(pass, saltHex, iters) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hex2buf(saltHex), iterations: iters, hash: "SHA-256" }, base, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function openFlag(part) {
    try {
      const D = part.data;
      const material = D.questions.map(q => norm(part.state[q.id] || "")).join("\n");
      const base = await crypto.subtle.importKey("raw", enc.encode(material), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: hex2buf(D.flag.salt), iterations: D.flag.iters, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hex2buf(D.flag.iv) }, key, hex2buf(D.flag.ct));
      return new TextDecoder().decode(pt);
    } catch (e) { return null; }
  }

  /* ---------- state ----------
     state: id -> what the student typed. done: id -> the answer that was
     confirmed, so a page load does not re-run 120k-iteration hashes for every
     solved task. (This is convenience, not a security boundary: the flag only
     decrypts from the real answers.) */
  PARTS.forEach(p => {
    p.state = {}; p.done = {};
    try { const s = JSON.parse(localStorage.getItem(p.key) || "{}"); p.state = s.state || {}; p.done = s.done || {}; } catch (e) { /* fresh */ }
    p.save = () => { try { localStorage.setItem(p.key, JSON.stringify({ state: p.state, done: p.done })); } catch (e) { /* storage off */ } };
    p.solved = id => p.done[id] !== undefined && p.done[id] === p.state[id];
  });

  const path = location.pathname;
  const pagePart = /\/activity\/exposure\//.test(path) ? 3 : /\/activity\/(investigate|attribution|casefile)\//.test(path) ? 2 : 1;
  const body = document.body;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const FLAG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>';

  /* ---------- build the panel ---------- */
  const aside = document.createElement("aside");
  aside.className = "tq"; aside.id = "tq"; aside.setAttribute("aria-label", "Tasks");
  aside.innerHTML =
    '<div class="tq-head"><div><p class="tq-kicker">Operation Heatmap</p><h2 class="tq-title">Tasks</h2></div>' +
    '<button class="tq-close" type="button" data-tq-toggle aria-controls="tq" aria-label="Close task panel" title="Close (T)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<div class="tq-tabs" role="tablist" aria-label="Exercise parts">' +
    PARTS.map(p => '<button type="button" role="tab" id="tq-tab-' + p.n + '" aria-controls="tq-p' + p.n + '" aria-selected="false" tabindex="-1">Part ' + p.n + '<small data-tq-tabcount="' + p.n + '"></small></button>').join("") +
    '</div><div class="tq-scroll"></div>' +
    '<div class="tq-foot"><span>Training exercise. Everything here is fictional; answers stay in this browser.</span></div>';
  const scroll = aside.querySelector(".tq-scroll");

  PARTS.forEach(p => {
    const D = p.data, total = D.questions.length;
    const panel = document.createElement("section");
    panel.className = "tq-panel"; panel.id = "tq-p" + p.n; panel.hidden = true;
    panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", "tq-tab-" + p.n);
    panel.innerHTML =
      '<div class="tq-prog"><div class="tq-row"><span class="tq-ptitle">' + esc(p.title) + '</span><span class="tq-count" role="status" aria-live="polite"></span></div>' +
      '<div class="tq-cells" aria-hidden="true">' + D.questions.map(() => "<i></i>").join("") + '</div>' +
      '<p class="tq-note">Submit each answer. Not case-sensitive. Solve all ' + total + ' to unlock the flag, which takes the form <code>DMUH{…}</code>.</p></div>' +
      '<div class="tq-list"></div>' +
      (p.bonus ? '<p class="tq-sub">Bonus<small>' + esc(p.bonus.note) + '</small></p><div class="tq-bonus"></div>' : "") +
      '<div class="tq-flag" hidden><span class="tq-stamp">' + esc(p.flag.stamp) + '</span><h3>' + esc(p.flag.h) + '</h3><p>' + esc(p.flag.p) + '</p>' +
      '<div class="tq-flagrow"><code class="tq-code"></code><button type="button" class="tq-btn tq-copy">Copy flag</button></div></div>' +
      '<div class="tq-tools"><button type="button" class="tq-link tq-reset">Clear Part ' + p.n + ' answers</button></div>';
    scroll.appendChild(panel);
    p.panel = panel;
    p.countEl = panel.querySelector(".tq-count");
    p.cells = [...panel.querySelectorAll(".tq-cells i")];
    p.flagBox = panel.querySelector(".tq-flag");
    p.flagCode = panel.querySelector(".tq-code");

    const list = panel.querySelector(".tq-list");
    p.rows = D.questions.map((q, i) => makeTask(p, q, String(i + 1).padStart(2, "0"), list, false));
    if (p.bonus) p.bonusRow = makeTask(p, p.bonus, "★", panel.querySelector(".tq-bonus"), true);

    panel.querySelector(".tq-copy").addEventListener("click", async e => {
      const btn = e.currentTarget, txt = p.flagCode.textContent || "";
      try { await navigator.clipboard.writeText(txt); } catch (err) {
        const r = document.createRange(); r.selectNodeContents(p.flagCode);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); } catch (_) { /* selected for manual copy */ }
      }
      btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy flag"; }, 1600);
    });
    panel.querySelector(".tq-reset").addEventListener("click", () => {
      if (!confirm("Clear all your Part " + p.n + " answers and start over?")) return;
      p.state = {}; p.done = {}; p.save();
      p.rows.concat(p.bonusRow ? [p.bonusRow] : []).forEach(r => r.reset());
      progress(p);
    });
  });

  function makeTask(p, q, num, into, isBonus) {
    const form = document.createElement("form");
    form.className = "tq-task" + (isBonus ? " is-bonus" : ""); form.noValidate = true;
    const fid = "tq-" + p.n + "-" + q.id;
    form.innerHTML =
      '<span class="tq-num">' + (isBonus ? "Bonus" : "Task " + num) + '</span>' +
      '<label class="tq-q" for="' + fid + '">' + esc(q.prompt) + '</label>' +
      '<div class="tq-in"><input id="' + fid + '" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="' + fid + '-s">' +
      '<button type="submit" class="tq-btn">Submit</button></div>' +
      '<span class="tq-state" id="' + fid + '-s"></span>';
    into.appendChild(form);
    const input = form.querySelector("input"), btn = form.querySelector("button"), st = form.querySelector(".tq-state");
    const paint = ok => {
      form.classList.toggle("ok", ok === true); form.classList.toggle("no", ok === false);
      input.readOnly = ok === true; btn.disabled = ok === true; btn.textContent = ok === true ? "Solved" : "Submit";
      st.textContent = ok === true ? (isBonus ? "Stash cracked" : "Correct") : ok === false ? "Incorrect, try again" : "";
      if (ok === null) input.removeAttribute("aria-invalid"); else input.setAttribute("aria-invalid", ok ? "false" : "true");
    };
    if (p.state[q.id]) input.value = p.state[q.id];
    paint(p.solved(q.id) ? true : null);
    let seq = 0;
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const v = input.value; p.state[q.id] = v; p.save();
      if (!norm(v)) { delete p.done[q.id]; p.save(); paint(null); progress(p); return; }
      const mine = ++seq; form.classList.add("checking"); btn.textContent = "Checking";
      const good = (await hashHex(norm(v), q.salt, p.data.iters)) === q.hash;
      if (mine !== seq) return;
      form.classList.remove("checking");
      if (good) p.done[q.id] = v; else delete p.done[q.id];
      p.save(); paint(good); progress(p);
    });
    form.addEventListener("tq-solved", () => paint(true));
    input.addEventListener("input", () => {
      p.state[q.id] = input.value; p.save();
      if (form.classList.contains("no")) paint(null);
    });
    return { reset: () => { input.value = ""; paint(null); } };
  }

  /* ---------- progress, flags, counts ---------- */
  async function progress(p) {
    const total = p.data.questions.length;
    const n = p.data.questions.filter(q => p.solved(q.id)).length;
    p.cells.forEach((c, i) => c.classList.toggle("on", i < n));
    p.countEl.textContent = n + " of " + total;
    p.countEl.classList.toggle("done", n === total);
    const tc = aside.querySelector('[data-tq-tabcount="' + p.n + '"]');
    if (tc) tc.textContent = n + "/" + total;
    navCount();
    if (n === total) {
      const f = await openFlag(p);
      if (f) { p.flagCode.textContent = f; p.flagBox.hidden = false; }
    } else {
      p.flagBox.hidden = true;
    }
  }
  function navCount() {
    let n = 0, t = 0;
    PARTS.forEach(p => { t += p.data.questions.length; n += p.data.questions.filter(q => p.solved(q.id)).length; });
    document.querySelectorAll("[data-tq-count]").forEach(el => { el.textContent = n + "/" + t; });
  }

  /* ---------- tabs ---------- */
  const tabs = [...aside.querySelectorAll('[role="tab"]')];
  function showPart(n, focus) {
    tabs.forEach((t, i) => {
      const on = i + 1 === n;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      PARTS[i].panel.hidden = !on;
    });
    scroll.scrollTop = 0;
    if (focus) tabs[n - 1].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showPart(i + 1));
    t.addEventListener("keydown", e => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step === undefined) return;
      e.preventDefault(); showPart(((i + step + 3) % 3) + 1, true);
    });
  });

  /* ---------- open / close ---------- */
  const scrim = document.createElement("div");
  scrim.className = "tq-scrim";
  body.appendChild(aside); body.appendChild(scrim);
  const KEY = "pt_heatmap_tasks_open";
  const wide = matchMedia("(min-width:1180px)");
  const close = aside.querySelector(".tq-close");
  function set(open, remember, focus) {
    body.classList.toggle("tq-open", open);
    document.querySelectorAll("[data-tq-toggle]").forEach(b => { b.setAttribute("aria-expanded", String(open)); b.setAttribute("aria-controls", "tq"); });
    if (remember) { try { localStorage.setItem(KEY, open ? "1" : "0"); } catch (e) { /* not essential */ } }
    if (focus && open) close.focus();
    if (focus && !open) { const nb = document.querySelector(".opnav-tasks"); if (nb) nb.focus(); }
  }
  const isOpen = () => body.classList.contains("tq-open");
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-tq-toggle],[data-tq-open],a[href='#qh']");
    if (!t) return;
    if (t.matches("a,[data-tq-open]")) { e.preventDefault(); showPart(+t.getAttribute("data-tq-open") || pagePart); set(true, true, true); return; }
    set(!isOpen(), true, true);
  });
  scrim.addEventListener("click", () => set(false, true));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isOpen() && !wide.matches) { set(false, true, true); return; }
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); set(!isOpen(), true, true); }
  });

  let saved = null; try { const v = localStorage.getItem(KEY); saved = v === null ? null : v === "1"; } catch (e) { /* none */ }
  showPart(pagePart);
  set(wide.matches && saved !== false);
  PARTS.forEach(progress);

  /* Answers saved before this panel existed have no "done" record. Check
     them once, one at a time in the background, then mark them solved. */
  const pending = [];
  PARTS.forEach(p => p.data.questions.concat(p.bonus ? [p.bonus] : []).forEach(q => {
    if (p.state[q.id] && norm(p.state[q.id]) && p.done[q.id] === undefined) pending.push([p, q]);
  }));
  (async function migrate() {
    for (const [p, q] of pending) {
      const v = p.state[q.id];
      if ((await hashHex(norm(v), q.salt, p.data.iters)) === q.hash && p.state[q.id] === v) {
        p.done[q.id] = v; p.save();
        const input = document.getElementById("tq-" + p.n + "-" + q.id);
        if (input) input.closest("form").dispatchEvent(new Event("tq-solved"));
        progress(p);
      }
    }
  })();
})();
