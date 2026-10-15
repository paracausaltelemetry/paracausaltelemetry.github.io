import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";

/*
 * OSINT toolkit page (/osint/) from osint/tools.json.
 * Add a tool to the JSON, run `node scripts/build-osint.mjs`, commit both.
 * CI runs it with --check and fails if osint/index.html is stale.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "osint", "tools.json");
const OUTPUT = resolve(ROOT, "osint", "index.html");
const CHECK = process.argv.includes("--check");
const SITE = "https://paracausaltelemetry.com";
const ACCESS = { free: "Free", freemium: "Free tier", paid: "Paid" };
const errors = [];

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const dateDisplay = (value) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const host = (url) => new URL(url).hostname.replace(/^www\./, "");

/* ---------- read and validate ---------- */
const data = JSON.parse(readFileSync(SOURCE, "utf8"));
const categoryIds = new Set();
if (!isDate(data.reviewed)) errors.push("reviewed: expected YYYY-MM-DD");
for (const [i, category] of (data.categories || []).entries()) {
  for (const key of ["id", "title", "blurb"]) if (!category[key]) errors.push(`categories[${i}]: missing ${key}`);
  if (!/^[a-z][a-z0-9-]*$/.test(category.id || "")) errors.push(`categories[${i}]: id must be lowercase-kebab`);
  if (categoryIds.has(category.id)) errors.push(`categories[${i}]: duplicate id ${category.id}`);
  categoryIds.add(category.id);
}
const seenNames = new Set(), seenUrls = new Set();
for (const [i, tool] of (data.tools || []).entries()) {
  const at = `tools[${i}] (${tool.name || "unnamed"})`;
  for (const key of ["name", "url", "category", "access", "note", "added"]) if (!tool[key]) errors.push(`${at}: missing ${key}`);
  if (tool.category && !categoryIds.has(tool.category)) errors.push(`${at}: unknown category "${tool.category}"`);
  if (tool.access && !ACCESS[tool.access]) errors.push(`${at}: access must be one of ${Object.keys(ACCESS).join(", ")}`);
  if (tool.added && !isDate(tool.added)) errors.push(`${at}: added must be YYYY-MM-DD`);
  if (tool.tags && !Array.isArray(tool.tags)) errors.push(`${at}: tags must be a list`);
  try { if (new URL(tool.url).protocol !== "https:") errors.push(`${at}: url must be https`); } catch { errors.push(`${at}: url is not a valid URL`); }
  const name = String(tool.name || "").toLowerCase(), url = String(tool.url || "").replace(/\/$/, "");
  if (seenNames.has(name)) errors.push(`${at}: duplicate name`);
  if (seenUrls.has(url)) errors.push(`${at}: duplicate url`);
  seenNames.add(name); seenUrls.add(url);
}
if (errors.length) {
  for (const error of errors) console.error(`  FAIL ${error}`);
  console.error(`\nOSINT build failed with ${errors.length} error(s).`);
  process.exit(1);
}

/* Categories render in the JSON's order, tools by name; empty categories are skipped. */
const sections = data.categories
  .map((category) => ({ ...category, tools: data.tools.filter((tool) => tool.category === category.id).sort((a, b) => a.name.localeCompare(b.name, "en-GB")) }))
  .filter((category) => category.tools.length);

/* ---------- render ---------- */
// Must stay byte-identical to the other pages' inline theme script: the CSP allows it by hash.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;
const title = "OSINT Toolkit | Paracausal Telemetry";
const description = "A short, opinionated list of the open-source intelligence tools worth keeping open: artefacts, infrastructure, tracking, conflict mapping and more.";
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "OSINT toolkit",
  description,
  url: `${SITE}/osint/`,
  dateModified: data.reviewed,
  hasPart: data.tools.map((tool) => ({ "@type": "WebSite", name: tool.name, url: tool.url }))
};

/* Two letters for the card's monogram: the first two letters of a single
   word, or the initials of the first two words. */
const monogram = (name) => {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).replace(/^./, (c) => c.toUpperCase());
};

const card = (tool) => `<li class="osint-card" data-osint-tool data-access="${esc(tool.access)}" data-added="${esc(tool.added)}" data-terms="${esc([tool.name, host(tool.url), tool.note, ...(tool.tags || [])].join(" ").toLowerCase())}">
              <span class="osint-mono" aria-hidden="true">${esc(monogram(tool.name))}</span>
              <div class="osint-card-body">
                <h3><a href="${esc(tool.url)}" target="_blank" rel="noopener noreferrer">${esc(tool.name)}<span class="visually-hidden"> (opens in a new tab)</span></a></h3>
                <p class="osint-host">${esc(host(tool.url))}</p>
                <p class="osint-note">${esc(tool.note)}</p>
                <div class="osint-meta"><span class="osint-access osint-access-${esc(tool.access)}">${esc(ACCESS[tool.access])}</span>${tool.tags?.length ? `<ul class="osint-tags" aria-label="Tags">${tool.tags.map((tag) => `<li>${esc(tag)}</li>`).join("")}</ul>` : ""}</div>
              </div>
            </li>`;

const section = (category, index) => `<section class="osint-section" id="${esc(category.id)}" data-osint-section style="--cat:${index}" aria-labelledby="${esc(category.id)}-title">
          <header class="osint-section-head">
            <h2 id="${esc(category.id)}-title">${esc(category.title)}</h2>
            <span class="osint-count" data-osint-count>${category.tools.length}</span>
            <p>${esc(category.blurb)}</p>
          </header>
          <ul class="osint-grid">
            ${category.tools.map(card).join("\n            ")}
          </ul>
        </section>`;

const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index,follow" />
    <meta name="theme-color" content="#0a0b0c" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <link rel="canonical" href="${SITE}/osint/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Paracausal Telemetry" />
    <meta property="og:title" content="OSINT toolkit" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}/osint/" />
    <meta property="og:image" content="${SITE}/src/social-preview.png?v=pt" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css?v=276fa973-hdr" />
    <link rel="stylesheet" href="/osint/osint.css?v=osint2" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>
  </head>
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#osint">Skip to the toolkit</a>
    <div class="page-shell">
      ${renderHeader({ label: "OSINT Toolkit", current: "osint" })}
      <main id="osint" class="osint-main">
        <header class="osint-hero">
          <p class="eyebrow">Open-source intelligence</p>
          <h1>OSINT toolkit</h1>
          <p class="osint-lede">The tools I actually keep open. Not a directory of everything: if something here stops earning its place, it comes off.</p>
          <p class="osint-facts">${data.tools.length} tools &middot; ${sections.length} categories &middot; reviewed ${esc(dateDisplay(data.reviewed))}</p>
        </header>
        <div class="osint-bar" data-osint-bar>
          <div class="osint-search" hidden data-osint-filter>
            <label class="visually-hidden" for="osint-filter-input">Search tools</label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4.2-4.2"></path></svg>
            <input class="osint-search-input" id="osint-filter-input" type="search" placeholder="Search tools: IP, sandbox, ADS-B, Telegram…" autocomplete="off" spellcheck="false" />
            <kbd aria-hidden="true">/</kbd>
          </div>
          <nav class="osint-chips" aria-label="Categories">
            <a href="#all" data-osint-chip="all" hidden>All <span>${data.tools.length}</span></a>${sections.map((category, index) => `<a href="#${esc(category.id)}" data-osint-chip="${esc(category.id)}" style="--cat:${index}">${esc(category.short || category.title)} <span>${category.tools.length}</span></a>`).join("")}
            <button type="button" class="osint-free" aria-pressed="false" hidden data-osint-free>Free only</button>
          </nav>
          <p class="osint-status" role="status" aria-live="polite" data-osint-status></p>
        </div>
        ${sections.map(section).join("\n        ")}
        <p class="osint-empty" hidden data-osint-empty>Nothing matches. Try fewer words, or <button type="button" data-osint-reset>clear the filters</button>.</p>
        <p class="osint-disclaimer">Links go to third-party services I do not run. Use them lawfully and within each service's terms; some log what you search for.</p>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/osint/osint-page.js?v=osint2-hdr"></script>
  </body>
</html>
`;

/* ---------- write or check ---------- */
const normalized = page.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
if (CHECK) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : null;
  if (current !== normalized) {
    console.error(`  FAIL ${relative(ROOT, OUTPUT)}: generated output is stale. Run node scripts/build-osint.mjs`);
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, normalized, "utf8");
}
console.log(`OSINT build: ${data.tools.length} tool${data.tools.length === 1 ? "" : "s"} in ${sections.length} categor${sections.length === 1 ? "y" : "ies"}${CHECK ? " checked" : " written"}.`);
