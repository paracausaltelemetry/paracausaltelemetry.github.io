import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../js/markdown.js?v=276fa973-th";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";
import { SHARE_IMAGE } from "./lib/share-image.mjs";
import { diagramBlock, diagramIds } from "./lib/cpts-diagrams.mjs";

/*
 * CPTS: a command-first pentest reference, organised by target (network, web,
 * Active Directory, Windows, Linux, credentials, access & pivoting). Source is
 * cpts/content/stages.json (the target categories) plus one
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
const CSS_V = "cpts19";
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

/* ---------- playbooks: the task-first "How do I…" walkthroughs ----------
   One cpts/content/playbooks/<slug>.md per task, same frontmatter+markdown
   format as the tool notes. Each renders a standalone step-by-step page at
   /cpts/how-to/<slug>/, and all of them are listed, grouped by area, as the
   "How do I…" index that leads the /cpts/ landing. A playbook is a procedure
   (goal → what you need → one method per command → if it fails → verify),
   where a tool note is a reference. */
const PLAYBOOKS = resolve(CONTENT, "playbooks");
const AREAS = [
  { id: "initial-access", name: "Initial access & services", order: 1, blurb: "From an open service or a first credential to a shell, and moving files on and off the box." },
  { id: "windows", name: "Windows host", order: 2, blurb: "Reusing hashes, dumping secrets and escalating once you are on a Windows machine." },
  { id: "linux", name: "Linux host", order: 3, blurb: "Hunting credentials and escalating to root on a Linux machine." },
  { id: "active-directory", name: "Active Directory", order: 4, blurb: "Enumerating a domain, roasting Kerberos, abusing rights and reusing tickets to reach Domain Admin." },
  { id: "pivoting", name: "Pivoting & tunnelling", order: 5, blurb: "Turning one foothold into reach of the networks behind it with tunnels, proxies and port forwards." },
  { id: "web", name: "Web", order: 6, blurb: "Attacking web applications — recon, logins, injection, inclusion and uploads — through to a shell." }
];
const areaIds = new Set(AREAS.map((a) => a.id));
const areaById = new Map(AREAS.map((a) => [a.id, a]));

// "See also" tokens on a playbook: tool:<slug> | map:<slug> | howto:<slug>.
// Resolved to a labelled link, and validated so a typo fails the build.
const MAP_LABELS = {
  metasploit: "Metasploit map", "password-cracking": "Password attacks map",
  windows: "Windows quick ops", linux: "Linux quick ops",
  "credential-access": "Credential access map", "active-directory": "AD attacks map",
  coverage: "Coverage index", start: "Where do I start?"
};
const resolveSeeAlso = (token, at) => {
  const [kind, slug] = String(token).split(":");
  if (kind === "tool") {
    const t = tools.find((x) => x.slug === slug);
    if (!t) { errors.push(`${at}: seeAlso tool "${slug}" not found`); return null; }
    return { href: `/cpts/#tool-${slug}`, label: t.tool };
  }
  if (kind === "map") {
    if (!MAP_LABELS[slug]) { errors.push(`${at}: seeAlso map "${slug}" unknown`); return null; }
    const href = slug === "coverage" ? "/cpts/coverage/" : slug === "start" ? "/cpts/start/" : `/cpts/${slug}/`;
    return { href, label: MAP_LABELS[slug] };
  }
  if (kind === "howto") return { href: `/cpts/how-to/${slug}/`, label: slug, howto: slug };
  errors.push(`${at}: seeAlso token "${token}" must be tool:…, map:… or howto:…`);
  return null;
};

const playbooks = (existsSync(PLAYBOOKS) ? readdirSync(PLAYBOOKS).filter((n) => n.endsWith(".md")) : []).sort().map((name) => {
  const slugFromFile = name.replace(/\.md$/, "");
  const { data, body } = parseFrontmatter(readFileSync(resolve(PLAYBOOKS, name), "utf8"));
  const at = `cpts/content/playbooks/${name}`;
  for (const key of ["title", "slug", "area", "goal", "summary"]) if (!data[key]) errors.push(`${at}: missing ${key}`);
  if (data.slug && data.slug !== slugFromFile) errors.push(`${at}: slug "${data.slug}" must match the file name`);
  if (data.area && !areaIds.has(data.area)) errors.push(`${at}: unknown area "${data.area}"`);
  for (const ref of data.references || []) if (!/^https:\/\//.test(ref.url || "")) errors.push(`${at}: reference "${ref.label}" needs an https URL`);
  const pb = {
    slug: data.slug || slugFromFile,
    title: data.title || slugFromFile,
    area: data.area || "",
    goal: data.goal || "",
    summary: data.summary || "",
    prereqs: data.prereqs || [],
    module: data.module || "",
    order: Number(data.order) || 99,
    seeAlso: (data.seeAlso || []).map((tok) => resolveSeeAlso(tok, at)).filter(Boolean),
    references: data.references || []
  };
  const rendered = renderBody(body.replace(/^# .*\n+/, ""), { slug: pb.slug, tool: pb.title });
  pb.body = rendered.html;
  pb.headings = rendered.headings;
  return pb;
}).sort((a, b) => (areaById.get(a.area)?.order ?? 99) - (areaById.get(b.area)?.order ?? 99) || a.order - b.order || a.title.localeCompare(b.title));

const playbookSlugs = new Set();
for (const pb of playbooks) {
  if (playbookSlugs.has(pb.slug)) errors.push(`cpts/content/playbooks: duplicate slug "${pb.slug}"`);
  playbookSlugs.add(pb.slug);
}
for (const pb of playbooks) for (const s of pb.seeAlso) if (s.howto && !playbookSlugs.has(s.howto)) errors.push(`cpts/content/playbooks/${pb.slug}.md: seeAlso howto "${s.howto}" not found`);
const playbooksByArea = (area) => playbooks.filter((pb) => pb.area === area);

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

// The technique axis: each technique names the tools that perform it and where
// its guide lives. Rendered as a "Techniques" row on every tool card and folded
// into that card's search text, so searching a technique (e.g. "pass the hash")
// returns its guide AND every capable tool. One list, both directions.
const TECHNIQUES = [
  { label: "Pass-the-Hash", href: "/cpts/credential-access/", tools: ["mimikatz", "netexec", "evil-winrm", "impacket", "xfreerdp", "secretsdump"] },
  { label: "Pass-the-Ticket", href: "/cpts/credential-access/", tools: ["rubeus", "impacket", "mimikatz"] },
  { label: "OverPass-the-Hash", href: "/cpts/credential-access/", tools: ["rubeus", "mimikatz"] },
  { label: "Pass-the-Certificate", href: "/cpts/credential-access/", tools: ["impacket", "certipy"] },
  { label: "Kerberoast", href: "/cpts/#tool-kerberos-attacks", tools: ["rubeus", "impacket", "netexec"] },
  { label: "AS-REP roast", href: "/cpts/#tool-kerberos-attacks", tools: ["rubeus", "impacket"] },
  { label: "DCSync / NTDS dump", href: "/cpts/password-cracking/", tools: ["secretsdump", "mimikatz", "netexec"] },
  { label: "Credential dumping", href: "/cpts/credential-access/", tools: ["mimikatz", "secretsdump", "netexec"] },
  { label: "LLMNR/NBT-NS poisoning", href: "/cpts/#tool-responder", tools: ["responder", "ntlm-relay"] },
  { label: "NTLM relay", href: "/cpts/#tool-ntlm-relay", tools: ["ntlm-relay", "responder", "impacket"] },
  { label: "Password spraying", href: "/cpts/#tool-attacking-services", tools: ["netexec", "kerbrute", "hydra"] },
  { label: "Offline cracking", href: "/cpts/password-cracking/", tools: ["hashcat"] },
  { label: "SMB enumeration", href: "/cpts/#tool-smb-enum", tools: ["smb-client-tools", "netexec"] },
  { label: "BloodHound mapping", href: "/cpts/#tool-bloodhound", tools: ["bloodhound"] },
  { label: "SQL injection", href: "/cpts/#tool-sql-injection", tools: ["sqlmap"] }
];
const techByTool = new Map();
for (const t of TECHNIQUES) for (const slug of t.tools) {
  if (!techByTool.has(slug)) techByTool.set(slug, []);
  techByTool.get(slug).push({ label: t.label, href: t.href });
}
const techChipRow = (slug) => {
  const techs = techByTool.get(slug) || [];
  if (!techs.length) return "";
  return `<div class="cpts-tech"><span class="cpts-tech-label">Techniques</span>${techs.map((t) => `<a class="cpts-tech-link" href="${esc(t.href)}">${esc(t.label)}</a>`).join("")}</div>`;
};

const toolCard = (tool) => {
  const stageNames = tool.stages.map((s) => stageById.get(s)?.short || s);
  const techs = (techByTool.get(tool.slug) || []).map((t) => t.label);
  const searchKey = [tool.tool, tool.category, tool.kind, ...tool.platforms, ...tool.tags, ...tool.services, ...tool.ports, ...stageNames, ...tool.attack, ...techs]
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
              ${techChipRow(tool.slug)}
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

// Tools whose primary target is elsewhere but which also apply to this one
// (e.g. SMB enumeration is primarily Network, but relevant to the Windows host).
// Surfaced as cross-links so each target section points at everything useful,
// without duplicating the full card or its id.
const relatedBlock = (stage) => {
  const related = tools.filter((t) => t.stages.includes(stage.id) && t.stages[0] !== stage.id);
  if (!related.length) return "";
  return `<div class="cpts-related">
          <span class="cpts-related-label">Also relevant here</span>
          <ul class="cpts-related-list">${related.map((t) => `<li><a class="cpts-related-link" href="#tool-${esc(t.slug)}">${esc(t.tool)}</a></li>`).join("")}</ul>
        </div>`;
};

// A tool is placed under its primary (first) stage, so each renders exactly
// once and ids stay unique; its other stages still match in search and appear
// as cross-links (relatedBlock) under every target they apply to.
const stageSection = (stage) => {
  const list = tools.filter((t) => t.stages[0] === stage.id);
  return `<section class="cpts-stage" id="stage-${esc(stage.id)}" aria-labelledby="stage-${esc(stage.id)}-title" data-stage="${esc(stage.id)}">
        <header class="cpts-stage-head">
          <span class="cpts-stage-order">Target ${stage.order}</span>
          <h2 id="stage-${esc(stage.id)}-title">${esc(stage.name)}</h2>
          <p class="cpts-stage-blurb">${esc(stage.blurb)}</p>
        </header>
        ${checklist(stage)}
        ${relatedBlock(stage)}
        <div class="cpts-tools">
          ${list.length ? list.map(toolCard).join("\n          ") : `<p class="cpts-stage-empty">No tools documented for this stage yet.</p>`}
        </div>
      </section>`;
};

const head = ({ title, description, url, jsonLd, image, cssHref = `/cpts/cpts.css?v=${CSS_V}` }) => `<!DOCTYPE html>
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
    <link rel="stylesheet" href="${cssHref}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>
  </head>`;

const page = () => {
  const url = `${SITE}/cpts/`;
  const description = "A command-first pentest and CPTS study reference, organised by target: network, web, Active Directory, Windows and Linux hosts, credentials, and access & pivoting. Search by port, service or tool for the commands and flags that matter.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "CPTS",
    description,
    url,
    hasPart: tools.map((t) => ({ "@type": "TechArticle", headline: `${t.tool}: ${t.category}`, url: `${url}#tool-${t.slug}` }))
  };
  return `${head({ title: "CPTS", description, url, jsonLd, image: SHARE_IMAGE })}
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
        ${howToIndex()}
        <section class="cpts-reference-head" aria-labelledby="cpts-reference-title">
          <h2 class="cpts-reference-title" id="cpts-reference-title">Reference</h2>
          <p class="cpts-reference-sub">The full arsenal and the interactive maps. Browse the maps, or search the tools by port, service or name.</p>
        </section>
        ${mapsSection()}
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
            <aside class="cpts-rail" aria-label="Targets">
              <p class="cpts-rail-label">By target</p>
              <a class="cpts-rail-stage is-all" href="#cpts-main" data-stage="">
                <span class="cpts-rail-order" aria-hidden="true"></span>
                <span class="cpts-rail-name">All targets</span>
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

/* ---------- /cpts/metasploit/: the engagement-structure map ----------
   Source is cpts/content/metasploit-map.json: five phases, each a tree of
   nodes (label, detail, optional msfconsole lines, children), plus the module
   workflow, an ordered list of node ids. The tree is always drawn; each node's
   explanation is a <details>, so the page is the whole map without scripts.
   cpts/metasploit/msf-map.js adds the step-through walk and copy buttons. */
const MSF_CSS_V = "msf2";
const MSF_JS_V = "msf1";
const msf = JSON.parse(readFileSync(resolve(CONTENT, "metasploit-map.json"), "utf8"));
const msfNodeIds = new Set();
const msfPhaseIds = new Set(msf.phases.map((p) => p.id));
const walkNode = (node, at) => {
  if (!node.id || !node.label || !node.detail) errors.push(`metasploit-map.json: ${at} needs id, label and detail`);
  if (msfNodeIds.has(node.id)) errors.push(`metasploit-map.json: duplicate node id "${node.id}"`);
  msfNodeIds.add(node.id);
  for (const child of node.children || []) walkNode(child, `${at} > ${child.id}`);
};
for (const phase of msf.phases) {
  for (const node of phase.nodes) walkNode(node, phase.id);
  if (phase.next && !msfPhaseIds.has(phase.next.to)) errors.push(`metasploit-map.json: ${phase.id} next points at unknown phase "${phase.next.to}"`);
}
for (const step of msf.workflow) if (!msfNodeIds.has(step.node)) errors.push(`metasploit-map.json: workflow step "${step.title}" points at unknown node "${step.node}"`);
const msfStepOf = new Map(msf.workflow.map((step, i) => [step.node, i + 1]));
const msfNodeById = new Map();
const indexNodes = (node) => { msfNodeById.set(node.id, node); (node.children || []).forEach(indexNodes); };
msf.phases.forEach((p) => p.nodes.forEach(indexNodes));

const cmdBlock = (lines = []) => lines.length
  ? `<pre class="msf-cmd"><code>${lines.map(esc).join("\n")}</code></pre>`
  : "";

const msfNode = (node, depth) => {
  const step = msfStepOf.get(node.id);
  const kids = node.children?.length
    ? `\n${"  ".repeat(depth + 6)}<ul class="msf-tree">${node.children.map((c) => msfNode(c, depth + 1)).join("")}</ul>`
    : "";
  const classes = ["msf-node", node.console ? "is-console" : "", step ? "is-step" : "", node.children?.length ? "has-kids" : ""].filter(Boolean).join(" ");
  return `
${"  ".repeat(depth + 5)}<li class="${classes}" id="node-${esc(node.id)}"${step ? ` data-step="${step}"` : ""}>
${"  ".repeat(depth + 6)}<details class="msf-node-box">
${"  ".repeat(depth + 7)}<summary>${step ? `<span class="msf-step-badge" aria-label="Workflow step ${step}">${step}</span>` : ""}<span class="msf-node-label">${esc(node.label)}</span></summary>
${"  ".repeat(depth + 7)}<div class="msf-node-body"><p>${esc(node.detail)}</p>${cmdBlock(node.cmd)}</div>
${"  ".repeat(depth + 6)}</details>${kids}
${"  ".repeat(depth + 5)}</li>`;
};

const msfPhase = (phase, i) => {
  // A "next" that points back up the spine is a loop (repeat, next target).
  const loop = phase.next && msf.phases.findIndex((p) => p.id === phase.next.to) < i;
  const next = phase.next
    ? `\n            <a class="msf-next${loop ? " is-loop" : ""}" href="#phase-${esc(phase.next.to)}" data-to="${esc(phase.next.to)}"><span aria-hidden="true">${loop ? "&#8634;" : "&#8595;"}</span> ${esc(phase.next.label)}</a>`
    : "";
  return `<li class="msf-phase" id="phase-${esc(phase.id)}">
            <header class="msf-phase-head">
              <span class="msf-phase-num">${pad(i + 1)}</span>
              <h2 class="msf-phase-title" id="phase-${esc(phase.id)}-title">${esc(phase.name)}</h2>
              <p class="msf-phase-blurb">${esc(phase.blurb)}</p>
            </header>
            <ul class="msf-tree msf-tree-root">${phase.nodes.map((n) => msfNode(n, 2)).join("")}
            </ul>${next}
          </li>`;
};

const msfWalk = () => `<section class="msf-walk" id="msf-walk" aria-labelledby="msf-walk-title">
          <div class="msf-walk-head">
            <h2 id="msf-walk-title">Module workflow</h2>
            <p>The path through the map from finding a module to running it: ${msf.workflow.length} msfconsole steps. Each step is marked on the map.</p>
          </div>
          <ol class="msf-walk-steps">
            ${msf.workflow.map((step, i) => {
              const node = msfNodeById.get(step.node);
              return `<li class="msf-walk-step" data-step="${i + 1}" data-node="${esc(step.node)}">
              <a class="msf-walk-tab" href="#node-${esc(step.node)}"><span class="msf-step-badge" aria-hidden="true">${i + 1}</span><span>${esc(step.title)}</span></a>
              <div class="msf-walk-card">
                <p>${esc(step.text)}</p>
                ${cmdBlock(node?.cmd)}
              </div>
            </li>`;
            }).join("\n            ")}
          </ol>
          <div class="msf-walk-controls" hidden>
            <button class="msf-walk-btn" type="button" data-walk="prev">Previous</button>
            <span class="msf-walk-pos" aria-live="polite"></span>
            <button class="msf-walk-btn" type="button" data-walk="next">Next</button>
          </div>
        </section>`;

const msfPage = () => {
  const url = `${SITE}/cpts/metasploit/`;
  const description = "An interactive map of a Metasploit engagement: enumeration, preparation, exploitation, privilege escalation and post-exploitation, with the msfconsole module workflow from search to run.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: msf.title,
    description,
    url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS", url: `${SITE}/cpts/` }
  };
  return `${head({ title: "Metasploit", description, url, jsonLd, image: SHARE_IMAGE, cssHref: `/cpts/metasploit/msf-map.css?v=${MSF_CSS_V}` })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#msf-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="msf-main" class="msf-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><span aria-current="page">Metasploit</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS &middot; Metasploit Framework</p>
              <h1>Metasploit<span class="signal-stop">.</span></h1>
              <p>${esc(msf.intro)}</p>
              <p class="msf-hero-link"><a href="/cpts/#tool-metasploit">Full command reference on the CPTS page</a></p>
            </div>
          </div>
        </section>
        ${msfWalk()}
        <section class="msf-map" aria-labelledby="msf-map-title">
          <div class="msf-map-head">
            <h2 id="msf-map-title">Engagement structure</h2>
            <div class="msf-map-tools" hidden>
              <button class="msf-tool-btn" type="button" data-expand="open">Open all</button>
              <button class="msf-tool-btn" type="button" data-expand="close">Close all</button>
            </div>
          </div>
          <ol class="msf-spine">
          ${msf.phases.map(msfPhase).join("\n          ")}
          </ol>
        </section>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/metasploit/msf-map.js?v=${MSF_JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- /cpts/password-cracking/: the John the Ripper crack map ----------
   Same shape as the Metasploit map (phases > node trees + a workflow), from
   cpts/content/password-cracking.json, plus two reference tables (the --format
   list and the *2john converters). The tree is always drawn; each node's
   explanation is a <details>, so the page is the whole map without scripts.
   cpts/password-cracking/pc-map.js adds the step-through walk, copy buttons and
   a filter on each table. */
const PC_CSS_V = "pc2";
const PC_JS_V = "pc1";
const pc = JSON.parse(readFileSync(resolve(CONTENT, "password-cracking.json"), "utf8"));
const pcNodeIds = new Set();
const pcPhaseIds = new Set(pc.phases.map((p) => p.id));
const pcWalkNode = (node, at) => {
  if (!node.id || !node.label || !node.detail) errors.push(`password-cracking.json: ${at} needs id, label and detail`);
  if (pcNodeIds.has(node.id)) errors.push(`password-cracking.json: duplicate node id "${node.id}"`);
  pcNodeIds.add(node.id);
  for (const child of node.children || []) pcWalkNode(child, `${at} > ${child.id}`);
};
for (const phase of pc.phases) {
  for (const node of phase.nodes) pcWalkNode(node, phase.id);
  if (phase.next && !pcPhaseIds.has(phase.next.to)) errors.push(`password-cracking.json: ${phase.id} next points at unknown phase "${phase.next.to}"`);
  if (phase.diagram && !diagramIds.has(phase.diagram)) errors.push(`password-cracking.json: ${phase.id} references unknown diagram "${phase.diagram}"`);
}
for (const step of pc.workflow) if (!pcNodeIds.has(step.node)) errors.push(`password-cracking.json: workflow step "${step.title}" points at unknown node "${step.node}"`);
for (const ref of pc.references || []) {
  if (!ref.id || !ref.title || !Array.isArray(ref.columns) || !Array.isArray(ref.rows)) errors.push(`password-cracking.json: reference "${ref.id || "?"}" needs id, title, columns and rows`);
  for (const row of ref.rows || []) if (row.length !== ref.columns.length) errors.push(`password-cracking.json: reference "${ref.id}" has a row with ${row.length} cells, expected ${ref.columns.length}`);
}
const pcStepOf = new Map(pc.workflow.map((step, i) => [step.node, i + 1]));
const pcNodeById = new Map();
const pcIndexNodes = (node) => { pcNodeById.set(node.id, node); (node.children || []).forEach(pcIndexNodes); };
pc.phases.forEach((p) => p.nodes.forEach(pcIndexNodes));

const pcCmdBlock = (lines = []) => lines.length
  ? `<pre class="pc-cmd"><code>${lines.map(esc).join("\n")}</code></pre>`
  : "";

const pcNode = (node, depth) => {
  const step = pcStepOf.get(node.id);
  const kids = node.children?.length
    ? `\n${"  ".repeat(depth + 6)}<ul class="pc-tree">${node.children.map((c) => pcNode(c, depth + 1)).join("")}</ul>`
    : "";
  const classes = ["pc-node", node.console ? "is-console" : "", step ? "is-step" : "", node.children?.length ? "has-kids" : ""].filter(Boolean).join(" ");
  return `
${"  ".repeat(depth + 5)}<li class="${classes}" id="pcnode-${esc(node.id)}"${step ? ` data-step="${step}"` : ""}>
${"  ".repeat(depth + 6)}<details class="pc-node-box">
${"  ".repeat(depth + 7)}<summary>${step ? `<span class="pc-step-badge" aria-label="Workflow step ${step}">${step}</span>` : ""}<span class="pc-node-label">${esc(node.label)}</span></summary>
${"  ".repeat(depth + 7)}<div class="pc-node-body"><p>${esc(node.detail)}</p>${pcCmdBlock(node.cmd)}</div>
${"  ".repeat(depth + 6)}</details>${kids}
${"  ".repeat(depth + 5)}</li>`;
};

const pcPhase = (phase, i) => {
  const loop = phase.next && pc.phases.findIndex((p) => p.id === phase.next.to) < i;
  const next = phase.next
    ? `\n            <a class="pc-next${loop ? " is-loop" : ""}" href="#pcphase-${esc(phase.next.to)}" data-to="${esc(phase.next.to)}"><span aria-hidden="true">${loop ? "&#8634;" : "&#8595;"}</span> ${esc(phase.next.label)}</a>`
    : "";
  return `<li class="pc-phase" id="pcphase-${esc(phase.id)}">
            <header class="pc-phase-head">
              <span class="pc-phase-num">${pad(i + 1)}</span>
              <h2 class="pc-phase-title" id="pcphase-${esc(phase.id)}-title">${esc(phase.name)}</h2>
              <p class="pc-phase-blurb">${esc(phase.blurb)}</p>
            </header>
            ${phase.diagram ? diagramBlock(phase.diagram) : ""}
            <ul class="pc-tree pc-tree-root">${phase.nodes.map((n) => pcNode(n, 2)).join("")}
            </ul>${next}
          </li>`;
};

const pcWalk = () => `<section class="pc-walk" id="pc-walk" aria-labelledby="pc-walk-title">
          <div class="pc-walk-head">
            <h2 id="pc-walk-title">Crack workflow</h2>
            <p>The path from a captured hash to a cracked password: ${pc.workflow.length} steps. Each step is marked on the map.</p>
          </div>
          <ol class="pc-walk-steps">
            ${pc.workflow.map((step, i) => {
              const node = pcNodeById.get(step.node);
              return `<li class="pc-walk-step" data-step="${i + 1}" data-node="${esc(step.node)}">
              <a class="pc-walk-tab" href="#pcnode-${esc(step.node)}"><span class="pc-step-badge" aria-hidden="true">${i + 1}</span><span>${esc(step.title)}</span></a>
              <div class="pc-walk-card">
                <p>${esc(step.text)}</p>
                ${pcCmdBlock(node?.cmd)}
              </div>
            </li>`;
            }).join("\n            ")}
          </ol>
          <div class="pc-walk-controls" hidden>
            <button class="pc-walk-btn" type="button" data-walk="prev">Previous</button>
            <span class="pc-walk-pos" aria-live="polite"></span>
            <button class="pc-walk-btn" type="button" data-walk="next">Next</button>
          </div>
        </section>`;

const pcTable = (ref) => {
  const headRow = ref.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const isCmd = (col) => /\b(value|tool|command|mode|symbol|function|package|hive|ip|gateway|username|password|path|binary|example|escape|registry|key|cmd|capability|privilege|file|filter|prefix)\b/i.test(col);
  const rows = ref.rows.map((row) => `<tr data-search="${esc(row.join(" ").toLowerCase())}">${row.map((cell, i) => `<td>${isCmd(ref.columns[i]) ? `<code>${esc(cell)}</code>` : esc(cell)}</td>`).join("")}</tr>`).join("\n                ");
  return `<section class="pc-ref" id="pcref-${esc(ref.id)}" aria-labelledby="pcref-${esc(ref.id)}-title">
          <div class="pc-ref-head">
            <h2 id="pcref-${esc(ref.id)}-title">${esc(ref.title)}</h2>
            ${ref.intro ? `<p class="pc-ref-intro">${esc(ref.intro)}</p>` : ""}
          </div>
          <div class="pc-ref-search" role="search">
            <label class="pc-ref-label" for="pcref-${esc(ref.id)}-q">Filter ${esc(ref.title.toLowerCase())}</label>
            <input class="tool-input pc-ref-input" id="pcref-${esc(ref.id)}-q" type="search" autocomplete="off" placeholder="raw-md5, ntlm, zip&hellip;" data-ref-filter="${esc(ref.id)}" />
            <span class="pc-ref-count" data-ref-count="${esc(ref.id)}" aria-live="polite"></span>
          </div>
          <div class="pc-ref-wrap">
            <table class="pc-ref-table" data-ref-table="${esc(ref.id)}">
              <thead><tr>${headRow}</tr></thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            <p class="pc-ref-empty" data-ref-empty="${esc(ref.id)}" hidden>No match. Try a format name, a value, or clear the filter.</p>
          </div>
        </section>`;
};

const pcPage = () => {
  const url = `${SITE}/cpts/password-cracking/`;
  const description = "An interactive map of password attacks: brute-forcing and spraying network services (WinRM, SSH, RDP, SMB) with NetExec, Evil-WinRM and Hydra, credential stuffing and defaults, dumping Windows credentials (SAM, LSA, NTDS, DPAPI) with reg.exe and secretsdump, and cracking the hashes offline with John the Ripper and Hashcat.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: pc.title,
    description,
    url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS", url: `${SITE}/cpts/` }
  };
  return `${head({ title: "Password attacks", description, url, jsonLd, image: SHARE_IMAGE, cssHref: `/cpts/password-cracking/pc-map.css?v=${PC_CSS_V}` })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#pc-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="pc-main" class="pc-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><span aria-current="page">Password attacks</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS &middot; Password attacks</p>
              <h1>Password attacks<span class="signal-stop">.</span></h1>
              <p>${esc(pc.intro)}</p>
              <p class="pc-hero-link"><a href="/cpts/#tool-hashcat">Full cracking command reference on the CPTS page</a></p>
            </div>
          </div>
        </section>
        ${pcWalk()}
        <section class="pc-map" aria-labelledby="pc-map-title">
          <div class="pc-map-head">
            <h2 id="pc-map-title">The crack, step by step</h2>
            <div class="pc-map-tools" hidden>
              <button class="pc-tool-btn" type="button" data-expand="open">Open all</button>
              <button class="pc-tool-btn" type="button" data-expand="close">Close all</button>
            </div>
          </div>
          <ol class="pc-spine">
          ${pc.phases.map(pcPhase).join("\n          ")}
          </ol>
        </section>
        ${(pc.references || []).map(pcTable).join("\n        ")}
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/password-cracking/pc-map.js?v=${PC_JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- /cpts/windows/ and /cpts/linux/: the OS quick-ops maps ----------
   Same shape as the password-cracking map (phases > node trees + optional
   reference tables), from cpts/content/<slug>-ops.json. These are grab-bag
   references with no single linear workflow, so there is no walk: the node tree
   and the reference tables are the whole page. They reuse the password-cracking
   renderer's pc- classes, stylesheet and script, so copy buttons, open/close
   all and the table filters work with no new assets. */
const OPS_MAPS = [
  {
    slug: "windows", file: "windows-ops.json", title: "Windows",
    eyebrow: "CPTS &middot; Windows quick ops", mapHeading: "Windows quick ops, mapped",
    description: "An interactive Windows post-exploitation reference: local enumeration, UAC bypass, privilege escalation (service misconfigurations, token privileges and potato attacks, AlwaysInstallElevated), living off the land with LOLBAS, and persistence, for authorised testing."
  },
  {
    slug: "linux", file: "linux-ops.json", title: "Linux",
    eyebrow: "CPTS &middot; Linux quick ops", mapHeading: "Linux quick ops, mapped",
    description: "An interactive Linux post-exploitation reference: local enumeration, privilege escalation (sudo and GTFOBins, SUID/SGID, capabilities, writable cron, PATH abuse, kernel exploit suggesters), persistence, and the handy one-liners, for authorised testing."
  },
  {
    slug: "credential-access", file: "credential-access.json", title: "Credential access",
    eyebrow: "CPTS &middot; Credential access & lateral movement", mapHeading: "Credential access, step by area",
    description: "An interactive credential-access and lateral-movement reference: hunting credentials on Windows and Linux hosts, in cleartext network traffic and across SMB shares, then reusing them with Pass-the-Hash, Pass-the-Ticket and Pass-the-Certificate, plus defensive notes on password policy and managers. For authorised testing."
  },
  {
    slug: "active-directory", file: "active-directory.json", title: "Active Directory attacks",
    eyebrow: "CPTS &middot; Active Directory attack chain", mapHeading: "The AD attack chain, step by step",
    description: "An interactive Active Directory attack-chain reference: domain enumeration and BloodHound, AS-REP roasting and Kerberoasting, delegation abuse (unconstrained, constrained, RBCD), ACL and GPO abuse, AD CS (ESC1-8), the high-value CVEs (Zerologon, noPac, PrintNightmare, PetitPotam), domain dominance (DCSync, golden/silver tickets) and crossing trusts. For authorised testing."
  }
];
const OPS_DATA = OPS_MAPS.map((meta) => ({ meta, data: JSON.parse(readFileSync(resolve(CONTENT, meta.file), "utf8")) }));

const opsCmdBlock = (lines = []) => lines.length
  ? `<pre class="pc-cmd"><code>${lines.map(esc).join("\n")}</code></pre>`
  : "";

const opsNode = (node, depth) => {
  const kids = node.children?.length
    ? `\n${"  ".repeat(depth + 6)}<ul class="pc-tree">${node.children.map((c) => opsNode(c, depth + 1)).join("")}</ul>`
    : "";
  const classes = ["pc-node", node.console ? "is-console" : "", node.children?.length ? "has-kids" : ""].filter(Boolean).join(" ");
  return `
${"  ".repeat(depth + 5)}<li class="${classes}" id="pcnode-${esc(node.id)}">
${"  ".repeat(depth + 6)}<details class="pc-node-box">
${"  ".repeat(depth + 7)}<summary><span class="pc-node-label">${esc(node.label)}</span></summary>
${"  ".repeat(depth + 7)}<div class="pc-node-body"><p>${esc(node.detail)}</p>${opsCmdBlock(node.cmd)}</div>
${"  ".repeat(depth + 6)}</details>${kids}
${"  ".repeat(depth + 5)}</li>`;
};

const opsPhase = (phases) => (phase, i) => {
  const loop = phase.next && phases.findIndex((p) => p.id === phase.next.to) < i;
  const next = phase.next
    ? `\n            <a class="pc-next${loop ? " is-loop" : ""}" href="#pcphase-${esc(phase.next.to)}" data-to="${esc(phase.next.to)}"><span aria-hidden="true">${loop ? "&#8634;" : "&#8595;"}</span> ${esc(phase.next.label)}</a>`
    : "";
  return `<li class="pc-phase" id="pcphase-${esc(phase.id)}">
            <header class="pc-phase-head">
              <span class="pc-phase-num">${pad(i + 1)}</span>
              <h2 class="pc-phase-title" id="pcphase-${esc(phase.id)}-title">${esc(phase.name)}</h2>
              <p class="pc-phase-blurb">${esc(phase.blurb)}</p>
            </header>
            ${phase.diagram ? diagramBlock(phase.diagram) : ""}
            <ul class="pc-tree pc-tree-root">${phase.nodes.map((n) => opsNode(n, 2)).join("")}
            </ul>${next}
          </li>`;
};

const opsPage = (data, meta) => {
  const ids = new Set();
  const phaseIds = new Set(data.phases.map((p) => p.id));
  const walk = (node, at) => {
    if (!node.id || !node.label || !node.detail) errors.push(`${meta.file}: ${at} needs id, label and detail`);
    if (ids.has(node.id)) errors.push(`${meta.file}: duplicate node id "${node.id}"`);
    ids.add(node.id);
    for (const child of node.children || []) walk(child, `${at} > ${child.id}`);
  };
  for (const phase of data.phases) {
    for (const node of phase.nodes) walk(node, phase.id);
    if (phase.next && !phaseIds.has(phase.next.to)) errors.push(`${meta.file}: ${phase.id} next points at unknown phase "${phase.next.to}"`);
    if (phase.diagram && !diagramIds.has(phase.diagram)) errors.push(`${meta.file}: ${phase.id} references unknown diagram "${phase.diagram}"`);
  }
  for (const ref of data.references || []) {
    if (!ref.id || !ref.title || !Array.isArray(ref.columns) || !Array.isArray(ref.rows)) errors.push(`${meta.file}: reference "${ref.id || "?"}" needs id, title, columns and rows`);
    for (const row of ref.rows || []) if (row.length !== ref.columns.length) errors.push(`${meta.file}: reference "${ref.id}" has a row with ${row.length} cells, expected ${ref.columns.length}`);
  }
  const url = `${SITE}/cpts/${meta.slug}/`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: data.title,
    description: meta.description,
    url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS", url: `${SITE}/cpts/` }
  };
  return `${head({ title: meta.title, description: meta.description, url, jsonLd, image: SHARE_IMAGE, cssHref: `/cpts/password-cracking/pc-map.css?v=${PC_CSS_V}` })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#pc-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="pc-main" class="pc-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><span aria-current="page">${esc(meta.title)}</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">${meta.eyebrow}</p>
              <h1>${esc(meta.title)}<span class="signal-stop">.</span></h1>
              <p>${esc(data.intro)}</p>
              <p class="pc-hero-link"><a href="/cpts/">Full command reference on the CPTS page</a></p>
            </div>
          </div>
        </section>
        <section class="pc-map" aria-labelledby="pc-map-title">
          <div class="pc-map-head">
            <h2 id="pc-map-title">${esc(meta.mapHeading)}</h2>
            <div class="pc-map-tools" hidden>
              <button class="pc-tool-btn" type="button" data-expand="open">Open all</button>
              <button class="pc-tool-btn" type="button" data-expand="close">Close all</button>
            </div>
          </div>
          <ol class="pc-spine">
          ${data.phases.map(opsPhase(data.phases)).join("\n          ")}
          </ol>
        </section>
        ${(data.references || []).map(pcTable).join("\n        ")}
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/password-cracking/pc-map.js?v=${PC_JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- /cpts/ discoverability: the interactive-maps card grid ----------
   One entry per interactive map; adding a map later is one row here. Rendered
   near the top of the CPTS page so the maps are no longer Ctrl+K-only. */
const INTERACTIVE_MAPS = [
  { href: "/cpts/metasploit/", title: "Metasploit", blurb: "A Metasploit engagement mapped out, with the msfconsole module workflow from search to run." },
  { href: "/cpts/password-cracking/", title: "Password attacks", blurb: "Online brute force and spraying, Windows credential dumping, and offline cracking with John the Ripper and Hashcat." },
  { href: "/cpts/windows/", title: "Windows quick ops", blurb: "Local enumeration, UAC bypass, privilege escalation, LOLBAS and persistence." },
  { href: "/cpts/linux/", title: "Linux quick ops", blurb: "Enumeration, privilege escalation (SUID, sudo, capabilities, cron), persistence and one-liners." },
  { href: "/cpts/credential-access/", title: "Credential access", blurb: "Hunting credentials on hosts, in traffic and on shares, then Pass-the-Hash, Pass-the-Ticket and Pass-the-Certificate." },
  { href: "/cpts/active-directory/", title: "Active Directory attacks", blurb: "The AD attack chain: enumerate, roast, abuse delegation, ACLs, GPOs and AD CS, chain the CVEs, then take domain dominance and cross trusts." }
];
const mapsSection = () => `<section class="cpts-maps" aria-labelledby="cpts-maps-title">
          <p class="cpts-maps-label" id="cpts-maps-title">Interactive maps</p>
          <div class="cpts-maps-grid">
            ${INTERACTIVE_MAPS.map((m) => `<a class="cpts-map-card" href="${esc(m.href)}">
              <span class="cpts-map-card-kicker">Map</span>
              <strong>${esc(m.title)}</strong>
              <p>${esc(m.blurb)}</p>
            </a>`).join("\n            ")}
          </div>
          <p class="cpts-maps-foot"><a href="/cpts/start/">Start here: where do I start? &rarr;</a> <span class="cpts-maps-sep">&middot;</span> <a href="/cpts/coverage/">See what every map covers &rarr;</a></p>
        </section>`;

/* ---------- the "How do I…" task index (leads the /cpts/ landing) ----------
   Playbooks grouped by area, each a link to its standalone walkthrough. The
   same grouped list is the /cpts/how-to/ hub. */
const howToAreas = () => AREAS.map((area) => {
  const list = playbooksByArea(area.id);
  if (!list.length) return "";
  return `<section class="howto-area">
            <h3 class="howto-area-name">${esc(area.name)}</h3>
            <ul class="howto-list">
              ${list.map((pb) => `<li><a class="howto-link" href="/cpts/how-to/${esc(pb.slug)}/">
                <span class="howto-link-title">${esc(pb.title)}</span>
                <span class="howto-link-goal">${esc(pb.goal)}</span>
              </a></li>`).join("\n              ")}
            </ul>
          </section>`;
}).filter(Boolean).join("\n          ");

const howToIndex = () => playbooks.length ? `<section class="cpts-howto" aria-labelledby="cpts-howto-title">
          <div class="cpts-howto-head">
            <p class="cpts-howto-eyebrow">Start here</p>
            <h2 id="cpts-howto-title">How do I&hellip;?</h2>
            <p class="cpts-howto-sub">Step-by-step walkthroughs for the things you actually do on an engagement &mdash; the command, the gotchas, and what to try when it fails. Stuck? Pick the task.</p>
          </div>
          <div class="cpts-howto-areas">
          ${howToAreas()}
          </div>
        </section>` : "";

const howToHub = () => {
  const url = `${SITE}/cpts/how-to/`;
  const description = "Task-first CPTS walkthroughs: how to do a Pass-the-Hash, Pass-the-Ticket, Kerberoast, LSASS dump and more — the exact commands, the gotchas, and what to try when it fails.";
  const jsonLd = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: "CPTS how-to", description, url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS", url: `${SITE}/cpts/` },
    hasPart: playbooks.map((pb) => ({ "@type": "TechArticle", headline: pb.title, url: `${SITE}/cpts/how-to/${pb.slug}/` }))
  };
  return `${head({ title: "CPTS how-to", description, url, jsonLd, image: SHARE_IMAGE })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#cpts-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="cpts-main" class="cpts-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><span aria-current="page">How-to</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS &middot; How-to</p>
              <h1>How do I&hellip;?<span class="signal-stop">.</span></h1>
              <p>Task-first walkthroughs for an engagement: the exact commands for a job, the gotchas, and what to try when it fails. For authorised testing.</p>
              <p class="pc-hero-link"><a href="/cpts/">Back to the full CPTS reference</a></p>
            </div>
          </div>
        </section>
        <div class="cpts-howto-areas cpts-howto-hub">
          ${howToAreas()}
        </div>
      </main>
      ${renderFooter()}
    </div>
  </body>
</html>
`;
};

const playbookPage = (pb) => {
  const url = `${SITE}/cpts/how-to/${pb.slug}/`;
  const area = areaById.get(pb.area);
  const jsonLd = {
    "@context": "https://schema.org", "@type": "TechArticle",
    headline: pb.title, description: pb.summary, url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS how-to", url: `${SITE}/cpts/how-to/` }
  };
  const need = pb.prereqs.length ? `<section class="howto-need" aria-label="What you need">
          <h2 class="howto-need-title">What you need</h2>
          <ul class="howto-need-list">${pb.prereqs.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        </section>` : "";
  const seeAlso = pb.seeAlso.length ? `<section class="howto-seealso" aria-label="See also">
          <h2 class="howto-seealso-title">See also</h2>
          <ul class="howto-seealso-list">${pb.seeAlso.map((s) => `<li><a href="${esc(s.href)}">${esc(s.label)}</a></li>`).join("")}</ul>
        </section>` : "";
  const refs = pb.references.length ? `<footer class="cpts-tool-foot howto-refs"><span class="cpts-sources-label">References</span>${pb.references.map((r) => `<a class="cpts-source-link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a>`).join("")}</footer>` : "";
  return `${head({ title: `How to: ${pb.title}`, description: pb.summary, url, jsonLd, image: SHARE_IMAGE })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#cpts-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="cpts-main" class="cpts-main howto-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><a href="/cpts/how-to/">How-to</a><span>/</span><span aria-current="page">${esc(pb.title)}</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS &middot; How-to &middot; ${esc(area?.name || "")}</p>
              <h1>${esc(pb.title)}<span class="signal-stop">.</span></h1>
              <p>${esc(pb.goal)}</p>
            </div>
          </div>
        </section>
        ${need}
        <article class="cpts-tool-body markdown-body howto-body">
          ${pb.body}
        </article>
        ${seeAlso}
        ${refs}
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/cpts-page.js?v=${JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- /cpts/coverage/: an index of what the interactive maps cover ----------
   Generated from the five map JSONs, so it never goes stale: every phase, every
   node label and every reference-table title, each linking to its anchor on the
   relevant map. A search box filters across the lot, so you can check which map
   a topic lives in before going looking. */
const opsBySlug = Object.fromEntries(OPS_DATA.map((o) => [o.meta.slug, o.data]));
const COVERAGE_MAPS = [
  { title: "Metasploit", href: "/cpts/metasploit/", data: msf, nodePrefix: "node", phasePrefix: "phase" },
  { title: "Password attacks", href: "/cpts/password-cracking/", data: pc, nodePrefix: "pcnode", phasePrefix: "pcphase" },
  { title: "Windows quick ops", href: "/cpts/windows/", data: opsBySlug.windows, nodePrefix: "pcnode", phasePrefix: "pcphase" },
  { title: "Linux quick ops", href: "/cpts/linux/", data: opsBySlug.linux, nodePrefix: "pcnode", phasePrefix: "pcphase" },
  { title: "Credential access", href: "/cpts/credential-access/", data: opsBySlug["credential-access"], nodePrefix: "pcnode", phasePrefix: "pcphase" },
  { title: "Active Directory attacks", href: "/cpts/active-directory/", data: opsBySlug["active-directory"], nodePrefix: "pcnode", phasePrefix: "pcphase" }
];
const COV_CSS_V = "cov1";
const COV_JS_V = "cov1";

const covNodeRows = (nodes, map, phaseName, depth = 0) => nodes.map((n) => {
  const search = `${n.label} ${phaseName} ${map.title}`.toLowerCase();
  const kids = n.children?.length ? covNodeRows(n.children, map, phaseName, depth + 1) : "";
  return `<li class="cov-node" data-depth="${Math.min(depth, 3)}" data-search="${esc(search)}"><a href="${map.href}#${map.nodePrefix}-${esc(n.id)}">${esc(n.label)}</a></li>${kids}`;
}).join("");

const covPhaseItem = (map) => (phase) => `<li class="cov-phase" data-search="${esc(`${phase.name} ${map.title}`.toLowerCase())}">
            <a class="cov-phase-link" href="${map.href}#${map.phasePrefix}-${esc(phase.id)}">${esc(phase.name)}</a>
            <ul class="cov-nodes">${covNodeRows(phase.nodes, map, phase.name)}</ul>
          </li>`;

const covRefsItem = (map) => {
  const refs = map.data.references || [];
  if (!refs.length) return "";
  return `<li class="cov-phase" data-search="${esc(`reference tables ${map.title}`.toLowerCase())}">
            <span class="cov-phase-link cov-phase-static">Reference tables</span>
            <ul class="cov-nodes">${refs.map((r) => `<li class="cov-node" data-depth="0" data-search="${esc(`${r.title} ${map.title}`.toLowerCase())}"><a href="${map.href}#pcref-${esc(r.id)}">${esc(r.title)}</a></li>`).join("")}</ul>
          </li>`;
};

const covMapSection = (map) => `<section class="cov-map" data-search="${esc(map.title.toLowerCase())}">
          <h2 class="cov-map-title"><a href="${map.href}">${esc(map.title)}</a></h2>
          <ul class="cov-phases">
            ${map.data.phases.map(covPhaseItem(map)).join("\n            ")}
            ${covRefsItem(map)}
          </ul>
        </section>`;

const coveragePage = () => {
  const url = `${SITE}/cpts/coverage/`;
  const description = "An index of every CPTS interactive map: the phases, techniques and reference tables each one covers, with a search to find which map a topic lives in.";
  const nodeTotal = COVERAGE_MAPS.reduce((sum, map) => {
    const count = (nodes) => nodes.reduce((n, node) => n + 1 + (node.children ? count(node.children) : 0), 0);
    return sum + map.data.phases.reduce((n, p) => n + count(p.nodes), 0);
  }, 0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "What the CPTS maps cover",
    description,
    url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS", url: `${SITE}/cpts/` }
  };
  return `${head({ title: "What the maps cover", description, url, jsonLd, image: SHARE_IMAGE, cssHref: `/cpts/coverage/coverage.css?v=${COV_CSS_V}` })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#cov-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="cov-main" class="cov-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><span aria-current="page">What's covered</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS &middot; Coverage index</p>
              <h1>What the maps cover<span class="signal-stop">.</span></h1>
              <p>Every phase, technique and reference table in the ${COVERAGE_MAPS.length} interactive maps, in one searchable list. Check where a topic lives before going looking, then jump straight to it.</p>
            </div>
          </div>
        </section>
        <div class="cov-search" role="search">
          <label class="cov-search-label" for="cov-q">Search the maps</label>
          <div class="cov-search-row">
            <input class="tool-input cov-search-input" id="cov-q" type="search" autocomplete="off" placeholder="pass the hash, lsass, kerberoast, shadow, suid&hellip;" />
            <span class="cov-search-count" id="cov-count" aria-live="polite">${nodeTotal} techniques across ${COVERAGE_MAPS.length} maps</span>
          </div>
        </div>
        <div class="cov-maps" id="cov-maps">
          ${COVERAGE_MAPS.map(covMapSection).join("\n        ")}
          <p class="cov-empty" id="cov-empty" hidden>No map covers that yet. Try a tool name, a protocol, or clear the search.</p>
        </div>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/coverage/coverage.js?v=${COV_JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- /cpts/start/: the scenario router ("Where do I start?") ----------
   From cpts/content/scenarios.json: groups of situations, each an expandable
   play of ordered steps (text + commands + a link to the tool or map that does
   the work). A search filters every play. Without scripts the page is the whole
   playbook; cpts/start/start.js adds the search, copy buttons and page chrome. */
const SC_CSS_V = "sc1";
const SC_JS_V = "sc1";
const scenarios = JSON.parse(readFileSync(resolve(CONTENT, "scenarios.json"), "utf8"));
for (const group of scenarios.groups) {
  if (!group.id || !group.name || !Array.isArray(group.scenarios)) errors.push(`scenarios.json: group "${group.id || "?"}" needs id, name and scenarios`);
  for (const sc of group.scenarios || []) {
    if (!sc.id || !sc.label || !Array.isArray(sc.steps) || !sc.steps.length) errors.push(`scenarios.json: scenario "${sc.id || "?"}" needs id, label and steps`);
    for (const step of sc.steps || []) if (!step.text) errors.push(`scenarios.json: a step in "${sc.id}" needs text`);
  }
}

const scCmd = (lines = []) => lines.length
  ? `<pre class="sc-cmd"><code>${lines.map(esc).join("\n")}</code></pre>`
  : "";

const scStep = (step) => `<li class="sc-step">
              <p class="sc-step-text">${esc(step.text)}</p>
              ${scCmd(step.cmd)}
              ${step.link ? `<a class="sc-step-link" href="${esc(step.link)}">${esc(step.linkLabel || "Open")} &rarr;</a>` : ""}
            </li>`;

const scItem = (sc) => {
  const search = [sc.label, sc.detail || "", ...sc.steps.flatMap((s) => [s.text, ...(s.cmd || []), s.linkLabel || ""])].join(" ").toLowerCase();
  return `<li class="sc-item" data-search="${esc(search)}">
          <details class="sc-box">
            <summary class="sc-summary">
              <span class="sc-label">${esc(sc.label)}</span>
              ${sc.detail ? `<span class="sc-detail">${esc(sc.detail)}</span>` : ""}
            </summary>
            <ol class="sc-steps">
            ${sc.steps.map(scStep).join("\n            ")}
            </ol>
          </details>
        </li>`;
};

const scGroup = (group) => `<section class="sc-group" id="scgroup-${esc(group.id)}" aria-labelledby="scgroup-${esc(group.id)}-title">
        <header class="sc-group-head">
          <h2 id="scgroup-${esc(group.id)}-title">${esc(group.name)}</h2>
          ${group.blurb ? `<p class="sc-group-blurb">${esc(group.blurb)}</p>` : ""}
        </header>
        <ul class="sc-list">
          ${group.scenarios.map(scItem).join("\n          ")}
        </ul>
      </section>`;

const scenariosPage = () => {
  const url = `${SITE}/cpts/start/`;
  const description = "A scenario router for a live pentest: pick your situation (an open port, a shell, credentials, attacking AD) and jump straight to the next commands and the tool that does the work.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: scenarios.title,
    description,
    url,
    isPartOf: { "@type": "CollectionPage", name: "CPTS", url: `${SITE}/cpts/` }
  };
  const total = scenarios.groups.reduce((n, g) => n + g.scenarios.length, 0);
  return `${head({ title: "Start here", description, url, jsonLd, image: SHARE_IMAGE, cssHref: `/cpts/start/start.css?v=${SC_CSS_V}` })}
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#sc-main">Skip to the content</a>
    <div class="page-shell">
      ${renderHeader({ label: "CPTS", current: "cpts" })}
      <main id="sc-main" class="sc-main">
        <nav class="learn-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cpts/">CPTS</a><span>/</span><span aria-current="page">Start here</span></nav>
        <section class="page-hero">
          <div class="page-hero-card">
            <canvas class="hero-dither" aria-hidden="true"></canvas>
            <div class="page-hero-copy">
              <p class="eyebrow">CPTS &middot; Scenario router</p>
              <h1>Where do I start?<span class="signal-stop">.</span></h1>
              <p>${esc(scenarios.intro)}</p>
            </div>
          </div>
        </section>
        <div class="sc-search" role="search">
          <label class="sc-search-label" for="sc-q">Search the plays</label>
          <div class="sc-search-row">
            <input class="tool-input sc-search-input" id="sc-q" type="search" autocomplete="off" placeholder="smb, got a shell, ntlm hash, kerberoast&hellip;" />
            <span class="sc-search-count" id="sc-count" aria-live="polite">${total} situations</span>
          </div>
        </div>
        <div class="sc-groups" id="sc-groups">
          ${scenarios.groups.map(scGroup).join("\n        ")}
          <p class="sc-empty" id="sc-empty" hidden>No play matches. Try a service, a port, or clear the search.</p>
        </div>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/cpts/start/start.js?v=${SC_JS_V}"></script>
  </body>
</html>
`;
};

/* ---------- Ctrl+K palette entries ---------- */
const paletteEntries = () => {
  const entries = [{
    label: "CPTS arsenal", type: "CPTS",
    detail: "Command-first pentest reference organised by target (network, web, AD, Windows, Linux): search by port, service or tool",
    href: "/cpts/", terms: ["cpts", "pentest", "target", "network", "web", "active directory", "windows", "linux", "credentials", "pivoting", "tools", "commands", "arsenal"]
  }, {
    label: "How do I…? (task-first walkthroughs)", type: "CPTS",
    detail: "Step-by-step how-to pages for the things you do on an engagement — Pass-the-Hash, Pass-the-Ticket, Kerberoast, dumping LSASS and more — the exact command, the gotchas, and what to try when it fails",
    href: "/cpts/how-to/", terms: ["cpts", "how do i", "how to", "walkthrough", "playbook", "step by step", "guide", "task", "pass the hash", "pass the ticket", "kerberoast", "lsass", "stuck", "initial access", "foothold"]
  }, {
    label: "Start here: where do I start? (scenario router)", type: "CPTS",
    detail: "Pick your situation on a live pentest — an open port, a shell, credentials, attacking AD — and jump straight to the next commands",
    href: "/cpts/start/", terms: ["cpts", "start", "where do i start", "scenario", "router", "playbook", "what next", "stuck", "foothold", "smb open", "got a shell", "ntlm hash", "on a pentest", "quick"]
  }, {
    label: "Metasploit engagement map", type: "CPTS",
    detail: "Interactive map of a Metasploit engagement and the msfconsole module workflow, from search to run",
    href: "/cpts/metasploit/", terms: ["cpts", "metasploit", "msfconsole", "msf", "engagement", "workflow", "module"]
  }, {
    label: "Password attacks (online, dumping & cracking)", type: "CPTS",
    detail: "Interactive map of password attacks: brute-forcing services (WinRM, SSH, RDP, SMB) with NetExec, Evil-WinRM and Hydra, spraying and defaults, dumping Windows credentials (SAM, LSA, NTDS, DPAPI), and offline cracking with John the Ripper and Hashcat",
    href: "/cpts/password-cracking/", terms: ["cpts", "password", "attacks", "cracking", "john", "jtr", "hashcat", "netexec", "nxc", "evil-winrm", "winrm", "hydra", "ssh", "rdp", "smb", "spraying", "stuffing", "default credentials", "secretsdump", "sam", "lsa", "lsass", "pypykatz", "mimikatz", "ntds", "dpapi", "dcc2", "ntlm", "credential manager", "vault", "cmdkey", "runas", "sekurlsa", "ntds", "ntds.dit", "active directory", "kerbrute", "username-anarchy", "vssadmin", "ntdsutil", "pass-the-hash", "pth", "wordlist", "rules", "cewl", "mask", "2john", "bitlocker", "linux", "passwd", "shadow", "unshadow", "opasswd", "pam", "pam_unix", "yescrypt", "sha512crypt", "md5crypt", "sha256crypt", "bcrypt", "shadow hash", "/etc/shadow", "/etc/passwd"]
  }, {
    label: "Windows quick ops (enum, UAC, privesc, LOLBAS, persistence)", type: "CPTS",
    detail: "Interactive Windows post-exploitation map: local enumeration (whoami, systeminfo, net), UAC bypass (fodhelper, computerdefaults), privilege escalation (service misconfigs, token privileges, potato attacks, AlwaysInstallElevated), LOLBAS, and persistence",
    href: "/cpts/windows/", terms: ["cpts", "windows", "quick ops", "post-exploitation", "enumeration", "whoami", "systeminfo", "net user", "net localgroup", "tasklist", "uac", "uac bypass", "fodhelper", "computerdefaults", "eventvwr", "sdclt", "uacme", "privesc", "privilege escalation", "winpeas", "powerup", "sharpup", "unquoted service path", "weak service permissions", "alwaysinstallelevated", "token privileges", "seimpersonate", "sebackup", "potato", "printspoofer", "godpotato", "juicypotato", "lolbas", "certutil", "bitsadmin", "regsvr32", "rundll32", "mshta", "living off the land", "persistence", "run keys", "scheduled tasks", "schtasks", "amsi", "defender", "evasion"]
  }, {
    label: "Linux quick ops (enum, privesc, persistence, one-liners)", type: "CPTS",
    detail: "Interactive Linux post-exploitation map: local enumeration (id, sudo -l, uname), privilege escalation (sudo + GTFOBins, SUID/SGID, capabilities, writable cron, PATH abuse, kernel suggesters), persistence, and handy one-liners",
    href: "/cpts/linux/", terms: ["cpts", "linux", "quick ops", "post-exploitation", "enumeration", "id", "sudo -l", "uname", "cat /etc/passwd", "crontab", "ss", "ps aux", "privesc", "privilege escalation", "linpeas", "linenum", "lse", "sudo", "gtfobins", "suid", "sgid", "find perm 4000", "capabilities", "getcap", "cap_setuid", "writable cron", "path abuse", "kernel exploit", "linux-exploit-suggester", "les", "pwnkit", "dirtypipe", "dirtycow", "baron samedit", "persistence", "authorized_keys", "ssh key", "systemd", "bashrc", "reverse shell", "tty upgrade", "one-liners", "file transfer"]
  }, {
    label: "Credential access & lateral movement (hunting, PtH, PtT, PtC)", type: "CPTS",
    detail: "Interactive map: hunting credentials on Windows and Linux hosts, in cleartext traffic and SMB shares (LaZagne, findstr, mimipenguin, firefox_decrypt, Wireshark, Pcredz, Snaffler, MANSPIDER, NetExec), then Pass-the-Hash, Pass-the-Ticket (Windows and Linux) and Pass-the-Certificate, with defensive notes",
    href: "/cpts/credential-access/", terms: ["cpts", "credential access", "credential hunting", "lateral movement", "pass the hash", "pth", "pass the ticket", "ptt", "pass the certificate", "ptc", "overpass the hash", "pass the key", "lazagne", "findstr", "mimipenguin", "firefox_decrypt", "logins.json", "cmdkey", "snaffler", "powerhuntshares", "manspider", "netexec", "nxc", "spider", "wireshark", "pcredz", "pcap", "cleartext", "mimikatz", "sekurlsa", "rubeus", "asktgt", "kerberos", "ticket", "kirbi", "ccache", "keytab", "kinit", "klist", "krb5ccname", "keytabextract", "ticketconverter", "linikatz", "impacket", "psexec", "wmiexec", "evil-winrm", "xfreerdp", "invoke-thehash", "ntlm", "localaccounttokenfilterpolicy", "pkinit", "esc8", "ntlmrelayx", "printerbug", "gettgtpkinit", "shadow credentials", "pywhisker", "dcsync", "password policy", "password manager", "passwordless", "fido2"]
  }, {
    label: "Active Directory attacks (enum, roast, delegation, ADCS, CVEs, dominance)", type: "CPTS",
    detail: "Interactive AD attack-chain map: domain enumeration and BloodHound, AS-REP roasting and Kerberoasting, delegation abuse (unconstrained, constrained, RBCD), ACL and GPO abuse, AD CS (ESC1-8), the high-value CVEs (Zerologon, noPac, PrintNightmare, PetitPotam, Certifried), domain dominance (DCSync, golden/silver/diamond tickets) and crossing domain trusts",
    href: "/cpts/active-directory/", terms: ["cpts", "active directory", "ad", "domain", "attack chain", "enumeration", "bloodhound", "sharphound", "powerview", "kerbrute", "rid cycling", "enum4linux", "ldapsearch", "kerberos", "kerberoast", "kerberoasting", "as-rep", "asreproast", "targeted kerberoast", "hashcat 13100", "hashcat 18200", "delegation", "unconstrained delegation", "constrained delegation", "s4u", "s4u2self", "s4u2proxy", "rbcd", "resource-based constrained delegation", "getst", "rbcd.py", "addcomputer", "machineaccountquota", "printerbug", "spoolsample", "acl", "acl abuse", "genericall", "genericwrite", "writedacl", "writeowner", "forcechangepassword", "addmember", "shadow credentials", "pywhisker", "certipy", "gpo", "gpo abuse", "sharpgpoabuse", "pygpoabuse", "ad cs", "adcs", "certificate services", "esc1", "esc2", "esc3", "esc4", "esc6", "esc7", "esc8", "certify", "pkinit", "zerologon", "cve-2020-1472", "nopac", "samaccountname spoofing", "cve-2021-42278", "cve-2021-42287", "printnightmare", "cve-2021-34527", "cve-2021-1675", "petitpotam", "efsrpc", "cve-2021-36942", "certifried", "cve-2022-26923", "ntlmrelayx", "dcsync", "secretsdump", "golden ticket", "silver ticket", "diamond ticket", "ticketer", "krbtgt", "mimikatz", "dsrm", "adminsdholder", "domain admin", "enterprise admin", "trust", "trusts", "sid history", "extrasid", "raisechild", "forest", "nltest", "get-domaintrust"]
  }, {
    label: "What the maps cover (coverage index)", type: "CPTS",
    detail: "A searchable index of every interactive map — the phases, techniques and reference tables each one covers — to find which map a topic lives in before going looking",
    href: "/cpts/coverage/", terms: ["cpts", "coverage", "index", "what's covered", "maps", "contents", "table of contents", "search", "which map", "topics"]
  }];
  for (const pb of playbooks) {
    entries.push({
      label: `How to: ${pb.title}`, type: "CPTS how-to",
      detail: pb.summary, href: `/cpts/how-to/${pb.slug}/`,
      terms: ["cpts", "how to", "how do i", "walkthrough", areaById.get(pb.area)?.name.toLowerCase() || pb.area, ...pb.title.toLowerCase().split(/\s+/)]
    });
  }
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
              <span class="actor-card-kicker">${count} tool${count === 1 ? "" : "s"}</span>
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
  ["cpts/index.json", `${JSON.stringify(paletteEntries())}\n`],
  ["cpts/metasploit/index.html", msfPage()],
  ["cpts/password-cracking/index.html", pcPage()],
  ...OPS_DATA.map(({ meta, data }) => [`cpts/${meta.slug}/index.html`, opsPage(data, meta)]),
  ["cpts/coverage/index.html", coveragePage()],
  ["cpts/start/index.html", scenariosPage()],
  ["cpts/how-to/index.html", howToHub()],
  ...playbooks.map((pb) => [`cpts/how-to/${pb.slug}/index.html`, playbookPage(pb)])
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
