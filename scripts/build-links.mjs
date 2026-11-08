import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";

/*
 * Links page (/links/) from links/links.json, plus links/index.json, the
 * entries the site-wide Ctrl+K palette searches.
 * The page holds several collections (OSINT, Red Teaming, Other); each
 * category belongs to one, and each link to one category.
 * Add a link to the JSON, run `node scripts/build-links.mjs`, commit all three.
 * CI runs it with --check and fails if either output is stale.
 * The class names keep their osint- prefix from when this was the OSINT page.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "links", "links.json");
const OUTPUT = resolve(ROOT, "links", "index.html");
const INDEX = resolve(ROOT, "links", "index.json");
const CHECK = process.argv.includes("--check");
const SITE = "https://paracausaltelemetry.com";
const ACCESS = { free: "Free", freemium: "Free tier", paid: "Paid" };
/* What a pasted search can be recognised as; links-page.js does the detecting.
   Templates take {q} (URL-encoded), {raw} (as typed), or {lat} and {lon}. */
const LOOKUP_TYPES = ["ip", "domain", "url", "hash", "sha256", "email", "username", "btc", "eth", "coords", "asn", "icao", "mmsi"];
/* Line icons for the collection switcher, drawn on a 24px grid. */
const GLYPHS = {
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1" class="links-glyph-dot"/>',
  spark: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'
};
const errors = [];

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const isId = (value) => /^[a-z][a-z0-9-]*$/.test(value || "");
const dateDisplay = (value) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const host = (url) => new URL(url).hostname.replace(/^www\./, "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const pluralWord = (n, one, many = `${one}s`) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;

/* ---------- read and validate ---------- */
const data = JSON.parse(readFileSync(SOURCE, "utf8"));
/* Collection and category ids share one namespace: both can be the URL hash. */
const ids = new Set();
const claim = (id, at) => {
  if (!isId(id)) errors.push(`${at}: id must be lowercase-kebab`);
  if (ids.has(id)) errors.push(`${at}: id "${id}" is already used by a collection or category`);
  ids.add(id);
};
if (!isDate(data.reviewed)) errors.push("reviewed: expected YYYY-MM-DD");
const collectionIds = new Set();
for (const [i, collection] of (data.collections || []).entries()) {
  for (const key of ["id", "title", "name", "tagline", "lede", "placeholder", "kind", "glyph"]) if (!collection[key]) errors.push(`collections[${i}]: missing ${key}`);
  if (!Number.isInteger(collection.hue) || collection.hue < 0 || collection.hue > 360) errors.push(`collections[${i}]: hue must be 0-360`);
  if (collection.glyph && !GLYPHS[collection.glyph]) errors.push(`collections[${i}]: glyph must be one of ${Object.keys(GLYPHS).join(", ")}`);
  claim(collection.id, `collections[${i}]`);
  collectionIds.add(collection.id);
}
if (!collectionIds.size) errors.push("collections: need at least one");
const categoryIds = new Set();
for (const [i, category] of (data.categories || []).entries()) {
  for (const key of ["id", "title", "blurb", "collection"]) if (!category[key]) errors.push(`categories[${i}]: missing ${key}`);
  if (category.collection && !collectionIds.has(category.collection)) errors.push(`categories[${i}]: unknown collection "${category.collection}"`);
  claim(category.id, `categories[${i}]`);
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
  for (const [type, template] of Object.entries(tool.lookup || {})) {
    if (!LOOKUP_TYPES.includes(type)) errors.push(`${at}: lookup type "${type}" must be one of ${LOOKUP_TYPES.join(", ")}`);
    const ok = type === "coords" ? template.includes("{lat}") && template.includes("{lon}") : /\{(q|raw)\}/.test(template);
    if (!ok) errors.push(`${at}: lookup.${type} needs ${type === "coords" ? "{lat} and {lon}" : "{q} or {raw}"}`);
    if (!String(template).startsWith("https://")) errors.push(`${at}: lookup.${type} must be https`);
  }
  try { if (new URL(tool.url).protocol !== "https:") errors.push(`${at}: url must be https`); } catch { errors.push(`${at}: url is not a valid URL`); }
  const name = String(tool.name || "").toLowerCase(), url = String(tool.url || "").replace(/\/$/, "");
  if (seenNames.has(name)) errors.push(`${at}: duplicate name`);
  if (seenUrls.has(url)) errors.push(`${at}: duplicate url`);
  seenNames.add(name); seenUrls.add(url);
}
if (errors.length) {
  for (const error of errors) console.error(`  FAIL ${error}`);
  console.error(`\nLinks build failed with ${errors.length} error(s).`);
  process.exit(1);
}

/* Collections and categories render in the JSON's order, links by name;
   empty categories are skipped, empty collections still get a tab. Each
   category's hue steps round from its collection's (--cat is its index
   within the collection); the OSINT collection keeps the full-wheel spread
   it has always had. */
const collections = data.collections.map((collection) => {
  const sections = data.categories
    .filter((category) => category.collection === collection.id)
    .map((category) => ({ ...category, tools: data.tools.filter((tool) => tool.category === category.id).sort((a, b) => a.name.localeCompare(b.name, "en-GB")) }))
    .filter((category) => category.tools.length);
  const [base, step] = collection.categoryHue || [collection.hue - 14, 12];
  return { ...collection, sections, base, step, count: sections.reduce((sum, category) => sum + category.tools.length, 0) };
});
const total = data.tools.length;
const shortOf = new Map(data.categories.map((category) => [category.id, category.short || category.title]));
const hueStyle = (collection, index) => `--cat:${index};--base:${collection.base}deg;--step:${collection.step}deg`;

/* ---------- render ---------- */
// Must stay byte-identical to the other pages' inline theme script: the CSP allows it by hash.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;
const title = "Links: OSINT, Red Teaming and more | Paracausal Telemetry";
const description = "Tools and references worth keeping open, in three collections: an OSINT toolkit with paste-to-look-up, red-team cheat sheets and references, and general utilities.";
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Links",
  description,
  url: `${SITE}/links/`,
  dateModified: data.reviewed,
  hasPart: collections.map((collection) => ({
    "@type": "CollectionPage",
    name: collection.name,
    url: `${SITE}/links/#${collection.id}`,
    hasPart: collection.sections.flatMap((category) => category.tools.map((tool) => ({ "@type": "WebSite", name: tool.name, url: tool.url })))
  }))
};

/* Two letters for the card's monogram: the first two letters of a single
   word, or the initials of the first two words. */
const monogram = (name) => {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).replace(/^./, (c) => c.toUpperCase());
};

/* data-name and data-tags let search rank a name or tag hit above a word in
   the note; data-lookup carries the tool's deep-link templates. */
const card = (tool) => `<li class="osint-card" data-osint-tool data-access="${esc(tool.access)}" data-added="${esc(tool.added)}" data-name="${esc(tool.name.toLowerCase())}" data-tags="${esc((tool.tags || []).join(" ").toLowerCase())}" data-terms="${esc([tool.name, host(tool.url), tool.note, ...(tool.tags || []), shortOf.get(tool.category)].join(" ").toLowerCase())}"${tool.lookup ? ` data-lookup="${esc(JSON.stringify(tool.lookup))}"` : ""}>
                <span class="osint-mono" aria-hidden="true">${esc(monogram(tool.name))}</span>
                <div class="osint-card-body">
                  <h3><a href="${esc(tool.url)}" target="_blank" rel="noopener noreferrer">${esc(tool.name)}<span class="visually-hidden"> (opens in a new tab)</span></a></h3>
                  <p class="osint-host">${esc(host(tool.url))}</p>
                  <p class="osint-note">${esc(tool.note)}</p>
                  <div class="osint-meta"><span class="osint-access osint-access-${esc(tool.access)}">${esc(ACCESS[tool.access])}</span>${tool.tags?.length ? `<ul class="osint-tags" aria-label="Tags">${tool.tags.map((tag) => `<li>${esc(tag)}</li>`).join("")}</ul>` : ""}</div>
                </div>
              </li>`;

const section = (collection) => (category, index) => `<section class="osint-section" id="${esc(category.id)}" data-osint-section data-collection="${esc(collection.id)}" style="${hueStyle(collection, index)}" aria-labelledby="${esc(category.id)}-title">
            <header class="osint-section-head">
              <h2 id="${esc(category.id)}-title">${esc(category.title)}</h2>
              <span class="osint-count" data-osint-count>${category.tools.length}</span>
              <p>${esc(category.blurb)}</p>
            </header>
            <ul class="osint-grid">
              ${category.tools.map(card).join("\n              ")}
            </ul>
          </section>`;

/* The switcher: without JS, jump links to each collection; links-page.js
   makes it a tablist (roles, roving focus, arrow keys) and moves the needle. */
const tab = (collection, index) => `<a class="links-tab" href="#collection-${esc(collection.id)}" id="links-tab-${esc(collection.id)}" data-links-tab="${esc(collection.id)}" style="--coll-hue:${collection.hue}">
              <span class="links-tab-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
              <span class="links-tab-name"><svg class="links-tab-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLYPHS[collection.glyph]}</svg>${esc(collection.title)}</span>
              <span class="links-tab-tagline">${esc(collection.tagline)}</span>
              <span class="links-tab-count"><b data-links-tab-count>${collection.count}</b><span class="visually-hidden"> links</span></span>
            </a>`;

const panel = (collection) => `<div class="links-panel" id="collection-${esc(collection.id)}" data-links-panel="${esc(collection.id)}" data-placeholder="${esc(collection.placeholder)}" data-kind="${esc(collection.kind)}" style="--coll-hue:${collection.hue}">
          <p class="links-panel-lede"><b>${esc(collection.name)}.</b> ${esc(collection.lede)}</p>
          ${collection.sections.length ? collection.sections.map(section(collection)).join("\n          ") : `<p class="links-panel-empty">Nothing here yet.</p>`}
        </div>`;

const chips = collections.flatMap((collection) => collection.sections.map((category, index) => `<a href="#${esc(category.id)}" data-osint-chip="${esc(category.id)}" data-collection="${esc(collection.id)}" style="${hueStyle(collection, index)}">${esc(category.short || category.title)} <span>${category.tools.length}</span></a>`));

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
    <link rel="canonical" href="${SITE}/links/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Paracausal Telemetry" />
    <meta property="og:title" content="Links: OSINT, Red Teaming and more" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}/links/" />
    <meta property="og:image" content="${SITE}/src/social-preview.png?v=pt" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css?v=276fa973-site9" />
    <link rel="stylesheet" href="/links/links.css?v=links2" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>
  </head>
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#links">Skip to the links</a>
    <div class="page-shell">
      ${renderHeader({ label: "Links", current: "links" })}
      <main id="links" class="osint-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Links</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">Tools and references</p>
              <h1>Links<span class="signal-stop">.</span></h1>
              <p>The tools and references I actually keep open, in ${pluralWord(collections.length, "collection")}. Not a directory of everything: if something here stops earning its place, it comes off.</p>
              <p class="osint-facts">${plural(total, "link")} &middot; ${plural(collections.length, "collection")} &middot; reviewed ${esc(dateDisplay(data.reviewed))}</p>
            </div>
          </div>
        </section>
        <div class="links-switch" data-links-switch style="--count:${collections.length}">
          <div class="links-switch-track" data-links-tablist>
            ${collections.map(tab).join("\n            ")}
            <span class="links-switch-needle" aria-hidden="true"></span>
          </div>
          <div class="links-switch-scale" aria-hidden="true"></div>
        </div>
        <div class="osint-bar" data-osint-bar>
          <div class="osint-search" hidden data-osint-filter>
            <label class="visually-hidden" for="osint-filter-input">Search links</label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4.2-4.2"></path></svg>
            <input class="osint-search-input" id="osint-filter-input" type="search" placeholder="${esc(collections[0].placeholder)}" autocomplete="off" spellcheck="false" />
            <kbd aria-hidden="true">/</kbd>
          </div>
          <nav class="osint-chips" aria-label="Categories">
            <a href="#all" data-osint-chip="all" hidden>All <span data-osint-all-count>${collections[0].count}</span></a>${chips.join("")}
            <button type="button" class="osint-free" aria-pressed="false" hidden data-osint-free>Free only</button>
          </nav>
          <p class="osint-status" role="status" aria-live="polite" data-osint-status></p>
        </div>
        <section class="osint-lookup" hidden data-osint-lookup aria-labelledby="osint-lookup-title">
          <h2 id="osint-lookup-title" data-osint-lookup-title>Look it up</h2>
          <p data-osint-lookup-note></p>
          <ul class="osint-lookup-list" data-osint-lookup-list></ul>
        </section>
        ${collections.map(panel).join("\n        ")}
        <div class="osint-empty" hidden data-osint-empty>
          <p>Nothing here matches. Try fewer words, or <button type="button" data-osint-reset>clear the filters</button>.</p>
          <p data-osint-elsewhere></p>
        </div>
        <p class="osint-disclaimer">Links go to third-party services I do not run. Use them lawfully and within each service's terms; some log what you search for. Face-recognition search engines are left out on purpose, and the red-team references are for systems you are authorised to test.</p>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/links/links-page.js?v=links2"></script>
  </body>
</html>
`;

/* ---------- palette entries ----------
   Same shape as threat-actors/index.json "entries". external marks a link
   the palette opens in a new tab. Each collection also gets an entry of its
   own that opens the page on it. */
const paletteIndex = {
  schemaVersion: 1,
  generatedAt: data.reviewed,
  entries: [
    ...collections.map((collection) => ({
      label: collection.name,
      detail: `Links · ${collection.tagline}`,
      href: `/links/#${collection.id}`,
      type: "Links",
      category: "Links",
      terms: ["links", collection.id.replaceAll("-", " "), collection.title.toLowerCase()]
    })),
    ...collections.flatMap((collection) => collection.sections.flatMap((category) => category.tools.map((tool) => ({
      label: tool.name,
      detail: `${collection.title} · ${category.short || category.title} · ${tool.note}`,
      href: tool.url,
      type: collection.kind,
      external: true,
      category: category.title,
      terms: [host(tool.url), ...(tool.tags || [])]
    }))))
  ]
};

/* ---------- write or check ---------- */
const outputs = [
  [OUTPUT, page.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n")],
  [INDEX, `${JSON.stringify(paletteIndex, null, 2)}\n`]
];
for (const [file, content] of outputs) {
  if (CHECK) {
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current !== content) {
      console.error(`  FAIL ${relative(ROOT, file)}: generated output is stale. Run node scripts/build-links.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(file, content, "utf8");
  }
}
console.log(`Links build: ${plural(total, "link")} in ${plural(collections.length, "collection")} (${collections.map((c) => `${c.title} ${c.count}`).join(", ")})${CHECK ? " checked" : " written"}.`);
