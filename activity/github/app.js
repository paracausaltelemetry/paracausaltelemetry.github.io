"use strict";
/* Interactive mock GitHub profile. Training exercise only. */

/* ---------------- contribution graph ---------------- */
(function () {
  const WEEKS = 53, DAYS = 7, CELL = 14;
  const grid = document.getElementById("grid");
  const monthsEl = document.getElementById("months");
  const countEl = document.getElementById("contribCount");
  if (!grid) return;
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
        const deployed = (w >= 34 && w <= 52), rr = (w >= 44 && w <= 45);
        if (deployed && !rr) { lvl = rnd() < 0.1 ? 1 : 0; }
        else {
          const weekend = (d === 0 || d === 6), r = rnd();
          lvl = weekend ? (r < 0.5 ? 0 : r < 0.82 ? 1 : 2)
                        : (r < 0.18 ? 0 : r < 0.46 ? 1 : r < 0.73 ? 2 : r < 0.9 ? 3 : 4);
          if (rr) lvl = Math.min(lvl, 2);
        }
      }
      level.push(lvl); total += lvl;
    }
  }
  for (let w = 0; w < WEEKS; w++)
    for (let d = 0; d < DAYS; d++) {
      const lvl = level[w * DAYS + d];
      const c = document.createElement("div");
      c.className = "cell" + (lvl ? " l" + lvl : "");
      grid.appendChild(c);
    }
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let i = 0;
  while (i < WEEKS) {
    const m = monthForWeek[i]; let j = i; while (j < WEEKS && monthForWeek[j] === m) j++;
    const span = document.createElement("span");
    span.style.display = "inline-block"; span.style.width = ((j - i) * CELL - 3) + "px";
    span.textContent = (j - i) >= 2 ? names[m] : ""; monthsEl.appendChild(span); i = j;
  }
  countEl.textContent = (total * 3).toLocaleString() + " contributions in the last year";
})();

/* ---------------- repositories ---------------- */
const REPOS = [
  { name: "ctf-writeups", desc: "Walkthroughs from HTB, TryHackMe and the odd uni CTF. Mostly AD and web.",
    lang: "Markdown", color: "#083fa1", stars: 12, updated: "2 days ago", pinned: true,
    files: [
      { p: "README.md", msg: "tidy index", t: "2 days ago", body:
"# CTF writeups\n\nMy walkthroughs. Mostly Active Directory and web. HTB, TryHackMe and a couple of the DMU society CTFs.\n\nIf a box is still live the flags are redacted." },
      { p: "nightfall-ad.md", msg: "add nightfall AD writeup", t: "2 days ago", body:
"# Nightfall (HTB) - AD chain\n\nkerberoast -> crack -> WriteDACL -> DCSync. Standard but a clean chain.\n\nRan it from my box (MORPHEUS) over the home lab, 21:48 on a Tuesday after work.\n\nNote to self: the second screenshot had my taskbar with my real name on it, so I cropped it. Watch for that." }
    ]},
  { name: "home-lab", desc: "AD domain, pfSense, a Kali box and a vulnerable Windows host. Build notes.",
    lang: "Shell", color: "#89e051", stars: 6, updated: "last month", pinned: true,
    files: [
      { p: "README.md", msg: "document the rebuild", t: "last month", body:
"# home-lab\n\nProxmox host running:\n- dc01.hollis.local  (Windows Server 2022, AD DC)\n- web01.hollis.local (deliberately vulnerable web app)\n- MORPHEUS           (Kali attack box)\n\npfSense does the routing, flat 10.10.10.0/24. Per-box notes under /notes.\n\nRebuilt the lot before I went away with work so it was clean to come back to." },
      { p: "build.sh", msg: "proxmox provisioning", t: "last month", body:
"#!/usr/bin/env bash\n# spin up the lab VMs on proxmox\nset -euo pipefail\nDOMAIN=hollis.local\nfor host in dc01 web01; do\n  echo \"provisioning ${host}.${DOMAIN}\"\ndone" }
    ]},
  { name: "dotfiles", desc: "zsh, tmux and nvim config. My everyday rig, backed up here.",
    lang: "Vim Script", color: "#199f4b", stars: 3, updated: "April", pinned: true,
    files: [
      { p: "README.md", msg: "init", t: "April", body:
"# dotfiles\n\nMy zsh, tmux and nvim setup. Clone it and run install.sh.\n\nTested on the daily driver (Kali) and the work laptop." },
      { p: ".gitconfig", msg: "fix ssh config after rebuild", t: "April", body:
"[user]\n    name = Jamie Hollis\n    email = jamie.hollis.cyber@gmail.com\n[core]\n    sshCommand = ssh -i ~/.ssh/id_morpheus\n[includeIf \"gitdir:~/work/\"]\n    # work box, kept separate\n    path = .gitconfig-brightpost" },
      { p: ".zshrc", msg: "aliases and prompt", t: "April", body:
"export PS1='%n@MORPHEUS %~ %# '\nexport EDITOR=nvim\n\n# quick jumps\nalias lab='ssh jhollis@dc01.hollis.local'\nalias vpn='sudo openvpn ~/work/brightpost.ovpn'\nalias runs='cd ~/pace && python parse.py'" },
      { p: ".tmux.conf", msg: "init", t: "April", body:
"set -g prefix C-a\nset -g mouse on\nset -g base-index 1\nset -g status-style 'bg=default fg=green'" }
    ]},
  { name: "cyber-aptitude-prep", desc: "Notes for the Army cyber aptitude. Networking, Linux, a bit of crypto.",
    lang: "Markdown", color: "#083fa1", stars: 9, updated: "5 days ago", pinned: true,
    files: [
      { p: "README.md", msg: "networking section, subnetting drills", t: "5 days ago", body:
"# Cyber aptitude prep\n\nWorking notes for the Army cyber aptitude and selection. Goal is to pass and transfer across from the infantry.\n\nCurrent: rifleman, 3 DALES. Doing CTFs and this lab most evenings when I am not away with work.\n\nPlan: networking and subnetting, then Linux and Windows internals, then a crypto refresher. Logging progress by week." },
      { p: "week-01-networking.md", msg: "subnetting drills", t: "5 days ago", body:
"# Week 1 - networking\n\nSubnetting until it is automatic. OSI layers. TCP handshake.\n\nDrills: /26 and /27 splits, VLSM, broadcast addresses. Redo the ones I got wrong on the train back." }
    ]},
  { name: "pace", desc: "Quick parser for my running app GPX exports.", lang: "Python", color: "#3572A5",
    stars: 1, updated: "Feb", pinned: false,
    files: [
      { p: "parse.py", msg: "handle bulk export", t: "Feb", body:
"import gpxpy, glob\n# dump my pacelog export and pull start points + times\nfor f in glob.glob('export/*.gpx'):\n    with open(f) as fh:\n        g = gpxpy.parse(fh)\n    # ... start lat/lon, moving time, utc offset" }
    ]},
  { name: "advent-of-code-2025", desc: "My solutions. Python, mostly.", lang: "Python", color: "#3572A5",
    stars: 0, updated: "Dec 2025", pinned: false,
    files: [ { p: "README.md", msg: "days 1-12", t: "Dec 2025", body: "# Advent of Code 2025\n\nMy solutions, Python. Nothing clever, just getting them done over December." } ] },
  { name: "portfolio-site", desc: "Personal site. Jekyll. Work in progress.", lang: "HTML", color: "#e34c26",
    stars: 0, updated: "2024", pinned: false,
    files: [ { p: "README.md", msg: "init", t: "2024", body: "# portfolio-site\n\nA personal site I keep meaning to finish. Jekyll, not deployed yet." } ] },
  { name: "PEASS-ng", desc: "Forked from carlospolop/PEASS-ng", lang: "PowerShell", color: "#012456",
    stars: 0, updated: "last year", pinned: false,
    files: [ { p: "README.md", msg: "fork", t: "last year", body: "# PEASS-ng\n\nFork of the privilege-escalation scripts. Kept for reference while studying." } ] },
  { name: "dotfiles-old", desc: "Old setup, archived.", lang: "Shell", color: "#89e051",
    stars: 0, updated: "2022", pinned: false,
    files: [ { p: "README.md", msg: "archive", t: "2022", body: "# dotfiles-old\n\nArchived. See the dotfiles repo for the current setup." } ] },
  { name: "aoc-2024", desc: "Last year's Advent of Code.", lang: "Python", color: "#3572A5",
    stars: 0, updated: "Dec 2024", pinned: false,
    files: [ { p: "README.md", msg: "done", t: "Dec 2024", body: "# aoc-2024\n\nLast year's solutions. Ran out of steam around day 18." } ] },
  { name: "arma-missions", desc: "SQF scripts and mission files for the Saturday milsim ops.", lang: "SQF", color: "#3f3f3f",
    stars: 4, updated: "May", pinned: false,
    files: [
      { p: "README.md", msg: "op 14 tidy", t: "May", body: "# arma-missions\n\nMission files for our Saturday ops. 40 slots, Zeus-led.\n\nDrop the pbo in MPMissions and pray." },
      { p: "init.sqf", msg: "garrison helper", t: "May", body: "// spawn a garrison in the nearest town\n[getMarkerPos \"objective\", 300, 12] call jh_fnc_garrison;\nsetViewDistance 2500;" }
    ]},
  { name: "qmk-65", desc: "Keymap for my 65% board. Layer 2 is all media keys.", lang: "C", color: "#555555",
    stars: 2, updated: "Jan", pinned: false,
    files: [ { p: "keymap.c", msg: "media layer", t: "Jan", body: "// layer 0: base, layer 1: fn, layer 2: media\n#include QMK_KEYBOARD_H\n// ..." } ] },
  { name: "ansible-lab", desc: "Playbooks to rebuild the lab from scratch. Half finished.", lang: "YAML", color: "#cb171e",
    stars: 1, updated: "Mar", pinned: false,
    files: [ { p: "README.md", msg: "wip", t: "Mar", body: "# ansible-lab\n\nPlaybooks for the Proxmox lab. The DC role works, the rest is TODO.\n\nInventory lives outside the repo." } ] },
  { name: "fit-tools", desc: "Scripts for poking at .fit files from my watch.", lang: "Python", color: "#3572A5",
    stars: 0, updated: "Nov 2025", pinned: false,
    files: [ { p: "README.md", msg: "init", t: "Nov 2025", body: "# fit-tools\n\nDecode .fit files and plot heart rate against pace. Mostly to prove the treadmill lies." } ] },
  { name: "thm-notes", desc: "Room notes. Archived, moved to ctf-writeups.", lang: "Markdown", color: "#083fa1",
    stars: 0, updated: "2023", pinned: false,
    files: [ { p: "README.md", msg: "archive", t: "2023", body: "# thm-notes\n\nArchived. Everything useful moved into ctf-writeups." } ] }
];

const LANGDOT = r => '<span class="dotlang" style="background:' + r.color + '"></span>' + r.lang;
const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const REPO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/></svg>';
const FILE_ICON = '<svg class="fico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';

function repoCard(r) {
  return '<button type="button" class="repo" data-open="' + r.name + '">' +
    '<span class="n">' + REPO_ICON + r.name + '<span class="pub">' + (/^Forked/.test(r.desc) ? 'Fork' : 'Public') + '</span></span>' +
    '<span class="d">' + r.desc + '</span>' +
    '<span class="meta"><span>' + LANGDOT(r) + '</span><span>&#9733; ' + r.stars + '</span><span>Updated ' + r.updated + '</span></span>' +
    '</button>';
}

function mdRender(src) {
  const out = [];
  src.split("\n").forEach(line => {
    if (/^# /.test(line)) out.push("<h3>" + esc(line.slice(2)) + "</h3>");
    else if (/^## /.test(line)) out.push("<h4>" + esc(line.slice(3)) + "</h4>");
    else if (/^- /.test(line)) out.push("<p style='margin-left:8px'>&bull; " + esc(line.slice(2)) + "</p>");
    else if (line.trim() === "") { /* skip */ }
    else out.push("<p>" + esc(line) + "</p>");
  });
  return out.join("");
}

const profileView = document.getElementById("profileView");
const repoView = document.getElementById("repoView");

function openRepo(name) {
  const r = REPOS.find(x => x.name === name); if (!r) return;
  const rows = r.files.map(f =>
    '<button type="button" class="frow" data-file="' + r.name + '|' + f.p + '">' +
      FILE_ICON +
      '<span class="fn">' + f.p + '</span>' +
      '<span class="fc">' + esc(f.msg) + '</span>' +
      '<span class="ft">' + f.t + '</span>' +
    '</button>').join("");
  const readme = r.files.find(f => f.p.toLowerCase() === "readme.md");
  repoView.innerHTML =
    '<button type="button" class="back2" data-home="1">&larr; j_hollis87</button>' +
    '<div class="rvh">' + REPO_ICON.replace('<svg', '<svg width="16" height="16" style="stroke:var(--mute);fill:none;stroke-width:1.6"') + '<h2>j_hollis87 / <b>' + r.name + '</b></h2><span class="pub">Public</span></div>' +
    '<p class="rvd">' + r.desc + '</p>' +
    '<div class="ftree"><div class="fth"><span class="av" aria-hidden="true">JH</span><b>j_hollis87</b><span>' + esc(r.files[0].msg) + '</span><span style="margin-left:auto">' + r.files.length + ' file' + (r.files.length === 1 ? '' : 's') + '</span></div>' + rows + '</div>' +
    (readme ? '<div class="readme"><div class="rh">README.md</div><div class="rb">' + mdRender(readme.body) + '</div></div>' : '');
  profileView.hidden = true; repoView.hidden = false;
  window.scrollTo(0, 0);
}

function openFile(key) {
  const [rn, fp] = key.split("|");
  const r = REPOS.find(x => x.name === rn); if (!r) return;
  const f = r.files.find(x => x.p === fp); if (!f) return;
  repoView.innerHTML =
    '<button type="button" class="back2" data-open="' + r.name + '">&larr; ' + r.name + '</button>' +
    '<div class="fileview"><div class="fh"><b>' + r.name + " / " + f.p + '</b><span>' + f.body.split("\n").length + ' lines</span></div>' +
    '<pre>' + f.body.split("\n").map(l => '<span>' + esc(l) + '</span>').join("") + '</pre></div>';
  window.scrollTo(0, 0);
}

function home() { repoView.hidden = true; profileView.hidden = false; setTab("repos"); }

const STARS = [
  ["Orange-Cyberdefense/GOAD", "Game Of Active Directory: a vulnerable AD lab to practise attack techniques.", "PowerShell", "6.1k"],
  ["carlospolop/hacktricks", "Welcome to the page where you will find each trick/technique/whatever I have learnt.", "Python", "9.4k"],
  ["fortra/impacket", "A collection of Python classes for working with network protocols.", "Python", "13.8k"],
  ["BloodHoundAD/BloodHound", "Six degrees of Domain Admin.", "PowerShell", "9.9k"],
  ["swisskyrepo/PayloadsAllTheThings", "A list of useful payloads and bypasses for web application security.", "Python", "62k"],
  ["tteck/Proxmox", "Proxmox VE helper scripts.", "Shell", "13k"],
  ["qmk/qmk_firmware", "Open-source keyboard firmware.", "C", "18k"],
  ["tkrajina/gpxpy", "gpx-py is a python GPX parser.", "Python", "1k"]
];
function setTab(v) {
  document.querySelectorAll(".utabs [data-view]").forEach(b => {
    if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
}
function showView(v) {
  setTab(v);
  if (v === "overview" || v === "repos") {
    repoView.hidden = true; profileView.hidden = false;
    const target = v === "repos" ? document.getElementById("repolist") : document.body;
    (v === "repos" ? target.parentElement : target).scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const body = v === "projects"
    ? '<div class="emptyst"><b>No public projects</b>j_hollis87 doesn\'t have any public projects yet.</div>'
    : '<h2 class="sec">Starred repositories</h2><div class="starred">' + STARS.map(s =>
        '<div class="st"><b>' + esc(s[0]) + '</b><p>' + esc(s[1]) + '</p><div class="meta"><span>' + esc(s[2]) + '</span><span>&#9733; ' + s[3] + '</span></div></div>').join("") + '</div>';
  repoView.replaceChildren();
  repoView.insertAdjacentHTML("beforeend", '<button type="button" class="back2" data-home="1">&larr; j_hollis87</button>' + body);
  profileView.hidden = true; repoView.hidden = false;
  window.scrollTo(0, 0);
}
document.querySelectorAll(".utabs [data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

const followBtn = document.getElementById("follow"), followers = document.getElementById("followers");
if (followBtn) followBtn.addEventListener("click", () => {
  const on = followBtn.getAttribute("aria-pressed") !== "true";
  followBtn.setAttribute("aria-pressed", String(on));
  followBtn.textContent = on ? "Unfollow" : "Follow";
  followers.textContent = on ? 35 : 34;
});

// render pinned + full list
document.getElementById("pins").innerHTML = REPOS.filter(r => r.pinned).map(repoCard).join("");
document.getElementById("repolist").innerHTML = REPOS.map(repoCard).join("");
document.getElementById("repoCount").textContent = REPOS.length;

// one delegated click handler
document.addEventListener("click", e => {
  const open = e.target.closest("[data-open]");
  const file = e.target.closest("[data-file]");
  const back = e.target.closest("[data-home]");
  if (file) { openFile(file.getAttribute("data-file")); return; }
  if (open) { openRepo(open.getAttribute("data-open")); return; }
  if (back) { home(); return; }
});
