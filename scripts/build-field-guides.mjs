import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../js/markdown.js?v=276fa973-th";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";
import { searchWords } from "./lib/search-words.mjs";
import { extractVisuals } from "./lib/guide-visuals.mjs";

/*
 * Field guides: working references for the tools used day to day in an MSSP.
 * Source is field-guides/content/guides.json (one entry per guide) plus
 * field-guides/content/<slug>.md. Writes the hub (field-guides/index.html),
 * one page per guide (field-guides/<slug>/index.html) and field-guides/index.json,
 * the Ctrl+K palette entries for each guide and each of its sections.
 * Run `node scripts/build-field-guides.mjs` after editing either; CI runs it
 * with --check and fails if a generated page is stale.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = resolve(ROOT, "field-guides", "content");
const CHECK = process.argv.includes("--check");
const SITE = "https://paracausaltelemetry.com";
const errors = [];

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const unesc = (value) => value
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Same slugs as enhanceMarkdownBody (js/markdown.js) gives headings in the
// browser, so the baked ids, the contents list and its re-run all agree.
const slugifyText = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

// UDM search and YARA-L highlighting, done here rather than in js/highlight.js
// so the shared reader stays as it is. The spans use the same tok-* classes;
// highlight.js has no udm/yaral grammar, so it leaves these blocks alone, and
// the copy button reads textContent, so the clipboard gets the plain query.
const QUERY_RULES = [
  ["comment", /^\/\/[^\n]*/],
  ["string", /^"(?:\\.|[^"\\\n])*"/],
  ["string", /^`[^`\n]*`/],
  ["string", /^\/(?:\\.|[^/\\\n])+\/(?=\s|$|\)|,)/],
  ["keyword", /^(?:meta|events|match|outcome|condition|order|limit|options)(?=\s*:)/],
  ["keyword", /^rule\b/],
  ["keyword", /^\b(?:AND|OR|NOT|and|or|not|nocase|all|any|in|regex|cidr|over|by|asc|desc)\b/],
  ["builtin", /^[a-z_]+(?:\.[a-z_]+)?(?=\()/],
  ["variable", /^[$#%][A-Za-z_]\w*/],
  ["number", /^\b\d+(?:\.\d+)?[smhd]?\b/],
  ["property", /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+/],
  ["operator", /^(?:!=|<=|>=|=|<|>|\/|\*|\+|-)/]
];
const highlightQuery = (source) => {
  let out = "";
  let rest = source;
  while (rest) {
    const rule = QUERY_RULES.map(([type, pattern]) => [type, rest.match(pattern)]).find(([, m]) => m);
    if (rule) {
      out += `<span class="tok-${rule[0]}">${esc(rule[1][0])}</span>`;
      rest = rest.slice(rule[1][0].length);
    } else {
      const plain = rest.match(/^(?:\s+|\w+|[\s\S])/)[0];
      out += esc(plain);
      rest = rest.slice(plain.length);
    }
  }
  return out;
};
const highlightQueries = (html) => html.replace(/<code class="language-(udm|yaral)">([\s\S]*?)<\/code>/g,
  (_, language, code) => `<code class="language-${language}">${highlightQuery(unesc(code))}</code>`);

// Each ## becomes a group and each ### an entry, so the page's filter can hide
// what doesn't match. Content between a ## and its first ### is an entry too.
const wrapEntries = (html) => {
  const chunks = html.split(/(?=<h[23] id=")/);
  const intro = chunks.shift().trim();
  let out = intro ? `<div class="guide-intro" data-guide-intro>${intro}</div>` : "";
  let open = false;
  for (const chunk of chunks) {
    if (chunk.startsWith("<h2")) {
      if (open) out += "</div>";
      const end = chunk.indexOf("</h2>") + 5;
      const intro = chunk.slice(end).trim();
      out += `<div class="guide-group" data-guide-group>${chunk.slice(0, end)}${intro ? `<div class="guide-entry" data-guide-entry>${intro}</div>` : ""}`;
      open = true;
    } else {
      out += `<div class="guide-entry" data-guide-entry>${chunk}</div>`;
    }
  }
  return open ? `${out}</div>` : out;
};

// Must stay byte-identical to the other pages' inline theme script: the CSP allows it by hash.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;

/* ---------- read and validate ---------- */
const guides = JSON.parse(readFileSync(resolve(CONTENT, "guides.json"), "utf8")).map((guide, i) => {
  const at = `field-guides/content/guides.json[${i}]`;
  for (const key of ["slug", "title", "tool", "category", "summary", "updated"]) if (!guide[key]) errors.push(`${at}: missing ${key}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(guide.updated || "")) errors.push(`${at}: updated must be YYYY-MM-DD`);
  const source = resolve(CONTENT, `${guide.slug}.md`);
  if (!existsSync(source)) { errors.push(`${at}: no field-guides/content/${guide.slug}.md`); return guide; }
  // the page header carries the title, so the source's own "# Title" goes
  const markdown = readFileSync(source, "utf8").replace(/\r\n/g, "\n").replace(/^# .*\n+/, "");
  const counts = new Map();
  const headings = [];
  // diagrams, anatomy strips and term cards (scripts/lib/guide-visuals.mjs)
  const visuals = extractVisuals(markdown, guide.slug);
  guide.body = visuals.restore(renderMarkdown(visuals.text)).replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = unesc(inner.replace(/<[^>]+>/g, ""));
    const base = slugifyText(text);
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    const id = n ? `${base}-${n + 1}` : base;
    headings.push({ id, level: Number(level), text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  // markdown.js labels every scrollable table region "Table"; landmarks on one
  // page need distinct names, so name each after the section it sits in
  let section = guide.title;
  const tablesIn = new Map();
  guide.body = guide.body.replace(/<h[2-4] id="([^"]+)">|aria-label="Table"/g, (match, id) => {
    if (id) { section = headings.find((h) => h.id === id).text; return match; }
    const n = (tablesIn.get(section) || 0) + 1;
    tablesIn.set(section, n);
    return `aria-label="Table: ${esc(section)}${n > 1 ? ` (${n})` : ""}"`;
  });
  guide.body = wrapEntries(highlightQueries(guide.body));
  for (const link of markdown.matchAll(/\]\(#([^)]+)\)/g)) {
    if (!headings.some((h) => h.id === link[1])) errors.push(`field-guides/content/${guide.slug}.md: link to #${link[1]} matches no heading`);
  }
  guide.headings = headings;
  // each h2 and h3 section's own text, for its palette entry; headings come
  // in document order, so the nth chunk belongs to the nth h2/h3
  const outline = headings.filter((h) => h.level <= 3);
  guide.sections = markdown.split(/^#{2,3} /m).slice(1).map((chunk, i) => ({
    title: outline[i]?.text || "",
    id: outline[i]?.id,
    parent: outline[i]?.level === 3 ? outline.slice(0, i).reverse().find((h) => h.level === 2)?.text : "",
    text: chunk
  }));
  guide.words = markdown;
  return guide;
});
if (errors.length) {
  for (const error of errors) console.error(`  FAIL ${error}`);
  console.error(`\nField guide build failed with ${errors.length} error(s).`);
  process.exit(1);
}

/* ---------- render ---------- */
const head = ({ title, description, url, jsonLd, stylesheet = true }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)} | Paracausal Telemetry</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index,follow" />
    <meta name="theme-color" content="#0a0b0c" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Paracausal Telemetry" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/src/social-preview.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css?v=276fa973-site9" />${stylesheet ? `
    <link rel="stylesheet" href="/field-guides/field-guides.css?v=fg5" />` : ""}
    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>
  </head>`;

const guideCard = (guide) => `<a class="actor-card guide-card guide-theme-${esc(guide.theme || "default")}" href="/field-guides/${esc(guide.slug)}/">
              <span class="actor-card-kicker">${esc(guide.tool)} &middot; ${esc(guide.category)}</span>
              <strong>${esc(guide.title)}</strong>
              <p>${esc(guide.summary)}</p>
              <span class="actor-card-meta">Updated ${esc(longDate(guide.updated))}</span>
            </a>`;

const hubPage = () => {
  const url = `${SITE}/field-guides/`;
  const description = "Working references for the security tools I use in an MSSP: query languages, investigation workflows and detections.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Field guides",
    description,
    url,
    hasPart: guides.map((guide) => ({ "@type": "TechArticle", headline: guide.title, url: `${SITE}/field-guides/${guide.slug}/` }))
  };
  return `${head({ title: "Field guides", description, url, jsonLd })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#guides">Skip to the guides</a>
    <div class="page-shell">
      ${renderHeader({ label: "Field guides" })}
      <main id="guides" class="learn-library-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Field guides</span></nav>
        <header class="guide-hub-head">
          <p class="eyebrow">Field guides</p>
          <h1>Tools of the trade<span class="signal-stop">.</span></h1>
          <p>${esc(description)} Written as a reference to keep open beside the console, with every query ready to copy.</p>
        </header>
        <div class="actor-grid guide-grid">
          ${guides.map(guideCard).join("\n          ")}
        </div>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/field-guides/guide-page.js?v=fg3"></script>
  </body>
</html>
`;
};

const jumpLink = (h) => `<a href="#${h.id}">${esc(h.text)}</a>`;

const guidePage = (guide) => {
  const url = `${SITE}/field-guides/${guide.slug}/`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: guide.title,
        description: guide.summary,
        url,
        dateModified: guide.updated,
        keywords: (guide.terms || []).join(", ") || undefined,
        author: { "@type": "Organization", name: "Paracausal Telemetry", url: `${SITE}/` }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Field guides", item: `${SITE}/field-guides/` },
          { "@type": "ListItem", position: 3, name: guide.title, item: url }
        ]
      }
    ]
  };
  const sections = guide.headings.filter((h) => h.level === 2);
  return `${head({ title: guide.title, description: guide.summary, url, jsonLd })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#guide">Skip to the guide</a>
    <div class="page-shell">
      ${renderHeader({ label: "Field guides" })}
      <main id="guide" class="learn-library-main guide-theme-${esc(guide.theme || "default")}">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/field-guides/">Field guides</a><span>/</span><span aria-current="page">${esc(guide.tool)}</span></nav>
        <header class="guide-head">
          <p class="eyebrow">${esc(guide.tool)} &middot; ${esc(guide.category)} &middot; Quick reference</p>
          <h1>${esc(guide.title)}</h1>
          <p>${esc(guide.summary)}</p>
          <p class="guide-updated">Updated ${esc(longDate(guide.updated))}</p>
        </header>
        <div class="guide-toolbar">
          <div class="guide-filter" data-guide-filter-row hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <label class="visually-hidden" for="guide-filter">Filter the guide</label>
            <input id="guide-filter" type="search" autocomplete="off" spellcheck="false" placeholder="Filter: ${esc(guide.filterHint || "type to filter")}&hellip;" data-guide-filter />
            <span class="guide-filter-count" aria-live="polite" data-guide-count></span>
            <kbd class="guide-filter-key" aria-hidden="true">/</kbd>
          </div>
          <nav class="guide-jump" aria-label="Sections">
            ${sections.map(jumpLink).join("\n            ")}
          </nav>
        </div>
        <article class="guide-article">
          <p class="guide-empty" data-guide-empty hidden>Nothing matches. <button class="action secondary" type="button" data-guide-clear>Clear the filter</button></p>
          <div class="markdown-body">${guide.body}</div>
          <footer class="guide-footer"><a href="/field-guides/">&larr; All field guides</a></footer>
        </article>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/field-guides/guide-page.js?v=fg3"></script>
  </body>
</html>
`;
};

/* ---------- Ctrl+K palette entries: each guide, and each of its sections ---------- */
const searchIndex = () => JSON.stringify({
  schemaVersion: 1,
  entries: [
    {
      label: "Field guides",
      detail: "Working references for MSSP tools: query languages, investigations and detections",
      href: "/field-guides/",
      type: "Field guide",
      terms: ["field guides", "mssp", "soc", "siem"]
    },
    ...guides.flatMap((guide) => [
      {
        label: guide.title,
        detail: `Field guide · ${guide.tool} · ${guide.summary}`,
        href: `/field-guides/${guide.slug}/`,
        type: "Field guide",
        terms: guide.terms || [],
        words: searchWords(guide.words)
      },
      ...guide.sections.filter((section) => section.id).map((section) => ({
        label: section.title,
        detail: [`${guide.tool} field guide`, section.parent].filter(Boolean).join(" · "),
        href: `/field-guides/${guide.slug}/#${section.id}`,
        type: "Field guide section",
        words: searchWords(section.text, { limit: 80 })
      }))
    ])
  ]
}) + "\n";

/* ---------- homepage #field-guides cards, between the markers in index.html ---------- */
const homepage = () => {
  const current = readFileSync(resolve(ROOT, "index.html"), "utf8").replace(/\r\n/g, "\n");
  const marker = /(<!-- field-guides:start -->)[\s\S]*?(\n *<!-- field-guides:end -->)/;
  if (!marker.test(current)) throw new Error("index.html: field-guides markers not found");
  return current.replace(marker, (_, start, end) => `${start}\n          <div class="actor-grid">\n            ${guides.map(guideCard).join("\n            ")}\n          </div>${end}`);
};

/* ---------- write or check ---------- */
let stale = 0;
const outputs = [
  { file: resolve(ROOT, "index.html"), render: homepage },
  { file: resolve(ROOT, "field-guides", "index.html"), render: hubPage },
  ...guides.map((guide) => ({ file: resolve(ROOT, "field-guides", guide.slug, "index.html"), render: () => guidePage(guide) })),
  { file: resolve(ROOT, "field-guides", "index.json"), render: searchIndex }
];
for (const { file, render } of outputs) {
  const content = render().replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  if (CHECK) {
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current !== content) {
      console.error(`  FAIL ${relative(ROOT, file)}: generated output is stale. Run node scripts/build-field-guides.mjs`);
      stale += 1;
    }
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  }
}
if (stale) process.exit(1);
console.log(`Field guide build: ${guides.length} guide${guides.length === 1 ? "" : "s"}${CHECK ? " checked" : " written"}.`);
