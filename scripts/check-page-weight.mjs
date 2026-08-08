// Advisory page-weight check: sums the statically referenced same-origin
// assets for a set of key routes and compares each total against a budget.
// Runtime fetches (Observer shards) are not traced —
// this guards the initial document payload, not the full app.
//
// Run: node scripts/check-page-weight.mjs
// Exits 1 when a route is over budget; the CI job runs it with
// continue-on-error so it warns rather than blocks.

import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Route → budget in KiB for the statically referenced payload (HTML + CSS +
// JS modules + fonts + the largest srcset candidate per image), plus any
// fetchPayloads listed below.
const ROUTES = {
  "/": 900,
  "/writeups/": 900,
  "/threat-actors/": 900,
  "/projects/pwn2play/": 900,
  "/observer/": 1500
};

// Known runtime fetch() payloads per route (repo-relative paths), so data an
// app page always loads on first paint counts toward its budget. Lazily
// fetched data (Observer shards) is deliberately absent.
const FETCH_PAYLOADS = {
  "/observer/": ["observer/data/catalog.json"],
  "/writeups/": ["writeups/index.json"],
  "/": ["writeups/index.json"]
};

const stripQuery = (url) => url.split("?")[0].split("#")[0];

const isLocal = (url) =>
  url && !url.startsWith("http") && !url.startsWith("//") && !url.startsWith("data:") && !url.startsWith("mailto:");

const toPath = (url, routeDir) => {
  const clean = stripQuery(url).replace(/^\.\//, "");
  const rel = clean.startsWith("/") ? clean.slice(1) : [routeDir, clean].filter(Boolean).join("/");
  return resolve(ROOT, rel);
};

const sizeOf = (path) => {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
};

// Pull asset URLs out of a page. srcset keeps only its largest candidate,
// mirroring the worst case a single browser actually downloads.
const collectAssets = (html) => {
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = match[1];
    if (!isLocal(url)) continue;
    if (/\.(css|m?js|woff2?|svg|png|webp|avif|jpe?g|ico)(\?|$)/.test(url)) assets.add(url);
  }
  for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
    const candidates = match[1].split(",").map((entry) => entry.trim().split(/\s+/));
    let best = null;
    let bestWidth = 0;
    for (const [url, descriptor] of candidates) {
      const width = parseInt(descriptor || "0", 10) || 0;
      if (width >= bestWidth) {
        best = url;
        bestWidth = width;
      }
    }
    if (best && isLocal(best)) assets.add(best);
  }
  return assets;
};

let failures = 0;
for (const [route, budgetKiB] of Object.entries(ROUTES)) {
  const routeDir = route.replace(/^\/|\/$/g, "");
  const htmlPath = resolve(ROOT, routeDir, "index.html");
  const html = readFileSync(htmlPath, "utf8");
  let total = Buffer.byteLength(html);
  const missing = [];
  for (const url of collectAssets(html)) {
    const size = sizeOf(toPath(url, routeDir));
    if (size === null) missing.push(url);
    else total += size;
  }
  for (const rel of FETCH_PAYLOADS[route] || []) {
    const size = sizeOf(resolve(ROOT, rel));
    if (size === null) missing.push(rel);
    else total += size;
  }
  const totalKiB = Math.round(total / 1024);
  const over = totalKiB > budgetKiB;
  if (over) failures++;
  console.log(`${over ? "OVER " : "ok   "} ${route}  ${totalKiB} KiB (budget ${budgetKiB} KiB)`);
  for (const url of missing) console.log(`       missing asset: ${url}`);
}

if (failures) {
  console.log(`\n${failures} route(s) over budget. Advisory only — tune budgets in scripts/check-page-weight.mjs if intentional.`);
  process.exit(1);
}
