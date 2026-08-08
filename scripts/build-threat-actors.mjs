import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = resolve(ROOT, "threat-actors", "content");
const OUTPUT_ROOT = resolve(ROOT, "threat-actors");
const SCHEMA_FILE = resolve(OUTPUT_ROOT, "schema-v1.json");
const CHECK = process.argv.includes("--check");
const SITE = "https://paracausaltelemetry.com";
const errors = [];
const outputs = new Map();

const SCHEMA = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
const SCHEMA_VERSION = SCHEMA.properties.schemaVersion.const;
const CONFIDENCE = new Set(SCHEMA.$defs.confidence.enum);
const RELATIONSHIPS = new Set(SCHEMA.$defs.relationship.enum);
const ATTACK_DOMAINS = new Set(SCHEMA.$defs.attackDomain.enum);
const INDICATOR_TYPES = new Set(SCHEMA.$defs.indicatorType.enum);
const INDICATOR_STATUS = new Set(SCHEMA.$defs.indicatorStatus.enum);
const REQUIRED_ARRAYS = [
  "observedSince", "designations", "assessment", "campaigns", "capabilities", "malware",
  "indicators", "defensivePriorities", "sources"
];

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const jsonForHtml = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const titleCase = (value = "") => String(value).replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const writeOutput = (file, content) => {
  const normalized = content.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  outputs.set(resolve(file), normalized);
  if (CHECK) {
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current !== normalized) errors.push(`${relative(ROOT, file)}: generated output is stale`);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, normalized, "utf8");
};

const readActors = () => readdirSync(SOURCE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => {
    const file = resolve(SOURCE_ROOT, entry.name);
    try {
      return { ...JSON.parse(readFileSync(file, "utf8")), sourceFile: relative(ROOT, file).replaceAll("\\", "/") };
    } catch (error) {
      errors.push(`${relative(ROOT, file)}: invalid JSON (${error.message})`);
      return null;
    }
  })
  .filter(Boolean);

const validateSourceReferences = (value, sourceIds, actor, path = actor.slug) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSourceReferences(item, sourceIds, actor, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "sourceIds") {
      if (!Array.isArray(child) || !child.length) errors.push(`${actor.sourceFile}: ${path}.sourceIds must be a non-empty array`);
      for (const sourceId of child || []) if (!sourceIds.has(sourceId)) errors.push(`${actor.sourceFile}: ${path} references unknown source ${sourceId}`);
      continue;
    }
    validateSourceReferences(child, sourceIds, actor, `${path}.${key}`);
  }
};

const validateClaimCollection = (actor, name) => {
  for (const [index, item] of (actor[name] || []).entries()) {
    if (!item || typeof item !== "object") errors.push(`${actor.sourceFile}: ${name}[${index}] must be an object`);
    else if (!Array.isArray(item.sourceIds) || !item.sourceIds.length) errors.push(`${actor.sourceFile}: ${name}[${index}] needs sourceIds`);
  }
};

const validateActor = (actor) => {
  for (const key of ["id", "slug", "name", "summary", "distribution", "status", "actorType", "primaryFocus", "lastReviewed", "overallConfidence", "stateAffiliation", "targets", "ttps", "indicatorNotice"]) {
    if (actor[key] === undefined || actor[key] === "") errors.push(`${actor.sourceFile}: missing ${key}`);
  }
  for (const key of REQUIRED_ARRAYS) if (!Array.isArray(actor[key])) errors.push(`${actor.sourceFile}: ${key} must be an array`);
  if (actor.schemaVersion !== SCHEMA_VERSION) errors.push(`${actor.sourceFile}: schemaVersion must be ${SCHEMA_VERSION}`);
  if (!/^actor-[a-z0-9-]+$/.test(actor.id || "")) errors.push(`${actor.sourceFile}: invalid actor id`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(actor.slug || "")) errors.push(`${actor.sourceFile}: invalid slug`);
  if (!isDate(actor.lastReviewed)) errors.push(`${actor.sourceFile}: invalid lastReviewed date`);
  if (!CONFIDENCE.has(actor.overallConfidence)) errors.push(`${actor.sourceFile}: unsupported overall confidence`);
  if (!CONFIDENCE.has(actor.stateAffiliation?.confidence)) errors.push(`${actor.sourceFile}: unsupported affiliation confidence`);
  if (!Array.isArray(actor.sources) || actor.sources.length < 2) errors.push(`${actor.sourceFile}: at least two sources are required`);

  const sourceIds = new Set();
  for (const source of actor.sources || []) {
    if (!source.id || sourceIds.has(source.id)) errors.push(`${actor.sourceFile}: duplicate or missing source id ${source.id || "missing"}`);
    sourceIds.add(source.id);
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      errors.push(`${actor.sourceFile}: source ${source.id || "missing"} must use a valid HTTPS URL`);
    }
    if (!isDate(source.published)) errors.push(`${actor.sourceFile}: source ${source.id || "missing"} has invalid published date`);
    if (source.updated && !isDate(source.updated)) errors.push(`${actor.sourceFile}: source ${source.id || "missing"} has invalid updated date`);
  }

  for (const designation of actor.designations || []) {
    if (!RELATIONSHIPS.has(designation.relationship)) errors.push(`${actor.sourceFile}: unsupported designation relationship ${designation.relationship}`);
    if (!CONFIDENCE.has(designation.confidence)) errors.push(`${actor.sourceFile}: unsupported designation confidence`);
  }
  for (const collection of ["assessment", "campaigns", "capabilities", "malware"]) {
    for (const item of actor[collection] || []) if (item.confidence && !CONFIDENCE.has(item.confidence)) errors.push(`${actor.sourceFile}: ${collection} has unsupported confidence`);
  }

  const campaignIds = new Set();
  for (const campaign of actor.campaigns || []) {
    if (!campaign.id || campaignIds.has(campaign.id)) errors.push(`${actor.sourceFile}: duplicate or missing campaign id ${campaign.id || "missing"}`);
    campaignIds.add(campaign.id);
  }

  for (const [domain, techniques] of Object.entries(actor.ttps || {})) {
    if (!ATTACK_DOMAINS.has(domain)) errors.push(`${actor.sourceFile}: unsupported ATT&CK domain ${domain}`);
    if (!Array.isArray(techniques) || !techniques.length) errors.push(`${actor.sourceFile}: ${domain} TTPs must be a non-empty array`);
    const ids = new Set();
    for (const technique of techniques || []) {
      if (!/^T\d{4}(?:\.\d{3})?$/.test(technique.id || "")) errors.push(`${actor.sourceFile}: invalid ${domain} ATT&CK id ${technique.id || "missing"}`);
      if (ids.has(technique.id)) errors.push(`${actor.sourceFile}: duplicate ${domain} ATT&CK id ${technique.id}`);
      ids.add(technique.id);
      if (!CONFIDENCE.has(technique.confidence)) errors.push(`${actor.sourceFile}: ${technique.id || "technique"} has unsupported confidence`);
      if (!Array.isArray(technique.sourceIds) || !technique.sourceIds.length) errors.push(`${actor.sourceFile}: ${technique.id || "technique"} needs sourceIds`);
    }
  }

  for (const indicator of actor.indicators || []) {
    if (!INDICATOR_TYPES.has(indicator.type)) errors.push(`${actor.sourceFile}: unsupported indicator type ${indicator.type}`);
    if (!INDICATOR_STATUS.has(indicator.status)) errors.push(`${actor.sourceFile}: unsupported indicator status ${indicator.status}`);
    if (!isDate(indicator.reported)) errors.push(`${actor.sourceFile}: indicator ${indicator.value || "missing"} has invalid reported date`);
    if (indicator.type === "sha256" && !/^[a-f0-9]{64}$/i.test(indicator.value || "")) errors.push(`${actor.sourceFile}: invalid SHA-256 ${indicator.value || "missing"}`);
    if (indicator.type === "ipv4") {
      const parts = String(indicator.value || "").split(".").map(Number);
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) errors.push(`${actor.sourceFile}: invalid IPv4 ${indicator.value || "missing"}`);
    }
  }

  for (const collection of ["observedSince", "designations", "assessment", "campaigns", "capabilities", "malware", "indicators", "defensivePriorities"]) validateClaimCollection(actor, collection);
  for (const collection of ["regions", "sectors", "technologies"]) validateClaimCollection(actor.targets || {}, collection);
  for (const techniques of Object.values(actor.ttps || {})) techniques.forEach((technique, index) => {
    if (!Array.isArray(technique.sourceIds) || !technique.sourceIds.length) errors.push(`${actor.sourceFile}: TTP[${index}] needs sourceIds`);
  });
  validateSourceReferences(actor, sourceIds, actor);
};

const sourceMapFor = (actor) => new Map(actor.sources.map((source) => [source.id, source]));
const sourcesFor = (actor, ids = []) => {
  const sourceMap = sourceMapFor(actor);
  const chips = ids.map((id) => sourceMap.get(id)).filter(Boolean).map((source) => `<a class="actor-source-chip" href="#source-${esc(source.id)}">${esc(source.publisher)}</a>`).join("");
  if (!chips) return "";
  return `<span class="actor-claim-sources"><span class="actor-claim-sources-label">Sources</span>${chips}</span>`;
};
const domainLabel = (domain) => (domain === "ics" ? "ICS" : titleCase(domain));
const confidence = (value) => `<span class="actor-confidence actor-confidence-${esc(value)}">${esc(titleCase(value))} confidence</span>`;
const dateDisplay = (value) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const attackUrl = (id) => `https://attack.mitre.org/techniques/${id.replace(".", "/")}/`;

// Microsoft Security "weather" naming taxonomy, keyed by nation-state origin.
// Icons are original minimal hex glyphs in the site line style (not Microsoft artwork).
const MS_FAMILIES = {
  russia: { name: "Blizzard", glyph: `<path d="M22 11v22M12.5 16.5 31.5 27.5M12.5 27.5 31.5 16.5"/>` },
  iran: { name: "Sandstorm", glyph: `<path d="M14 18c2.7-2 5.3-2 8 0s5.3 2 8 0M14 22c2.7-2 5.3-2 8 0s5.3 2 8 0M14 26c2.7-2 5.3-2 8 0s5.3 2 8 0"/>` },
  china: { name: "Typhoon", glyph: `<path d="M28 16a8.5 8.5 0 1 0 2.5 6M22 22a4.2 4.2 0 1 1 4.5-3.4"/>` },
  "north korea": { name: "Sleet", glyph: `<path d="M17 15l-2 5.5M23 14l-2 5.5M29 15l-2 5.5"/><circle cx="18.5" cy="28.5" r="1.1"/><circle cx="24" cy="30.5" r="1.1"/><circle cx="29" cy="27.5" r="1.1"/>` }
};
const STORM_FAMILY = { name: "Storm", glyph: `<path d="M22 15l6 3.5v7l-6 3.5-6-3.5v-7z"/>` };
const familyFor = (actor) => MS_FAMILIES[String(actor.stateAffiliation.state || "").toLowerCase()] || STORM_FAMILY;
const familyIcon = (family) => `<svg class="actor-family-icon" viewBox="0 0 44 44" fill="none" aria-hidden="true"><path class="actor-family-hex" d="M12.5 5.5H31.5L41 22 31.5 38.5H12.5L3 22Z"/><g class="actor-family-glyph">${family.glyph}</g></svg>`;
const familyCover = (actor) => {
  const family = familyFor(actor);
  return `<div class="actor-family-cover">${familyIcon(family)}<span class="actor-family-copy"><span class="actor-family-kicker">Microsoft family</span><strong>${esc(family.name)}</strong><span class="actor-family-origin">${esc(actor.stateAffiliation.state)}</span></span></div>`;
};

const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)pt_theme=(light|dark)/);var t=m?m[1]:localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="light"||(!t&&!d))document.body.classList.add("light-mode");}catch(e){}})();`;
const csp = "default-src 'self'; script-src 'self' 'sha256-E78K00z4s7Xzzc3wFOrVriwQJVuws7A0CUbiVkRYqBQ='; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self';";

const documentHead = ({ title, description, path, type = "website", jsonLd }) => `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index,follow" />
    <meta name="theme-color" content="#0a0b0c" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <link rel="canonical" href="${SITE}${esc(path)}" />
    <meta property="og:type" content="${esc(type)}" />
    <meta property="og:site_name" content="Paracausal Telemetry" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}${esc(path)}" />
    <meta property="og:image" content="${SITE}/src/og/threat-actors.png?v=pt" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${SITE}/src/og/threat-actors.png?v=pt" />

    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg?v=5" />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/geist-var.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/src/fonts/space-grotesk-var.woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css?v=276fa973-serif" />
    <link rel="stylesheet" href="/threat-actors/threat-actors.css?v=276fa973-crumb-tap" />
    <script type="application/ld+json">${jsonForHtml(jsonLd)}</script>`;

const actorSummary = (actor) => ({
  id: actor.id,
  slug: actor.slug,
  name: actor.name,
  summary: actor.summary,
  status: actor.status,
  actorType: actor.actorType,
  state: actor.stateAffiliation.state,
  sectors: actor.targets.sectors.map((item) => item.name),
  designations: actor.designations.map(({ provider, name, externalId, relationship }) => ({ provider, name, externalId, relationship })),
  lastReviewed: actor.lastReviewed,
  url: `/threat-actors/${actor.slug}/`
});

const hubPage = (actors) => {
  const states = [...new Set(actors.map((actor) => actor.stateAffiliation.state))].sort();
  const cards = actors.map((actor) => {
    const terms = [actor.name, actor.summary, actor.actorType, actor.stateAffiliation.state, ...actor.targets.sectors.map((item) => item.name), ...actor.designations.map((item) => `${item.provider} ${item.name} ${item.externalId}`)].join(" ").toLowerCase();
    return `<article class="actor-directory-card" data-actor-card data-search="${esc(terms)}" data-state="${esc(actor.stateAffiliation.state.toLowerCase())}">
      ${familyCover(actor)}
      <div class="actor-directory-card-body">
        <div class="actor-directory-card-top"><span>${esc(actor.status)}</span><span>${esc(actor.distribution)}</span></div>
        <div><p class="eyebrow">${esc(actor.actorType)}</p><h2>${esc(actor.name)}</h2><p>${esc(actor.summary)}</p></div>
        <div class="actor-directory-designations">${actor.designations.slice(0, 3).map((item) => `<span>${esc(item.provider)} · ${esc(item.name)}${item.externalId ? ` · ${esc(item.externalId)}` : ""}</span>`).join("")}</div>
        <a class="action primary" href="/threat-actors/${esc(actor.slug)}/">Open intelligence dossier</a>
      </div>
    </article>`;
  }).join("\n");
  const reviewed = [...actors].sort((left, right) => right.lastReviewed.localeCompare(left.lastReviewed))[0]?.lastReviewed || "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Threat Actor Intelligence",
    description: "Source-resolved cyber threat actor dossiers for defensive analysts.",
    url: `${SITE}/threat-actors/`,
    dateModified: reviewed,
    hasPart: actors.map((actor) => ({ "@type": "TechArticle", name: actor.name, url: `${SITE}/threat-actors/${actor.slug}/` }))
  };
  return `<!DOCTYPE html>
<html lang="en">
  <head>${documentHead({ title: "Threat Actors | Paracausal Telemetry", description: "Source-resolved cyber threat actor dossiers with designations, campaigns, ATT&CK mappings, indicators and defensive priorities.", path: "/threat-actors/", jsonLd })}
  </head>
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#threat-actors">Skip to threat actors</a>
    <div class="page-shell">
      ${renderHeader({ label: "Threat Actors" })}
      <main id="threat-actors" class="threat-hub-main">
        <nav class="actor-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Threat actors</span></nav>
        <section class="threat-hub-hero">
          <div><p class="eyebrow">Cyber threat intelligence</p><h1>Resolve the actor before trusting the name.</h1><p>Vendor names describe overlapping activity, not identical groups. Each dossier keeps designations, confidence and evidence attached to every claim.</p></div>
          <dl><div><dt>Published profiles</dt><dd>${actors.length}</dd></div><div><dt>Latest review</dt><dd>${esc(reviewed)}</dd></div><div><dt>Distribution</dt><dd>TLP:CLEAR</dd></div></dl>
        </section>
        <section class="threat-directory" aria-labelledby="directory-title">
          <header><p class="eyebrow">Actor directory</p><h2 id="directory-title">Curated profiles</h2><p>Search the dossiers or filter by state alignment.</p></header>
          <div class="actor-filter" id="actor-filter" role="search">
            <div class="actor-filter-search"><input id="actor-query" name="q" type="search" autocomplete="off" placeholder="Search actors, designations, sectors…" aria-label="Search threat actors" /></div>
            <div class="actor-filter-chips" role="group" aria-label="Filter by state alignment">
              <button type="button" class="actor-chip is-active" data-filter-state="" aria-pressed="true">All states</button>
              ${states.map((state) => `<button type="button" class="actor-chip" data-filter-state="${esc(state.toLowerCase())}" aria-pressed="false">${esc(state)}</button>`).join("")}
            </div>
          </div>
          <p class="actor-results-status" id="actor-results-status" role="status" aria-live="polite">${actors.length} profile${actors.length === 1 ? "" : "s"}</p>
          <div class="actor-directory-grid" id="actor-directory-grid">${cards}</div>
          <div class="actor-empty" id="actor-empty" hidden><strong>No actors match these filters.</strong><p>Clear a filter or search for a designation, state or targeted sector.</p></div>
        </section>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/threat-actors/threat-actors-page.js?v=276fa973"></script>
  </body>
</html>\n`;
};

const designationCard = (actor, item, kind) => {
  const badge = kind === "primary"
    ? `<span class="actor-resolution-badge actor-resolution-badge-primary">Primary</span>`
    : `<span class="actor-resolution-badge actor-resolution-badge-${esc(item.relationship)}">${esc(item.relationship)}</span>`;
  return `<div class="actor-resolution-card-head">${badge}${confidence(item.confidence)}</div>
      <p class="actor-resolution-provider">${esc(item.provider)}</p>
      <h3>${esc(item.name)}</h3>${item.externalId ? `<code>${esc(item.externalId)}</code>` : ""}
      <p class="actor-resolution-desc">${esc(item.description)}</p>
      ${sourcesFor(actor, item.sourceIds)}`;
};

const sourceResolution = (actor) => {
  const [primary, ...related] = actor.designations;
  return `<section class="actor-resolution" id="identity" aria-labelledby="identity-title">
  <header><p class="eyebrow">Designations</p><h2 id="identity-title">Aliases and related groups</h2><p>The same activity is tracked under several vendor names. Each designation is listed separately below.</p></header>
  <div class="actor-resolution-map">
    <article class="actor-resolution-primary">${designationCard(actor, primary, "primary")}</article>
    <ol class="actor-resolution-related">
      ${related.map((item) => `<li class="actor-resolution-card actor-resolution-${esc(item.relationship)}">${designationCard(actor, item)}</li>`).join("")}
    </ol>
  </div>
  <p class="actor-resolution-note"><strong>Note:</strong> overlapping names are not proof that two vendors track exactly the same people, infrastructure or operations.</p>
</section>`;
};

const listWithSources = (actor, items, className) => `<ul class="${className}">${items.map((item) => `<li><strong>${esc(item.name || item.title)}</strong>${item.description ? `<p>${esc(item.description)}</p>` : ""}${sourcesFor(actor, item.sourceIds)}</li>`).join("")}</ul>`;

const ttpTable = (actor, domain, techniques) => `<section class="actor-ttp-domain" aria-labelledby="ttp-${domain}-title">
  <div class="actor-section-heading"><div><p class="eyebrow">${esc(domainLabel(domain))} ATT&amp;CK</p><h3 id="ttp-${domain}-title">${esc(domain === "ics" ? "ICS effects and access" : "Enterprise access and manipulation")}</h3></div><a class="action" href="/threat-actors/data/${esc(actor.slug)}-${esc(domain)}-navigator.json">Download Navigator layer</a></div>
  <ul class="actor-ttp-grid" aria-label="${esc(domainLabel(domain))} ATT&amp;CK techniques">
    ${techniques.map((technique) => `<li class="actor-ttp-card">
      <a class="actor-ttp-card-head" href="${attackUrl(technique.id)}" target="_blank" rel="noreferrer"><code>${esc(technique.id)}</code><strong>${esc(technique.name)}</strong></a>
      <div class="actor-ttp-card-meta"><span class="actor-ttp-tactic">${esc(technique.tactic)}</span><span class="actor-ttp-scope">${esc(technique.scope)}</span></div>
      <p>${esc(technique.behaviour)}</p>
      <div class="actor-ttp-card-foot">${confidence(technique.confidence)}${sourcesFor(actor, technique.sourceIds)}</div>
    </li>`).join("")}
  </ul>
</section>`;

const defang = (indicator) => {
  if (indicator.type === "domain") return indicator.value.replaceAll(".", "[.]");
  if (indicator.type === "ipv4") return indicator.value.replaceAll(".", "[.]");
  return indicator.value;
};

const indicatorsSection = (actor) => {
  const cards = actor.indicators.map((indicator) => `<li class="actor-indicator-card">
      <div class="actor-indicator-card-head"><span class="actor-indicator-type">${esc(indicator.type.toUpperCase())}</span><span class="actor-indicator-status">${esc(indicator.status)}</span></div>
      <code>${esc(defang(indicator))}</code>
      <p>${esc(indicator.description)}</p>
      <div class="actor-indicator-card-foot"><span class="actor-indicator-reported">Reported ${esc(indicator.reported)}</span>${sourcesFor(actor, indicator.sourceIds)}</div>
    </li>`).join("");
  const evidence = actor.indicators.length
    ? `<ul class="actor-indicator-grid" aria-label="Historical indicators">${cards}</ul>`
    : `<div class="actor-indicator-empty"><strong>No point-in-time indicators published.</strong><p>This profile intentionally prioritises sourced behaviour, access paths and operational context.</p></div>`;
  return `<section class="actor-indicators" id="indicators" aria-labelledby="indicators-title"><header><p class="eyebrow">Indicator handling</p><h2 id="indicators-title">Historical indicators</h2></header><div class="actor-indicator-warning"><strong>Historical, not current infrastructure.</strong><p>${esc(actor.indicatorNotice)}</p></div>${evidence}</section>`;
};

const actorPage = (actor) => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: `${actor.name} threat actor profile`,
        description: actor.summary,
        url: `${SITE}/threat-actors/${actor.slug}/`,
        dateModified: actor.lastReviewed,
        author: { "@type": "Organization", name: "Paracausal Telemetry", url: SITE },
        about: [actor.name, actor.actorType, actor.primaryFocus, ...actor.designations.map((item) => item.name)]
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Threat actors", item: `${SITE}/threat-actors/` },
          { "@type": "ListItem", position: 3, name: actor.name, item: `${SITE}/threat-actors/${actor.slug}/` }
        ]
      }
    ]
  };
  const sourceMap = sourceMapFor(actor);
  return `<!DOCTYPE html>
<html lang="en">
  <head>${documentHead({ title: `${actor.name} Threat Actor Profile | Paracausal Telemetry`, description: actor.summary, path: `/threat-actors/${actor.slug}/`, type: "article", jsonLd })}
  </head>
  <body>
    <script>${themeScript}</script>
    <a class="skip-to-content" href="#actor-profile">Skip to actor profile</a>
    <div class="page-shell">
      ${renderHeader({ label: "Threat Actors" })}
      <main id="actor-profile" class="actor-profile-main">
        <nav class="actor-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/threat-actors/">Threat actors</a><span>/</span><span aria-current="page">${esc(actor.name)}</span></nav>
        <article class="actor-dossier">
          <header class="actor-profile-hero">
            <div class="actor-profile-copy"><div class="actor-profile-kicker"><span>${esc(actor.status)}</span><span>${esc(actor.distribution)}</span>${confidence(actor.overallConfidence)}</div><p class="eyebrow">${esc(actor.actorType)}</p><h1>${esc(actor.name)}</h1><p>${esc(actor.summary)}</p><div class="actor-profile-actions"><a class="action primary" href="#identity">Resolve designations</a><a class="action" href="/threat-actors/data/${esc(actor.slug)}.json">Download actor JSON</a></div></div>
            <dl class="actor-fact-rail"><div><dt>Primary focus</dt><dd>${esc(actor.primaryFocus)}</dd></div><div><dt>State alignment</dt><dd>${esc(actor.stateAffiliation.state)}</dd></div><div><dt>Microsoft family</dt><dd>${esc(familyFor(actor).name)}</dd></div>${actor.observedSince.map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join("")}<div><dt>Last reviewed</dt><dd>${esc(actor.lastReviewed)}</dd></div></dl>
          </header>
          <nav class="actor-dossier-nav" aria-label="Dossier sections"><a href="#identity">Identity</a><a href="#assessment">Assessment</a><a href="#campaigns">Campaigns</a><a href="#ttps">TTPs</a><a href="#indicators">Indicators</a><a href="#sources">Sources</a></nav>
          ${sourceResolution(actor)}
          <section class="actor-assessment" id="assessment" aria-labelledby="assessment-title">
            <header><p class="eyebrow">Key assessment</p><h2 id="assessment-title">Key judgements</h2></header>
            <div class="actor-assessment-grid">${actor.assessment.map((item) => `<article><div>${confidence(item.confidence)}</div><p>${esc(item.text)}</p>${sourcesFor(actor, item.sourceIds)}</article>`).join("")}</div>
            <aside class="actor-affiliation"><div><p class="eyebrow">Affiliation judgement</p><h3>${esc(actor.stateAffiliation.state)}</h3></div><p>${esc(actor.stateAffiliation.assessment)}</p><div>${confidence(actor.stateAffiliation.confidence)}${sourcesFor(actor, actor.stateAffiliation.sourceIds)}</div></aside>
          </section>
          <section class="actor-targeting" aria-labelledby="targeting-title"><header><p class="eyebrow">Targeting</p><h2 id="targeting-title">Regions, sectors and technology</h2></header><div class="actor-target-grid"><article><h3>Regions</h3>${listWithSources(actor, actor.targets.regions, "actor-compact-list")}</article><article><h3>Sectors</h3>${listWithSources(actor, actor.targets.sectors, "actor-compact-list")}</article><article><h3>Technology</h3>${listWithSources(actor, actor.targets.technologies, "actor-compact-list")}</article></div></section>
          <section class="actor-campaigns" id="campaigns" aria-labelledby="campaigns-title"><header><p class="eyebrow">Campaign chronology</p><h2 id="campaigns-title">Timeline</h2></header><ol>${actor.campaigns.map((campaign) => `<li><div class="actor-campaign-period"><span>${esc(campaign.period)}</span>${confidence(campaign.confidence)}</div><article><p class="eyebrow">${esc(campaign.scope)}</p><h3>${esc(campaign.name)}</h3><p>${esc(campaign.summary)}</p><p class="actor-campaign-impact"><strong>Operational consequence:</strong> ${esc(campaign.impact)}</p>${sourcesFor(actor, campaign.sourceIds)}</article></li>`).join("")}</ol></section>
          <section class="actor-capabilities" aria-labelledby="capabilities-title"><header><p class="eyebrow">Capabilities and malware</p><h2 id="capabilities-title">Capabilities and tooling</h2></header><div class="actor-capability-grid">${actor.capabilities.map((item) => `<article><div>${confidence(item.confidence)}<span>${esc(item.scope)}</span></div><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>${sourcesFor(actor, item.sourceIds)}</article>`).join("")}</div><div class="actor-malware">${actor.malware.map((item) => `<article class="actor-malware-card"><div class="actor-malware-head"><p class="eyebrow">${esc(item.type || item.scope || "Malware")}</p>${confidence(item.confidence)}</div><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>${item.caveat ? `<p class="actor-malware-caveat"><strong>Scope caveat:</strong> ${esc(item.caveat)}</p>` : ""}${sourcesFor(actor, item.sourceIds)}</article>`).join("")}</div></section>
          <section class="actor-ttps" id="ttps" aria-labelledby="ttps-title"><header><p class="eyebrow">Tactics, techniques and procedures</p><h2 id="ttps-title">Mapped ATT&amp;CK techniques</h2><p>Each mapping names the provider or activity scope that supports it. Overlap is not treated as proof that every designation describes an identical operation.</p></header>${ttpTable(actor, "enterprise", actor.ttps.enterprise)}${ttpTable(actor, "ics", actor.ttps.ics)}</section>
          ${indicatorsSection(actor)}
          <section class="actor-sources" id="sources" aria-labelledby="sources-title"><header><p class="eyebrow">Source register</p><h2 id="sources-title">Sources</h2><p>Publication and update dates preserve the point-in-time context used for this review.</p></header><ol>${actor.sources.map((source) => `<li id="source-${esc(source.id)}"><div><span>${esc(source.publisher)}</span><span>${esc(source.type)}</span></div><h3><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)}</a></h3><p>Published ${esc(dateDisplay(source.published))}${source.updated ? ` · Updated ${esc(dateDisplay(source.updated))}` : ""}</p></li>`).join("")}</ol></section>
          <footer class="actor-dossier-footer"><div><span>Last reviewed</span><strong>${esc(dateDisplay(actor.lastReviewed))}</strong></div><div><span>Distribution</span><strong>${esc(actor.distribution)}</strong></div><a class="action" href="/threat-actors/">Back to actor directory</a></footer>
        </article>
      </main>
      ${renderFooter()}
    </div>
    <script type="module" src="/threat-actors/threat-actors-page.js?v=276fa973"></script>
  </body>
</html>\n`;
};

const navigatorLayer = (actor, domain, techniques) => ({
  name: `${actor.name}: ${domain === "ics" ? "ICS" : "Enterprise"} ATT&CK`,
  versions: { attack: "17", navigator: "5.1.0", layer: "4.5" },
  domain: domain === "ics" ? "ics-attack" : "enterprise-attack",
  description: `Review-dated ${domain} ATT&CK layer for ${actor.name}. Technique comments retain their source and activity scope; overlapping designations are not asserted to be exact aliases. Last reviewed ${actor.lastReviewed}.`,
  filters: { platforms: [] },
  sorting: 0,
  layout: { layout: "side", aggregateFunction: "average", showID: true, showName: true, showAggregateScores: false, countUnscored: false },
  hideDisabled: false,
  techniques: techniques.map((technique) => ({
    techniqueID: technique.id,
    color: technique.confidence === "high" ? "#09bac9" : "#dcbb50",
    comment: `${technique.behaviour} Scope: ${technique.scope}. Sources: ${technique.sourceIds.map((id) => sourceMapFor(actor).get(id)?.publisher).filter(Boolean).join(", ")}.`,
    enabled: true,
    metadata: [
      { name: "Scope", value: technique.scope },
      { name: "Confidence", value: technique.confidence },
      { name: "Last reviewed", value: actor.lastReviewed }
    ]
  })),
  gradient: { colors: ["#fafaf8", "#09bac9"], minValue: 0, maxValue: 100 },
  legendItems: [
    { label: "High-confidence public mapping", color: "#09bac9" },
    { label: "Medium-confidence public mapping", color: "#dcbb50" }
  ],
  metadata: [
    { name: "Primary cluster", value: actor.name },
    { name: "Designation model", value: "Source-scoped relationships; see technique comments" },
    { name: "Distribution", value: actor.distribution }
  ],
  links: actor.sources.map((source) => ({ label: source.publisher, url: source.url })),
  showTacticRowBackground: false,
  tacticRowBackground: "#dddddd",
  selectTechniquesAcrossTactics: true,
  selectSubtechniquesWithParent: false
});

const actors = readActors();
const actorIds = new Set();
const slugs = new Set();
for (const actor of actors) {
  validateActor(actor);
  if (actorIds.has(actor.id)) errors.push(`${actor.sourceFile}: duplicate actor id ${actor.id}`);
  if (slugs.has(actor.slug)) errors.push(`${actor.sourceFile}: duplicate actor slug ${actor.slug}`);
  actorIds.add(actor.id);
  slugs.add(actor.slug);
}
actors.sort((left, right) => left.name.localeCompare(right.name));
if (!actors.length) errors.push("Threat actors: at least one actor is required");

const publicActors = actors.map((actor) => ({
  ...actor,
  sourceFile: undefined,
  url: `/threat-actors/${actor.slug}/`,
  artifacts: {
    json: `/threat-actors/data/${actor.slug}.json`,
    enterpriseNavigator: `/threat-actors/data/${actor.slug}-enterprise-navigator.json`,
    icsNavigator: `/threat-actors/data/${actor.slug}-ics-navigator.json`
  }
}));
const latestReview = actors.map((actor) => actor.lastReviewed).sort().at(-1) || "";
const indexDocument = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: latestReview,
  actors: actors.map(actorSummary),
  entries: actors.map((actor) => ({
    label: actor.name,
    detail: actor.summary,
    href: `/threat-actors/${actor.slug}/`,
    type: "Threat Actor",
    terms: [actor.actorType, actor.stateAffiliation.state, ...actor.targets.sectors.map((item) => item.name), ...actor.designations.flatMap((item) => [item.provider, item.name, item.externalId]).filter(Boolean)]
  }))
};

writeOutput(resolve(OUTPUT_ROOT, "index.html"), hubPage(actors));
writeOutput(resolve(OUTPUT_ROOT, "index.json"), `${JSON.stringify(indexDocument, null, 2)}\n`);
for (const [index, actor] of actors.entries()) {
  writeOutput(resolve(OUTPUT_ROOT, actor.slug, "index.html"), actorPage(actor));
  writeOutput(resolve(OUTPUT_ROOT, "data", `${actor.slug}.json`), `${JSON.stringify(publicActors[index], null, 2)}\n`);
  writeOutput(resolve(OUTPUT_ROOT, "data", `${actor.slug}-enterprise-navigator.json`), `${JSON.stringify(navigatorLayer(actor, "enterprise", actor.ttps.enterprise), null, 2)}\n`);
  writeOutput(resolve(OUTPUT_ROOT, "data", `${actor.slug}-ics-navigator.json`), `${JSON.stringify(navigatorLayer(actor, "ics", actor.ttps.ics), null, 2)}\n`);
}

if (errors.length) {
  for (const error of errors) console.error(`  FAIL ${error}`);
  console.error(`\nThreat actor build failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`Threat actor build: ${actors.length} actor${actors.length === 1 ? "" : "s"}, ${outputs.size} generated files${CHECK ? " checked" : " written"}.`);
