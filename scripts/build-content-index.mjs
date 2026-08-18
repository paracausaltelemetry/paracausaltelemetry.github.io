#!/usr/bin/env node
/**
 * Bakes the writeups index, the site feed, and the sitemap.
 *
 * - writeups/index.json: listing of the CTF-Writeups repo (per folder) with
 *   frontmatter metadata, so the writeups page doesn't depend on visitors
 *   hitting the rate-limited GitHub API. Skipped (not overwritten) if the
 *   GitHub listing is unavailable — the page then falls back to the live API.
 * - feed.xml: RSS 2.0 feed of writeups. Always written; items are included
 *   when the GitHub listing is available.
 * - sitemap.xml: static pages, writeups, and threat-actor dossiers.
 *
 * Run locally (best-effort) or in CI with GITHUB_TOKEN for reliable API access.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../js/markdown.js?v=276fa973-th";
import { renderHeader, renderFooter } from "./lib/site-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://paracausaltelemetry.com";
const REPO = { owner: "paracausaltelemetry", repo: "CTF-Writeups", branch: "main" };

// The exact inline theme script gated by the served CSP's script-src sha256.
// Must stay byte-identical to the copy in every other page (see CLAUDE.md).
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;

const esc = (value = "") =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const slugSegment = (value) =>
  value.toLowerCase().replace(/\.md$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// "THM/PURPLE/thm-h4cked.md" -> "/writeups/thm/purple/thm-h4cked/"
const writeupUrl = (path) => `/writeups/${path.split("/").filter(Boolean).map(slugSegment).join("/")}/`;

const clampDescription = (text) => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

// Folders are auto-discovered from the writeups repo root, so a new platform
// folder needs no code change. Known keys get a polished label; anything else
// is titleized from the folder name (and the frontend shows a generic mark).
const KNOWN_LABELS = { ctf: "CTF", htb: "Hack The Box", thm: "TryHackMe" };

const titleizeName = (name) =>
  name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const folderMetaFromName = (name) => {
  const key = name.toLowerCase();
  return { key, label: KNOWN_LABELS[key] || titleizeName(name), path: name };
};

const headers = { "User-Agent": "paracausaltelemetry-site-build" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const parseFrontMatter = (markdown) => {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const metadata = {};
  if (match) {
    for (const line of match[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
      if (kv) metadata[kv[1].toLowerCase()] = kv[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return { metadata, body: match ? markdown.slice(match[0].length) : markdown };
};

const normalizeTags = (value = "") =>
  value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);

const titleFromBody = (body, fileName) => {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return fileName
    .replace(/\.md$/i, "")
    .replace(/^(htb|thm|ctf)-/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const summaryFromBody = (body) => {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!") || trimmed.startsWith("```")) continue;
    return trimmed.replace(/[*_`>]/g, "").slice(0, 240);
  }
  return "";
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.text();
};

const encodeRepoPath = (path) => path.split("/").map(encodeURIComponent).join("/");

const getTreeApiUrl = () =>
  `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/git/trees/${encodeURIComponent(REPO.branch)}?recursive=1`;

const getRawUrl = (path) =>
  `https://raw.githubusercontent.com/${encodeURIComponent(REPO.owner)}/${encodeURIComponent(REPO.repo)}/${encodeURIComponent(REPO.branch)}/${encodeRepoPath(path)}`;

const getHtmlUrl = (path) =>
  `https://github.com/${encodeURIComponent(REPO.owner)}/${encodeURIComponent(REPO.repo)}/blob/${encodeURIComponent(REPO.branch)}/${encodeRepoPath(path)}`;

const pathSegments = (path) => path.split("/").filter(Boolean);

const fileNameFromPath = (path) => pathSegments(path).at(-1) || path;

const isVisibleSegment = (segment) => {
  const normalized = segment.toLowerCase();
  return !segment.startsWith(".") && !segment.startsWith("_") && normalized !== "hidden";
};

const isVisibleMarkdownPath = (path) => {
  const segments = pathSegments(path);
  const fileName = segments.at(-1) || "";
  return /\.md$/i.test(fileName) && segments.every(isVisibleSegment);
};

const isUnderFolder = (path, folderPath) => path.startsWith(`${folderPath.replace(/\/+$/, "")}/`);

const toMarkdownFile = (entry) => ({
  name: fileNameFromPath(entry.path),
  path: entry.path,
  download_url: getRawUrl(entry.path),
  html_url: getHtmlUrl(entry.path)
});

const fetchRecursiveTree = async () => {
  const data = await fetchJson(getTreeApiUrl());
  if (data.truncated) throw new Error("GitHub recursive tree response was truncated.");
  if (!Array.isArray(data.tree)) throw new Error("GitHub recursive tree response was invalid.");
  return data.tree;
};

// Keep every real top-level directory as a platform folder. Dot/underscore-
// prefixed dirs and "hidden" folders are treated as private.
const discoverFolders = (tree) =>
  tree
    .filter((entry) => entry.type === "tree" && !entry.path.includes("/") && isVisibleSegment(entry.path))
    .map((entry) => folderMetaFromName(entry.path))
    .sort((a, b) => a.label.localeCompare(b.label));

const filesForFolder = (tree, folder) =>
  tree
    .filter((entry) => entry.type === "blob" && isUnderFolder(entry.path, folder.path) && isVisibleMarkdownPath(entry.path))
    .map(toMarkdownFile)
    .sort((left, right) => left.path.localeCompare(right.path));

// Upstream writeups sometimes link a personal TryHackMe/Hack The Box profile
// or badge. Those carry an identity this site does not publish, so drop the
// link and keep its text.
const stripProfileLinks = (markdown) =>
  markdown
    .replace(/\[([^\]]*)\]\(https?:\/\/(?:www\.)?tryhackme\.com\/(?!room\/)[^)]*\)/gi, "$1")
    .replace(/\[([^\]]*)\]\(https?:\/\/(?:www\.|profile\.)?hackthebox\.com\/(?:profile|users|badge)[^)]*\)/gi, "$1")
    .replace(/<https?:\/\/(?:www\.)?tryhackme\.com\/(?!room\/)[^>]*>/gi, "")
    .replace(/<https?:\/\/(?:www\.|profile\.)?hackthebox\.com\/(?:profile|users|badge)[^>]*>/gi, "");

const wordCountReadingTime = (body) => {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

// Static, crawlable article page for one writeup. Search engines never saw the
// client-side ?path= reader; these give each writeup a real URL, real content
// and structured data. Same served CSP as the rest of the site (no meta tag);
// writeup-specific chrome is a small inline <style> (style-src allows inline).
const writeupPageHtml = (record, folderLabel, body) => {
  const description = clampDescription(record.summary || record.title);
  const readTime = `${record.readingTimeMin} min read`;
  const metaBits = [folderLabel, record.date, readTime].filter(Boolean).map(esc).join(" · ");
  const chips = [
    record.difficulty ? `<span class="writeup-chip">Difficulty · ${esc(record.difficulty)}</span>` : "",
    record.os ? `<span class="writeup-chip">OS · ${esc(record.os)}</span>` : "",
    ...record.tags.map((tag) => `<span class="writeup-chip writeup-chip-tag">${esc(tag)}</span>`)
  ].filter(Boolean).join("");
  const sourceLinks = [
    record.roomUrl ? `<a href="${esc(record.roomUrl)}" rel="noreferrer" target="_blank">Original room</a>` : "",
    `<a href="${esc(record.html_url)}" rel="noreferrer" target="_blank">Source markdown</a>`
  ].filter(Boolean).join("");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: record.title,
        description,
        url: `${SITE}${record.url}`,
        datePublished: record.date || undefined,
        keywords: record.tags.join(", ") || undefined,
        author: { "@type": "Organization", name: "Paracausal Telemetry", url: `${SITE}/` }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Writeups", item: `${SITE}/writeups/` },
          { "@type": "ListItem", position: 3, name: record.title, item: `${SITE}${record.url}` }
        ]
      }
    ]
  };
  // Only what is genuinely page-specific: the container, breadcrumbs and
  // fluid type all live in styles.css now.
  const style = ".writeup-article{max-width:var(--container-narrow,52rem);margin:0 auto}.writeup-article-head{margin:0 0 2rem}.writeup-meta{display:flex;flex-wrap:wrap;gap:0.5rem;margin:1.2rem 0 0}.writeup-chip{border:1px solid var(--line-strong);color:var(--muted);font:600 0.72rem/1 var(--font-mono,ui-monospace,monospace);letter-spacing:0.06em;padding:0.35rem 0.55rem;text-transform:uppercase}.writeup-chip-tag{text-transform:none;letter-spacing:0}.writeup-sources{display:flex;flex-wrap:wrap;gap:1.2rem;margin:1rem 0 0;font-size:0.82rem}.writeup-sources a,.writeup-article-footer a{display:inline-flex;align-items:center;min-height:24px}.writeup-article-footer{border-top:1px solid var(--line);margin:2.5rem 0 0;padding:1.2rem 0 0}";
  // The article header already prints the title, and most source files open
  // with the same "# Title" — keeping both gives the page two visible h1s.
  const article = renderMarkdown(body).replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/, "");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(record.title)} | Paracausal Telemetry</title><meta name="description" content="${esc(description)}" /><meta name="robots" content="index,follow" /><meta name="theme-color" content="#0a0b0c" /><meta name="referrer" content="strict-origin-when-cross-origin" /><link rel="canonical" href="${SITE}${record.url}" /><meta property="og:type" content="article" /><meta property="og:site_name" content="Paracausal Telemetry" /><meta property="og:title" content="${esc(record.title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${SITE}${record.url}" /><meta property="og:image" content="${SITE}/src/og/writeups.png?v=pt" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(record.title)}" /><meta name="twitter:description" content="${esc(description)}" /><meta name="twitter:image" content="${SITE}/src/og/writeups.png?v=pt" /><link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" /><link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin /><link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin /><link rel="stylesheet" href="/styles.css?v=276fa973-lean" /><style>${style}</style><script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("</", "<\\/")}</script></head><body><script>${themeScript}</script><a class="skip-to-content" href="#writeup">Skip to writeup</a><div class="page-shell">${renderHeader({ label: "Writeups", current: "writeups" })}<main id="writeup" class="learn-library-main"><nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/writeups/">Writeups</a><span>/</span><span aria-current="page">${esc(record.title)}</span></nav><article class="writeup-article"><header class="writeup-article-head"><p class="eyebrow">${metaBits}</p><h1>${esc(record.title)}</h1><p>${esc(record.summary)}</p><div class="writeup-meta">${chips}</div><p class="writeup-sources">${sourceLinks}</p></header><div class="markdown-body">${article}</div><footer class="writeup-article-footer"><a href="/writeups/">← All writeups</a></footer></article></main>${renderFooter()}</div><script type="module" src="/js/writeup-page.js?v=276fa973-lean"></script></body></html>\n`;
};

const buildWriteupsIndex = async () => {
  const tree = await fetchRecursiveTree();
  const foldersMeta = discoverFolders(tree);
  const folders = {};
  const pages = [];

  for (const folder of foldersMeta) {
    const files = filesForFolder(tree, folder);
    const records = [];
    for (const file of files) {
      const rawUrl = file.download_url;
      const markdown = await fetchText(rawUrl);
      const { metadata, body } = parseFrontMatter(markdown);
      // Bake everything the tree + Box Info need so the frontend renders the
      // listing from index.json alone and only fetches a body when opened.
      const record = {
        name: file.name,
        path: file.path,
        url: writeupUrl(file.path),
        download_url: rawUrl,
        html_url: file.html_url,
        title: metadata.title || titleFromBody(body, file.name),
        summary: metadata.summary || summaryFromBody(body),
        tags: normalizeTags(metadata.tags),
        date: metadata.date || "",
        difficulty: (metadata.difficulty || "").trim().toLowerCase(),
        os: (metadata.os || "").trim(),
        roomUrl: (metadata.url || metadata.link || metadata.room || "").trim(),
        readingTimeMin: wordCountReadingTime(body)
      };
      records.push(record);
      pages.push({ file: resolve(ROOT, `.${record.url}index.html`), html: writeupPageHtml(record, folder.label, stripProfileLinks(body)) });
    }
    folders[folder.path] = records;
  }

  const all = Object.entries(folders).flatMap(([path, records]) =>
    records.map((record) => ({ ...record, folderPath: path }))
  );
  all.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const newest = all[0] || null;

  return {
    pages,
    index: {
      // Derived from the newest writeup, not the clock: the workflow commits this
      // file only when it changes, and a wall-clock stamp made every scheduled run
      // a two-line commit.
      generated: isoDate(newest?.date) || null,
      repo: REPO,
      foldersMeta,
      latest: newest
        ? { title: newest.title, date: newest.date, summary: newest.summary, path: newest.path, url: newest.url, href: `${SITE}${newest.url}` }
        : null,
      folders
    }
  };
};

const escapeXml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const rfc822 = (date) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toUTCString();
};

const buildFeed = (writeupsIndex) => {
  const items = [];

  if (writeupsIndex) {
    for (const [, records] of Object.entries(writeupsIndex.folders)) {
      for (const record of records) {
        items.push({
          title: `Writeup: ${record.title}`,
          link: `${SITE}${record.url || writeupUrl(record.path)}`,
          date: record.date || "",
          description: record.summary || ""
        });
      }
    }
  }

  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const itemsXml = items
    .map((item) => {
      const pubDate = rfc822(item.date);
      return [
        "    <item>",
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.link)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(`${item.link}#${item.title}`)}</guid>`,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : "",
        `      <description>${escapeXml(item.description)}</description>`,
        "    </item>"
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  // The newest item's date, not the clock, so an unchanged feed rebuilds to
  // identical bytes and the workflow has nothing to commit.
  const newestPubDate = rfc822(items[0]?.date);
  const lastBuildLine = newestPubDate ? `    <lastBuildDate>${newestPubDate}</lastBuildDate>\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Paracausal Telemetry</title>
    <link>${SITE}/</link>
    <description>CTF writeups, threat-actor dossiers, and defensive security notes.</description>
    <language>en-gb</language>
${lastBuildLine}${itemsXml}
  </channel>
</rss>
`;
};

// --- Sitemap ---
// Core static pages (kept in sync by hand — they change rarely) plus one entry
// per writeup deep link, so search engines can discover individual writeups.

const STATIC_PAGES = [
  "/",
  "/observer/",
  "/writeups/"
];
const STATIC_LASTMOD = "2026-08-17";
// Per-page lastmod for static pages that changed after the baseline date.
const STATIC_LASTMOD_OVERRIDES = {};

const isoDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const buildSitemap = (threatActors, writeupsIndex) => {
  const urls = [];

  // Newest writeup date drives the /writeups/ hub lastmod; other pages are static.
  const writeupRecords = writeupsIndex
    ? Object.values(writeupsIndex.folders).flat()
    : [];
  const newestDate = writeupRecords
    .map((record) => isoDate(record.date))
    .filter(Boolean)
    .sort()
    .pop();

  for (const page of STATIC_PAGES) {
    const lastmod = page === "/writeups/" && newestDate
      ? newestDate
      : STATIC_LASTMOD_OVERRIDES[page] || STATIC_LASTMOD;
    urls.push({ loc: `${SITE}${page}`, lastmod });
  }

  for (const record of writeupRecords) {
    // Static, crawlable article URL (the ?path= reader is a client-side view).
    urls.push({
      loc: `${SITE}${record.url || writeupUrl(record.path)}`,
      lastmod: isoDate(record.date)
    });
  }

  for (const actor of threatActors) {
    urls.push({ loc: `${SITE}${actor.url}`, lastmod: isoDate(actor.lastReviewed) });
  }

  const body = urls
    .map(({ loc, lastmod }) =>
      ["  <url>", `    <loc>${escapeXml(loc)}</loc>`, lastmod ? `    <lastmod>${lastmod}</lastmod>` : "", "  </url>"]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
};

const main = async () => {
  const threatActorDoc = JSON.parse(readFileSync(resolve(ROOT, "threat-actors/index.json"), "utf8"));
  const threatActors = Array.isArray(threatActorDoc.actors) ? threatActorDoc.actors : [];

  let writeupsIndex = null;
  try {
    const { pages, index } = await buildWriteupsIndex();
    writeupsIndex = index;
    writeFileSync(resolve(ROOT, "writeups/index.json"), JSON.stringify(writeupsIndex, null, 2) + "\n");
    console.log("writeups/index.json written");
    for (const page of pages) {
      mkdirSync(dirname(page.file), { recursive: true });
      writeFileSync(page.file, page.html);
    }
    console.log(`${pages.length} writeup pages written`);
  } catch (error) {
    console.warn(`writeups index skipped (${error.message}) — site falls back to the live GitHub API`);
  }

  writeFileSync(resolve(ROOT, "feed.xml"), buildFeed(writeupsIndex));
  console.log("feed.xml written");

  writeFileSync(resolve(ROOT, "sitemap.xml"), buildSitemap(threatActors, writeupsIndex));
  console.log("sitemap.xml written");
};

await main();
