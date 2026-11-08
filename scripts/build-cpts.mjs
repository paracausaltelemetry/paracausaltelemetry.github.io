import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../js/markdown.js?v=276fa973-th";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";
import { shareImage } from "./lib/share-image.mjs";

/*
 * CPTS: a command-first pentest reference, organised along the Cyber Kill
 * Chain. Source is cpts/content/stages.json (the kill-chain spine) plus one
 * cpts/content/tools/<slug>.md per tool (frontmatter + a markdown body of
 * commands and flags). Writes the single page cpts/index.html and the Ctrl+K
 * palette entries cpts/index.json. Run `node scripts/build-cpts.mjs`; CI runs
 * it with --check and fails if the committed output is stale.
 *
 * The notes are authored to be portable: the same files live in the CPTS-Notes
 * repo and are mirrored into cpts/content/ (see cpts/content/README.md).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = resolve(ROOT, "cpts", "content");
const TOOLS = resolve(CONTENT, "tools");
const CHECK = process.argv.includes("--check");
const SITE = "https://paracausaltelemetry.com";
const CSS_V = "cpts13";
const JS_V = "cpts8";
const errors = [];

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const unesc = (value) => value
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
const slugify = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

/* ---------- read the kill-chain spine ---------- */
const chain = JSON.parse(readFileSync(resolve(CONTENT, "stages.json"), "utf8"));
const stages = chain.stages.slice().sort((a, b) => a.order - b.order);
const stageIds = new Set(stages.map((s) => s.id));
for (const s of stages) {
  if (!Array.isArray(s.checklist) || !s.checklist.length) errors.push(`stages.json: stage "${s.id}" needs a non-empty checklist`);
  else if (s.checklist.some((item) => typeof item !== "string" || !item.trim())) errors.push(`stages.json: stage "${s.id}" checklist items must be non-empty strings`);
}
const stageById = new Map(stages.map((s) => [s.id, s]));

/* ---------- frontmatter: a small, explicit subset (no YAML dependency) ----------
   key: value · key: [a, b] · references: lines of "- Label | https://url". */
const parseFrontmatter = (raw) => {
  const text = raw.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: text };
  const body = text.slice(match[0].length);
  const data = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const kv = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2];
    if (key === "references") {
      const refs = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        const [label, url] = lines[(i += 1)].replace(/^\s*-\s+/, "").split("|").map((part) => part.trim());
        if (label && url) refs.push({ label, url });
      }
      data.references = refs;
    } else if (value.startsWith("[")) {
      data[key] = value.replace(/^\[|\]$/g, "").split(",").map((part) => part.trim()).filter(Boolean);
    } else {
      data[key] = value.trim();
    }
  }
  return { data, body };
};

/* ---------- give each heading a stable id, and name each scrollable table
   region after the tool it sits in (one page, many tools, distinct landmarks) ---------- */
const renderBody = (markdown, tool) => {
  const counts = new Map();
  const headings = [];
  let html = renderMarkdown(markdown).replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = unesc(inner.replace(/<[^>]+>/g, ""));
    const base = `${tool.slug}-${slugify(text)}`;
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    const id = n ? `${base}-${n + 1}` : base;
    headings.push({ id, level: Number(level), text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  html = html.replace(/aria-label="Table"/g, `aria-label="Table: ${esc(tool.tool)}"`);
  return { html, headings };
};

/* ---------- read every tool note ---------- */
const tools = readdirSync(TOOLS).filter((name) => name.endsWith(".md")).sort().map((name) => {
  const slugFromFile = name.replace(/\.md$/, "");
  const { data, body } = parseFrontmatter(readFileSync(resolve(TOOLS, name), "utf8"));
  const at = `cpts/content/tools/${name}`;
  for (const key of ["tool", "slug", "category", "summary"]) if (!data[key]) errors.push(`${at}: missing ${key}`);
  if (data.slug && data.slug !== slugFromFile) errors.push(`${at}: slug "${data.slug}" must match the file name`);
  const toolStages = (data.stages || []).filter(Boolean);
  if (!toolStages.length) errors.push(`${at}: at least one stage is required`);
  for (const stage of toolStages) if (!stageIds.has(stage)) errors.push(`${at}: unknown stage "${stage}"`);
  for (const ref of data.references || []) if (!/^https:\/\//.test(ref.url || "")) errors.push(`${at}: reference "${ref.label}" needs an https URL`);
  const tool = {
    slug: data.slug || slugFromFile,
    tool: data.tool || slugFromFile,
    category: data.category || "",
    summary: data.summary || "",
    stages: toolStages,
    kind: data.kind === "technique" ? "technique" : "tool",
    platforms: data.platforms || [],
    services: data.services || [],
    ports: (data.ports || []).map(String),
    tags: data.tags || [],
    attack: data.attack || [],
    references: data.references || []
  };
  const rendered = renderBody(body.replace(/^# .*\n+/, ""), tool);
  tool.body = rendered.html;
  tool.headings = rendered.headings;
  return tool;
}).sort((a, b) => {
  const order = (t) => Math.min(...t.stages.map((s) => stageById.get(s)?.order ?? 99));
  return order(a) - order(b) || a.tool.localeCompare(b.tool);
});

if (!tools.length) errors.push("cpts/content/tools: no tool notes found");

// The ports the "Open ports" filter offers: the common service ports a target
// exposes, each with a short label. The panel lists all of them, whether or not
// a note keys on one yet, so it doubles as a checklist of what a scan turned up.
// A tool is gated on the ports it declares that appear here; tool-internal
// ports (e.g. a pivot's own listener) are left out of the map, so those tools
// stay in the always-shown core.
const PORT_SERVICE = {
  "21": "FTP", "22": "SSH", "23": "Telnet", "25": "SMTP", "53": "DNS",
  "69": "TFTP", "80": "HTTP", "88": "Kerberos", "110": "POP3", "111": "RPCbind",
  "123": "NTP", "135": "MSRPC", "137": "NetBIOS", "138": "NetBIOS", "139": "SMB",
  "143": "IMAP", "161": "SNMP", "389": "LDAP", "443": "HTTPS", "445": "SMB",
  "464": "Kpasswd", "465": "SMTPS", "500": "IKE", "512": "rexec", "513": "rlogin",
  "514": "rsh", "587": "SMTP", "623": "IPMI", "636": "LDAPS", "873": "rsync",
  "993": "IMAPS", "995": "POP3S", "1433": "MSSQL", "1521": "Oracle", "2049": "NFS",
  "3268": "GC", "3269": "GC-SSL", "3306": "MySQL", "3389": "RDP", "5353": "mDNS",
  "5355": "LLMNR", "5432": "Postgres", "5900": "VNC", "5985": "WinRM", "5986": "WinRM-S",
  "6379": "Redis", "8000": "HTTP", "8080": "HTTP", "8443": "HTTPS", "9200": "Elastic",
  "27017": "MongoDB"
};
const panelPortsFor = (tool) => tool.ports.filter((p) => PORT_SERVICE[p]);
const allPanelPorts = Object.keys(PORT_SERVICE).sort((a, b) => Number(a) - Number(b));

// Simple, original OS/platform glyphs (not vendor logos) so a card shows at a
// glance where a command runs. Labelled for screen readers.
const PLATFORM_GLYPH = {
  windows: { label: "Windows", path: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>' },
  linux: { label: "Linux", path: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>' },
  macos: { label: "macOS", path: '<path d="M9 9h6v6H9z"/><path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zM15 9h2.5A2.5 2.5 0 1 0 15 6.5V9zM9 15H6.5A2.5 2.5 0 1 0 9 17.5V15zM15 15v2.5A2.5 2.5 0 1 0 17.5 15H15z"/>' },
  web: { label: "Web", path: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>' }
};
const platformIcons = (platforms = []) => platforms.filter((p) => PLATFORM_GLYPH[p]).map((p) => {
  const { label, path } = PLATFORM_GLYPH[p];
  return `<span class="cpts-os" role="img" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg></span>`;
}).join("");

/* ---------- render ---------- */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;

const chip = (text, kind = "") => `<span class="cpts-chip${kind ? ` cpts-chip-${kind}` : ""}">${esc(text)}</span>`;

const toolCard = (tool) => {
  const stageNames = tool.stages.map((s) => stageById.get(s)?.short || s);
  const searchKey = [tool.tool, tool.category, tool.kind, ...tool.platforms, ...tool.tags, ...tool.services, ...tool.ports, ...stageNames, ...tool.attack]
    .join(" ").toLowerCase();
  const chips = [
    ...tool.stages.map((s) => chip(stageById.get(s)?.name || s, "stage")),
    ...tool.services.filter((s) => s !== "all").map((s) => chip(s, "service")),
    ...tool.ports.map((p) => chip(p, "port")),
    ...tool.tags.slice(0, 4).map((t) => chip(t))
  ].join("");
  const osIcons = platformIcons(tool.platforms);
  const kindBadge = tool.kind === "technique" ? `<span class="cpts-kind">Technique</span>` : "";
  const refs = tool.references.length ? `<footer class="cpts-tool-foot"><span class="cpts-sources-label">References</span>${tool.references.map((r) => `<a class="cpts-source-link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a>`).join("")}</footer>` : "";
  const attack = tool.attack.length ? `<p class="cpts-attack">MITRE ATT&amp;CK: ${tool.attack.map((id) => `<a href="https://attack.mitre.org/techniques/${esc(id.replace(/\./g, "/"))}/" target="_blank" rel="noopener">${esc(id)}</a>`).join(" · ")}</p>` : "";
  return `<article class="cpts-tool${tool.kind === "technique" ? " is-technique" : ""}" id="tool-${esc(tool.slug)}" data-stages="${esc(tool.stages.join(" "))}" data-ports="${esc(panelPortsFor(tool).join(" "))}" data-search="${esc(searchKey)}">
          <details>
            <summary class="cpts-card">
              <span class="cpts-card-top">
                <span class="cpts-card-name">${esc(tool.tool)}</span>
                ${osIcons ? `<span class="cpts-os-row">${osIcons}</span>` : ""}
              </span>
              <span class="cpts-card-cat">${esc(tool.category)}${kindBadge}</span>
              <span class="cpts-card-sum">${esc(tool.summary)}</span>
            </summary>
            <div class="cpts-tool-open">
              <div class="cpts-chips">${chips}</div>
              <div class="cpts-tool-body markdown-body">
                ${tool.body}
                ${attack}
              </div>
              ${refs}
            </div>
          </details>
        </article>`;
};

// The open-ports filter: tick the ports your scan found open and the tool grid
// narrows to what matters for them, keeping the no-port core (post-ex,
// pivoting, cracking, always-on recon) in place. A port no note keys on yet
// narrows the grid to that core.
const portsPanel = () => {
  if (!allPanelPorts.length) return "";
  return `<section class="cpts-ports" id="cpts-ports" aria-label="Filter by open port">
            <div class="cpts-ports-head">
              <p class="cpts-ports-label">Open ports <span class="cpts-ports-count" data-ports-count aria-live="polite"></span></p>
              <button class="cpts-ports-clear" id="cpts-ports-clear" type="button" hidden>Clear</button>
            </div>
            <p class="cpts-ports-hint">Mark what is open to narrow the tools.</p>
            <ul class="cpts-ports-list">
              ${allPanelPorts.map((p) => `<li><button class="cpts-port" type="button" data-port="${esc(p)}" aria-pressed="false" aria-label="${esc(p)} ${esc(PORT_SERVICE[p])}" title="${esc(PORT_SERVICE[p])}">${esc(p)}</button></li>`).join("\n              ")}
            </ul>
          </section>`;
};

const pad = (n) => String(n).padStart(2, "0");
const railLink = (stage) => `<a class="cpts-rail-stage" href="#stage-${esc(stage.id)}" data-stage="${esc(stage.id)}">
              <span class="cpts-rail-order">${pad(stage.order)}</span>
              <span class="cpts-rail-name">${esc(stage.name)}</span>
              <span class="cpts-rail-count" data-stage-count="${esc(stage.id)}">0</span>
            </a>`;

// A stage's checklist: the things to have done before you leave it. Real
// checkboxes wrapped in a label (named, and a >=24px hit area); the page
// script remembers ticks in localStorage and keeps the done/total count.
const checklist = (stage) => {
  const items = stage.checklist || [];
  if (!items.length) return "";
  return `<details class="cpts-checklist" data-stage="${esc(stage.id)}">
          <summary class="cpts-checklist-head">
            <span class="cpts-checklist-title">Checklist</span>
            <span class="cpts-checklist-count" data-check-count aria-live="polite">0/${items.length}</span>
          </summary>
          <ul class="cpts-checklist-items">
            ${items.map((item, i) => `<li><label class="cpts-check"><input type="checkbox" data-stage="${esc(stage.id)}" data-idx="${i}" /><span>${esc(item)}</span></label></li>`).join("\n            ")}
          </ul>
        </details>`;
};

// A tool is placed under its primary (first) stage, so each renders exactly
// once and ids stay unique; its other stages still match in search.
const stageSection = (stage) => {
  const list = tools.filter((t) => t.stages[0] === stage.id);
  return `<section class="cpts-stage" id="stage-${esc(stage.id)}" aria-labelledby="stage-${esc(stage.id)}-title" data-stage="${esc(stage.id)}">
        <header class="cpts-stage-head">
          <span class="cpts-stage-order">Stage ${stage.order}</span>
          <h2 id="stage-${esc(stage.id)}-title">${esc(stage.name)}</h2>
          <p class="cpts-stage-blurb">${esc(stage.blurb)}</p>
        </header>
        ${checklist(stage)}
        <div class="cpts-tools">
          ${list.length ? list.map(toolCard).join("\n          ") : `<p class="cpts-stage-empty">No tools documented for this stage yet.</p>`}
        </div>
      </section>`;
};

const head = ({ title, description, url, jsonLd, image }) => `<!DOCTYPE html>
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
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Paracausal Telemetry" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${image}" />
    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css?v=276fa973-site9" />
    <link rel="stylesheet" href="/cpts/cpts.css?v=${CSS_V}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>
  </head>`;

const page = () => {
  const url = `${SITE}/cpts/`;
  const description = "A command-first pentest and CPTS study reference, organised along the Cyber Kill Chain. Search by port, service or tool for the commands and flags that matter at each stage.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "CPTS",
    description,
    url,
    hasPart: tools.map((t) => ({ "@type": "TechArticle", headline: `${t.tool}: ${t.category}`, url: `${url}#tool-${t.slug}` }))
  };
  return `${head({ title: "CPTS", description, url, jsonLd, image: shareImage(ROOT, "/cpts/", `${SITE}/src/social-preview.png`) })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#cpts-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="cpts-main" class="cpts-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">CPTS</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS arsenal</p>
              <h1>CPTS<span class="signal-stop">.</span></h1>
              <p>${esc(chain.intro)}</p>
            </div>
          </div>
        </section>
        <div class="cpts-search" role="search">
          <label class="cpts-search-label" for="cpts-q">Search by port, service or tool</label>
          <div class="cpts-search-row">
            <input class="tool-input cpts-search-input" id="cpts-q" type="search" autocomplete="off" placeholder="445, smb, nmap, hydra, subdomain&hellip;" />
            <span class="cpts-search-count" id="cpts-count" aria-live="polite"></span>
          </div>
        </div>
        <div class="cpts-targets" id="cpts-targets">
          <p class="cpts-targets-label">Fill your targets <span class="cpts-targets-hint">(swapped into every command, saved on this device)</span></p>
          <div class="cpts-targets-row">
            <label class="cpts-target">Target <input class="tool-input cpts-target-input" id="cpts-var-target" data-var="target" type="text" autocomplete="off" spellcheck="false" placeholder="10.10.10.5" /></label>
            <label class="cpts-target">Your IP <input class="tool-input cpts-target-input" id="cpts-var-ip" data-var="ip" type="text" autocomplete="off" spellcheck="false" placeholder="10.10.14.5" /></label>
            <label class="cpts-target">Domain <input class="tool-input cpts-target-input" id="cpts-var-domain" data-var="domain" type="text" autocomplete="off" spellcheck="false" placeholder="corp.local" /></label>
            <button class="cpts-targets-clear" id="cpts-targets-clear" type="button" hidden>Clear</button>
          </div>
        </div>
        <div class="cpts-layout">
          <div class="cpts-sidebar">
            <aside class="cpts-rail" aria-label="Cyber Kill Chain stages">
              <p class="cpts-rail-label">Kill chain</p>
              <a class="cpts-rail-stage is-all" href="#cpts-main" data-stage="">
                <span class="cpts-rail-order" aria-hidden="true"></span>
                <span class="cpts-rail-name">All stages</span>
                <span class="cpts-rail-count" data-stage-count="">${tools.length}</span>
              </a>
              ${stages.map(railLink).join("\n              ")}
            </aside>
            ${portsPanel()}
          </div>
          <div class="cpts-stages" id="cpts-stages">
            ${stages.map(stageSection).join("\n        ")}
            <p class="cpts-empty" id="cpts-empty" hidden>No tools match. Try a port number, a service name, or clear the search.</p>
          </div>
        </div>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/cpts-page.js?v=${JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- Ctrl+K palette entries ---------- */
const paletteEntries = () => {
  const entries = [{
    label: "CPTS arsenal", type: "CPTS",
    detail: "Command-first pentest reference along the Cyber Kill Chain: search by port, service or tool",
    href: "/cpts/", terms: ["cpts", "pentest", "kill chain", "tools", "commands", "arsenal"]
  }];
  for (const stage of stages) {
    entries.push({
      label: `CPTS: ${stage.name}`, type: "CPTS stage",
      detail: stage.blurb, href: `/cpts/#stage-${stage.id}`,
      terms: ["cpts", stage.name.toLowerCase(), stage.short.toLowerCase(), ...(stage.focus || []).map((f) => f.toLowerCase())]
    });
  }
  for (const tool of tools) {
    entries.push({
      label: `${tool.tool}: ${tool.category}`, type: "CPTS tool",
      detail: tool.summary, href: `/cpts/#tool-${tool.slug}`,
      terms: ["cpts", tool.tool.toLowerCase(), ...tool.tags, ...tool.services, ...tool.ports].map(String),
      words: tool.headings.map((h) => h.text).join(" ")
    });
  }
  return { schemaVersion: 1, entries };
};

/* ---------- homepage #cpts cards, between the markers in index.html ---------- */
const stageCard = (stage) => {
  const count = tools.filter((t) => t.stages[0] === stage.id).length;
  return `<a class="actor-card" href="/cpts/#stage-${esc(stage.id)}">
              <span class="actor-card-kicker">Stage ${stage.order} &middot; ${count} tool${count === 1 ? "" : "s"}</span>
              <strong>${esc(stage.name)}</strong>
              <p>${esc(stage.blurb)}</p>
            </a>`;
};
const homepage = () => {
  const current = readFileSync(resolve(ROOT, "index.html"), "utf8").replace(/\r\n/g, "\n");
  const marker = /(<!-- cpts:start -->)[\s\S]*?(\n *<!-- cpts:end -->)/;
  if (!marker.test(current)) throw new Error("index.html: cpts markers not found");
  return current.replace(marker, (_, start, end) => `${start}\n          <div class="actor-grid">\n            ${stages.map(stageCard).join("\n            ")}\n          </div>${end}`);
};

/* ---------- write or check ---------- */
const outputs = [
  ["index.html", homepage()],
  ["cpts/index.html", page()],
  ["cpts/index.json", `${JSON.stringify(paletteEntries())}\n`]
];

if (errors.length) {
  console.error("CPTS build failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

let stale = 0;
for (const [rel, content] of outputs) {
  const path = resolve(ROOT, rel);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) continue;
  stale += 1;
  if (CHECK) { console.error(`  stale: ${rel}`); continue; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

if (CHECK && stale) {
  console.error(`CPTS: ${stale} file(s) are stale. Run: node scripts/build-cpts.mjs`);
  process.exit(1);
}
console.log(`CPTS build: ${tools.length} tools across ${stages.length} stages ${CHECK ? "checked" : "written"}.`);
