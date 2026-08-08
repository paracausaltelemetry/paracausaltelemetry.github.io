import { createFacets } from "./facets.js?v=276fa973-1";
import { search, suggest } from "./search.js?v=276fa973-1";
import { highlightElement } from "../highlight.js?v=276fa973";

const KIND_LABEL = {
  event: "Event", sysmon: "Sysmon", registry: "Registry", artifact: "Artefact", technique: "ATT&CK",
  concept: "Concept", protocol: "Protocol", utility: "Utility", command: "Command", "log-source": "Log source", "cloud-event": "Cloud",
  service: "Service", port: "Port", attack: "Attack", "tool-guide": "Field guide"
};
const DOMAIN_LABEL = {
  endpoint: "Endpoint", identity: "Identity", network: "Network", detection: "Detection", "incident-response": "IR / DFIR",
  cloud: "Cloud / SaaS", "cloud-native": "Cloud native", "threat-intelligence": "Threat intelligence",
  "vulnerability-management": "Vulnerability", operations: "Operations", systems: "Systems / hardware",
  governance: "Governance / risk", "application-security": "Application security"
};
const SECTION_LABEL = { fundamentals: "Fundamentals", services: "Services", ports: "Ports", attacks: "Attacks", artefacts: "Artefacts", "tool-hunting": "Tool Hunting", operational: "Operational reference" };
const PLATFORM_LABEL = {
  windows: "Windows", linux: "Linux", macos: "macOS", identity: "Identity", network: "Network",
  web: "Web", cloud: "Cloud", containers: "Containers", ot: "OT / ICS", physical: "Physical"
};

const groupLabel = (category = "") => String(category).replaceAll("-", " ").replace(/^\w/, (char) => char.toUpperCase());

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function initObserver({ input, listbox, status, results, facetBar, store }) {
  /* The selected entry expands inline, directly beneath its own result row. */
  const detail = el("div", "observer-detail-pane");
  detail.id = "observer-detail";
  detail.setAttribute("aria-live", "polite");
  detail.setAttribute("aria-label", "Selected reference");
  const facets = createFacets({
    groups: [
      {
        key: "section",
        label: "Section",
        allLabel: "All sections",
        options: Object.entries(SECTION_LABEL).map(([value, label]) => ({ value, label })),
        match: (entry, value) => entry.section === value
      },
      {
        key: "platform",
        label: "Platform",
        allLabel: "All platforms",
        options: Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label })),
        match: (entry, value) => Boolean(entry.platforms?.includes(value))
      }
    ],
    onChange: () => onFacetChange()
  });
  let suggestions = [];
  let activeIndex = -1;
  let renderToken = 0;
  let legacyDomain = "";
  let legacyKind = "";
  let selectedId = "";
  let currentQuery = "";
  const matchesFilters = (entry) => facets.matches(entry)
    && (!legacyDomain || entry.domains?.includes(legacyDomain))
    && (!legacyKind || entry.kind === legacyKind);

  const setUrl = (params = {}) => {
    const url = new URL(window.location.href);
    for (const key of ["q", "id", "section", "platform", "domain", "kind"]) url.searchParams.delete(key);
    for (const [key, value] of Object.entries(facets.values())) if (value) url.searchParams.set(key, value);
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
    window.history.pushState({}, "", url);
  };

  const drawFacets = (candidates) => facets.render(facetBar, candidates);

  const closeList = () => {
    listbox.replaceChildren();
    listbox.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
    suggestions = [];
  };

  const renderSuggestions = (value) => {
    suggestions = value.trim() ? suggest(store.index, value, { limit: 20 }).filter((item) => matchesFilters(store.findMeta(item.id))).slice(0, 8) : [];
    if (!suggestions.length) { closeList(); return; }
    const options = suggestions.map((item, index) => {
      const option = el("li", "observer-option");
      option.id = `observer-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.append(el("span", "observer-option-kind", KIND_LABEL[item.kind] || item.kind), el("span", "observer-option-label", item.label));
      option.addEventListener("mousedown", (event) => { event.preventDefault(); void openEntry(item.id); });
      return option;
    });
    listbox.replaceChildren(...options);
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const setActive = (next) => {
    const options = Array.from(listbox.children);
    if (!options.length) return;
    activeIndex = (next + options.length) % options.length;
    options.forEach((option, index) => {
      const active = index === activeIndex;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-selected", active ? "true" : "false");
    });
    input.setAttribute("aria-activedescendant", options[activeIndex].id);
  };

  const loading = (message = "Loading reference...") => {
    const block = el("div", "observer-loading");
    block.append(el("span", "observer-loading-bar"), el("p", null, message));
    detail.replaceChildren(block);
  };

  const renderMatchRow = (entry) => {
    const item = el("li");
    const row = el("a", "observer-result");
    row.href = `/observer/?id=${encodeURIComponent(entry.id)}`;
    row.dataset.entryId = entry.id;
    row.append(el("span", `observer-badge observer-badge-${entry.kind}`, KIND_LABEL[entry.kind] || entry.kind));
    const body = el("span", "observer-result-body");
    body.append(el("strong", null, entry.title));
    const meta = el("span", "observer-result-meta");
    if (entry.section) meta.append(el("span", "observer-result-section", SECTION_LABEL[entry.section] || entry.section));
    for (const platform of (entry.platforms || []).slice(0, 3)) meta.append(el("span", null, PLATFORM_LABEL[platform] || platform));
    if (meta.children.length) body.append(meta);
    body.append(el("span", "observer-match-sum", entry.summary));
    row.append(body);
    row.setAttribute("aria-expanded", "false");
    row.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      if (entry.id === selectedId) collapse();
      else void openEntry(entry.id);
    });
    const prefetch = () => { void store.getEntry(entry.id).catch(() => {}); };
    row.addEventListener("pointerenter", prefetch, { once: true });
    row.addEventListener("focus", prefetch, { once: true });
    item.append(row);
    return item;
  };

  const renderMatchList = (title, entries) => {
    const section = el("section", "observer-matches");
    if (title) section.append(el("h3", "observer-card-kicker", title));
    const list = el("ul", "observer-match-list");
    for (const entry of entries) list.append(renderMatchRow(entry));
    section.append(list);
    return section;
  };

  /* Rows rendered inside the expanded card (related references) are not part of
     the result list: they must never host the detail pane, or it would be
     appended into its own descendant. */
  const listRows = () => Array.from(results.querySelectorAll(".observer-result")).filter((row) => !detail.contains(row));

  const markSelected = () => {
    let host = null;
    for (const row of listRows()) {
      const active = row.dataset.entryId === selectedId;
      row.classList.toggle("is-active", active);
      row.setAttribute("aria-expanded", active ? "true" : "false");
      if (active) { row.setAttribute("aria-current", "true"); host = row.parentElement; }
      else row.removeAttribute("aria-current");
    }
    if (!selectedId) detail.remove();
    else if (host) host.append(detail);
    else results.prepend(detail);
  };

  const collapse = () => {
    selectedId = "";
    detail.replaceChildren();
    markSelected();
    setUrl(currentQuery ? { q: currentQuery } : {});
  };

  const moveFocus = (from, delta) => {
    const all = listRows();
    if (!all.length) return;
    const index = from === "end" ? all.length - 1 : from === "start" ? 0 : Math.min(Math.max(all.indexOf(document.activeElement) + delta, 0), all.length - 1);
    all[index].focus();
  };


  const section = (title, body) => {
    const block = el("section", "observer-card-section");
    block.append(el("h3", "observer-card-kicker", title), body);
    return block;
  };

  const renderExample = (example) => {
    const figure = el("figure", "observer-example");
    const head = el("div", "observer-example-head");
    const caption = el("figcaption", "observer-example-cap");
    caption.append(el("span", "observer-example-type", (example.type || "code").toUpperCase()), el("span", null, example.label || ""));
    const copy = el("button", "observer-copy", "Copy");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(example.code); copy.textContent = "Copied"; }
      catch { copy.textContent = "Copy failed"; }
      window.setTimeout(() => { copy.textContent = "Copy"; }, 1400);
    });
    head.append(caption, copy);
    const pre = el("pre", "observer-code");
    const code = el("code", `language-${example.type || "text"}`, example.code);
    highlightElement(code);
    pre.append(code);
    figure.append(head, pre);
    return figure;
  };

  const renderLocationGuide = (guide) => {
    const wrap = el("div", "observer-location-guide");
    wrap.append(el("p", "observer-location-summary", guide.summary));
    const list = el("ul", "observer-location-list");
    for (const item of guide.items || []) {
      const row = el("li", `observer-location observer-location-${item.kind}`);
      const meta = el("div", "observer-location-meta");
      meta.append(el("span", null, item.platform), el("span", null, item.kind));
      row.append(meta, el("strong", null, item.label));
      if (["path", "registry", "socket", "store"].includes(item.kind)) row.append(el("code", null, item.value));
      else row.append(el("p", "observer-location-value", item.value));
      row.append(el("p", null, item.note));
      if (item.source) {
        const source = el("a", "observer-location-source", "Primary documentation");
        source.href = item.source;
        source.target = "_blank";
        source.rel = "noopener";
        row.append(source);
      }
      list.append(row);
    }
    wrap.append(list);
    return wrap;
  };

  const renderCard = (entry) => {
    const card = el("article", "observer-card");
    const head = el("header", "observer-card-head");
    const badges = el("div", "observer-card-badges");
    badges.append(el("span", `observer-badge observer-badge-${entry.kind}`, KIND_LABEL[entry.kind] || entry.kind));
    if (entry.section) badges.append(el("span", "observer-badge observer-badge-cat", SECTION_LABEL[entry.section] || entry.section));
    for (const domain of entry.domains || []) badges.append(el("span", "observer-badge observer-badge-cat", DOMAIN_LABEL[domain] || domain));
    head.append(badges, el("h2", "observer-card-title", entry.title));
    card.append(head, section("Meaning", el("p", null, entry.summary)));
    if (entry.locationGuide?.items?.length) card.append(section("Where to find it", renderLocationGuide(entry.locationGuide)));
    if (entry.significance) card.append(section("Operational significance", el("p", null, entry.significance)));
    const detection = entry.detection || {};
    const detail = el("dl", "observer-detail");
    for (const [label, value] of [["Channel", detection.channel], ["Provider", detection.provider], ["Event ID", detection.eventId], ["Telemetry / audit", detection.telemetry]]) {
      if (value) detail.append(el("dt", null, label), el("dd", null, value));
    }
    if (detail.children.length) card.append(section("Detection context", detail));
    if (entry.fields?.length) {
      const list = el("ul", "observer-fields");
      for (const field of entry.fields) { const item = el("li"); item.append(el("strong", "observer-field-name", field.name), el("span", null, ` ${field.note}`)); list.append(item); }
      card.append(section("Fields to inspect", list));
    }
    if (entry.triage?.length) { const list = el("ol", "observer-triage"); for (const step of entry.triage) list.append(el("li", null, step)); card.append(section("Triage and correlation", list)); }
    if (entry.examples?.length) { const wrap = el("div", "observer-examples"); for (const example of entry.examples) wrap.append(renderExample(example)); card.append(section("Queries and commands", wrap)); }
    if (entry.caveats) card.append(section("Legitimate causes and false positives", el("p", null, entry.caveats)));
    if (entry.articleUrl || entry.topicUrl) {
      const link = el("a", "action primary", "Read the full article");
      link.href = entry.articleUrl || entry.topicUrl;
      card.append(section("Learn", link));
    }
    for (const [relationship, related] of Object.entries(entry.relationships || {})) {
      if (!related?.length) continue;
      const links = el("div", "observer-links");
      for (const item of related) {
        const link = el("a", "observer-attack-link", item.title);
        link.href = item.url || `/observer/?id=${encodeURIComponent(item.id)}`;
        links.append(link);
      }
      card.append(section(`Related ${relationship.replaceAll("-", " ")}`, links));
    }
    if (entry.attack?.length) {
      const links = el("div", "observer-links");
      for (const mapping of entry.attack) { const link = el("a", "observer-attack-link", `${mapping.id} · ${mapping.name}`); link.href = mapping.url; link.target = "_blank"; link.rel = "noopener"; links.append(link); }
      card.append(section("MITRE ATT&CK", links));
    }
    const footer = el("footer", "observer-card-foot");
    if (entry.sources?.length) {
      const sources = el("div", "observer-sources");
      sources.append(el("span", "observer-sources-label", "Sources"));
      for (const source of entry.sources) { const link = el("a", "observer-source-link", source.label); link.href = source.url; link.target = "_blank"; link.rel = "noopener"; sources.append(link); }
      footer.append(sources);
    }
    if (entry.lastReviewed) footer.append(el("p", "observer-reviewed", `Last reviewed ${entry.lastReviewed}`));
    card.append(footer);
    return card;
  };

  async function openEntry(id, { updateUrl = true, announce = true, syncInput = true } = {}) {
    const token = ++renderToken;
    closeList();
    selectedId = id;
    markSelected();
    loading();
    try {
      const entry = await store.getEntry(id);
      if (token !== renderToken) return;
      if (!entry) { void runSearch(id); return; }
      if (syncInput) input.value = entry.title;
      if (updateUrl) setUrl(currentQuery ? { q: currentQuery, id } : { id });
      const fragment = document.createDocumentFragment();
      fragment.append(renderCard(entry));
      const related = (entry.related || []).map(store.findMeta).filter(Boolean);
      if (related.length) fragment.append(renderMatchList("Related references", related));
      detail.replaceChildren(fragment);
      if (announce) {
        status.textContent = `Showing ${entry.title}.`;
        detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } catch (error) {
      if (token !== renderToken) return;
      const alert = el("div", "observer-error", error instanceof Error ? error.message : "The reference could not be loaded.");
      alert.setAttribute("role", "alert");
      detail.replaceChildren(alert);
    }
  }

  const renderResultList = (matches, outcome) => {
    if (outcome?.broad && outcome.grouped?.length > 1) {
      const wrap = el("div", "observer-groups");
      const keep = new Map(matches.map((entry) => [entry.id, entry]));
      const shown = new Set();
      for (const group of outcome.grouped) {
        const entries = group.entries.filter((entry) => keep.has(entry.id));
        if (!entries.length) continue;
        for (const entry of entries) shown.add(entry.id);
        const section = el("section", "observer-group");
        section.append(el("h3", "observer-group-title", groupLabel(group.category)));
        const list = el("ul", "observer-match-list");
        for (const entry of entries) list.append(renderMatchRow(entry));
        section.append(list);
        wrap.append(section);
      }
      const rest = matches.filter((entry) => !shown.has(entry.id));
      if (wrap.children.length && rest.length) wrap.append(renderMatchList("Other matches", rest));
      if (wrap.children.length) { results.replaceChildren(wrap); markSelected(); return; }
    }
    results.replaceChildren(renderMatchList(null, matches));
    markSelected();
  };

  async function runSearch(value, { updateUrl = true, preferId = "" } = {}) {
    closeList();
    const query = value.trim();
    currentQuery = query;
    if (!query) { renderDefault(); if (updateUrl) setUrl({}); return; }
    const outcome = search(store.index, query, { limit: 100 });
    const candidates = outcome.results.map((hit) => hit.entry);
    drawFacets(candidates);
    const matches = candidates.filter(matchesFilters);
    if (updateUrl) setUrl({ q: query });
    if (!matches.length) {
      const empty = el("div", "observer-empty-state");
      empty.append(el("strong", "observer-empty-head", `No matches for ${query}.`), el("p", null, "Try a command, protocol, event ID, ATT&CK technique or plain-language analyst phrase, or clear a filter."));
      selectedId = "";
      detail.replaceChildren();
      results.replaceChildren(empty);
      status.textContent = `No matches for ${query}.`;
      return;
    }
    renderResultList(matches, outcome);
    status.textContent = `${matches.length} results for ${query}.`;
    const target = matches.find((entry) => entry.id === preferId) || matches[0];
    await openEntry(target.id, { updateUrl: false, announce: false, syncInput: false });
  }

  function renderDefault() {
    currentQuery = "";
    if (facets.active() || legacyDomain || legacyKind) {
      drawFacets(store.catalogue);
      const matches = store.catalogue.filter(matchesFilters);
      if (matches.length) renderResultList(matches.slice(0, 200), null);
      else results.replaceChildren(el("div", "observer-empty-state", "No references match those filters."));
      status.textContent = `${matches.length} references match the selected filters.`;
      if (!matches.length) { selectedId = ""; detail.replaceChildren(); }
      return;
    }
    /* Resting state: the search field stands alone. Filters and results only
       exist once there is something to filter. */
    selectedId = "";
    detail.replaceChildren();
    facetBar.replaceChildren();
    results.replaceChildren();
    status.textContent = `${store.catalogue.length} references across the Observer catalogue.`;
  }

  const applyUrl = () => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["section", "platform"]) facets.set(key, params.get(key) || "");
    legacyDomain = params.get("domain") || "";
    legacyKind = params.get("kind") || "";
    const id = params.get("id");
    const query = params.get("q");
    selectedId = id || "";
    if (query) { input.value = query; void runSearch(query, { updateUrl: false, preferId: id || "" }); }
    else if (id && store.findMeta(id)) { renderDefault(); void openEntry(id, { updateUrl: false }); }
    else renderDefault();
  };

  const onFacetChange = () => {
    legacyDomain = "";
    legacyKind = "";
    if (input.value.trim()) void runSearch(input.value);
    else { setUrl({}); renderDefault(); }
  };

  input.addEventListener("input", () => renderSuggestions(input.value));
  input.addEventListener("keydown", (event) => {
    const open = !listbox.hidden && suggestions.length;
    if (event.key === "ArrowDown" && open) { event.preventDefault(); setActive(activeIndex + 1); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveFocus("start", 0); }
    else if (event.key === "ArrowUp" && open) { event.preventDefault(); setActive(activeIndex - 1); }
    else if (event.key === "Enter") { event.preventDefault(); if (open && activeIndex >= 0) void openEntry(suggestions[activeIndex].id); else void runSearch(input.value); }
    else if (event.key === "Escape" && open) { event.preventDefault(); closeList(); }
  });
  results.addEventListener("keydown", (event) => {
    if (!event.target.classList?.contains("observer-result")) return;
    if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(null, 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(null, -1); }
    else if (event.key === "Home") { event.preventDefault(); moveFocus("start", 0); }
    else if (event.key === "End") { event.preventDefault(); moveFocus("end", 0); }
  });
  document.addEventListener("click", (event) => { if (!listbox.contains(event.target) && event.target !== input) closeList(); });
  window.addEventListener("popstate", applyUrl);
  applyUrl();
}
