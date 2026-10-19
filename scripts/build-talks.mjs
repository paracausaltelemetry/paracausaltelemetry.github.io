import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";
import { searchWords } from "./lib/search-words.mjs";

/*
 * Talk pages (/talks/<slug>/) from talks/content/<slug>.json plus the slide
 * assets written by scripts/build-talk-slides.py (talks/<slug>/slides.json,
 * slides/*.webp, <slug>.pdf, og.jpg).
 * Also writes talks/index.json, the Ctrl+K palette entries for each talk and
 * slide (js/command-palette.js).
 * Run `node scripts/build-talks.mjs` after either changes; CI runs it with
 * --check and fails if a generated page is stale.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = resolve(ROOT, "talks", "content");
const CHECK = process.argv.includes("--check");
const SITE = "https://paracausaltelemetry.com";
const errors = [];

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const pad = (n) => String(n).padStart(2, "0");
const megabytes = (file) => `${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`;

// Must stay byte-identical to the other pages' inline theme script: the CSP allows it by hash.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;

/* ---------- read and validate ---------- */
const talks = readdirSync(CONTENT).filter((file) => file.endsWith(".json")).sort().map((file) => {
  const talk = JSON.parse(readFileSync(resolve(CONTENT, file), "utf8"));
  const at = `talks/content/${file}`;
  for (const key of ["slug", "title", "summary", "abstract", "author", "year", "added"]) if (!talk[key]) errors.push(`${at}: missing ${key}`);
  if (`${talk.slug}.json` !== file) errors.push(`${at}: slug must match the file name`);
  const dir = resolve(ROOT, "talks", talk.slug);
  const slidesFile = resolve(dir, "slides.json");
  const pdf = resolve(dir, `${talk.slug}.pdf`);
  if (!existsSync(slidesFile)) { errors.push(`${at}: no slides.json; run scripts/build-talk-slides.py`); return talk; }
  if (!existsSync(pdf)) errors.push(`${at}: missing ${relative(ROOT, pdf)}`);
  const deck = JSON.parse(readFileSync(slidesFile, "utf8"));
  /* the deck's running footer repeats on every slide; drop it from the text */
  const footer = talk.footer ? new RegExp(`\\s*${talk.footer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\d*\\s*$`) : null;
  talk.slides = deck.slides.map((slide) => {
    for (const suffix of ["", "-800", "-thumb"]) {
      const image = resolve(dir, "slides", `${pad(slide.n)}${suffix}.webp`);
      if (!existsSync(image)) errors.push(`${at}: missing ${relative(ROOT, image)}`);
    }
    const title = talk.titles?.[slide.n] || slide.title || `Slide ${slide.n}`;
    const text = footer ? slide.text.replace(footer, "") : slide.text;
    return { n: slide.n, title, text };
  });
  talk.size = { width: deck.width, height: deck.height };
  talk.pdfSize = existsSync(pdf) ? megabytes(pdf) : "";
  return talk;
});
if (errors.length) {
  for (const error of errors) console.error(`  FAIL ${error}`);
  console.error(`\nTalk build failed with ${errors.length} error(s).`);
  process.exit(1);
}

/* ---------- render ---------- */
const slideItem = (talk, slide) => {
  const n = pad(slide.n);
  return `<li class="talk-slide" id="slide-${slide.n}" data-talk-slide="${slide.n}">
              <figure>
                <img src="slides/${n}.webp" srcset="slides/${n}-800.webp 800w, slides/${n}.webp 1600w" sizes="(max-width: 1180px) 100vw, 1120px" width="${talk.size.width}" height="${talk.size.height}" alt="Slide ${slide.n}: ${esc(slide.title)}" data-thumb="slides/${n}-thumb.webp"${slide.n === 1 ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async" />
                <figcaption>
                  <details>
                    <summary>Slide ${slide.n} text</summary>
                    <p>${esc(slide.text)}</p>
                  </details>
                </figcaption>
              </figure>
            </li>`;
};

const page = (talk) => {
  const url = `${SITE}/talks/${talk.slug}/`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PresentationDigitalDocument",
    name: talk.title,
    description: talk.summary,
    url,
    author: { "@type": "Person", name: talk.author, jobTitle: talk.role || undefined },
    datePublished: talk.added,
    encoding: { "@type": "MediaObject", contentUrl: `${url}${talk.slug}.pdf`, encodingFormat: "application/pdf" },
    image: `${url}og.jpg`
  };
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(talk.title)} | Paracausal Telemetry</title>
    <meta name="description" content="${esc(talk.summary)}" />
    <meta name="robots" content="index,follow" />
    <meta name="theme-color" content="#0a0b0c" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Paracausal Telemetry" />
    <meta property="og:title" content="${esc(talk.title)}" />
    <meta property="og:description" content="${esc(talk.summary)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${url}og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css?v=276fa973-ui6" />
    <link rel="stylesheet" href="/talks/talks.css?v=talk4" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>
  </head>
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#talk">Skip to the slides</a>
    <div class="page-shell">
      ${renderHeader({ label: "Talks", current: "talks" })}
      <main id="talk" class="talk-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/#talks">Talks</a><span>/</span><span aria-current="page">${esc(talk.title)}</span></nav>
        <header class="talk-hero">
          <p class="eyebrow">Talk &middot; ${esc(talk.year)} &middot; ${talk.slides.length} slides</p>
          <h1>${esc(talk.title)}<span class="signal-stop">.</span></h1>
          <p class="talk-lede">${esc(talk.summary)}</p>
          <p class="talk-byline">${esc(talk.author)}${talk.role ? ` &middot; ${esc(talk.role)}` : ""}</p>
          <div class="talk-actions">
            <a class="action primary" href="${esc(talk.slug)}.pdf" download>Download PDF <span class="talk-size">${esc(talk.pdfSize)}</span></a>
            ${talk.related ? `<a class="action secondary" href="${esc(talk.related.href)}">${esc(talk.related.label)}</a>` : ""}
          </div>
        </header>
        <section class="talk-viewer" aria-label="Slides" data-talk-viewer>
          <ol class="talk-slides" data-talk-slides>
            ${talk.slides.map((slide) => slideItem(talk, slide)).join("\n            ")}
          </ol>
        </section>
        <section class="talk-about" aria-labelledby="talk-about-title">
          <h2 id="talk-about-title">About this talk</h2>
          ${talk.abstract.map((p) => `<p>${esc(p)}</p>`).join("\n          ")}
          ${talk.related ? `<p class="talk-related"><a href="${esc(talk.related.href)}">${esc(talk.related.label)}</a>: ${esc(talk.related.detail || "")}</p>` : ""}
        </section>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/talks/talk-page.js?v=search1"></script>
  </body>
</html>
`;
};

/* ---------- Ctrl+K palette entries: each talk, and each of its slides ---------- */
const searchIndex = () => JSON.stringify({
  schemaVersion: 1,
  entries: talks.flatMap((talk) => [
    {
      label: talk.title,
      detail: `Talk · ${talk.year} · ${talk.summary}`,
      href: `/talks/${talk.slug}/`,
      type: "Talk",
      terms: ["talk", "slides", "presentation", talk.author],
      words: searchWords(talk.slides.map((slide) => slide.text).join("\n"))
    },
    ...talk.slides.map((slide) => ({
      label: slide.title,
      detail: `Slide ${slide.n} · ${talk.title}`,
      href: `/talks/${talk.slug}/#slide-${slide.n}`,
      type: "Talk slide",
      words: searchWords(slide.text, { limit: 80 })
    }))
  ])
}) + "\n";

/* ---------- write or check ---------- */
let stale = 0;
const outputs = [
  ...talks.map((talk) => ({ file: resolve(ROOT, "talks", talk.slug, "index.html"), render: () => page(talk) })),
  { file: resolve(ROOT, "talks", "index.json"), render: searchIndex }
];
for (const { file, render } of outputs) {
  const content = render().replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  if (CHECK) {
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current !== content) {
      console.error(`  FAIL ${relative(ROOT, file)}: generated output is stale. Run node scripts/build-talks.mjs`);
      stale += 1;
    }
  } else {
    writeFileSync(file, content, "utf8");
  }
}
if (stale) process.exit(1);
console.log(`Talk build: ${talks.length} talk${talks.length === 1 ? "" : "s"}${CHECK ? " checked" : " written"}.`);
