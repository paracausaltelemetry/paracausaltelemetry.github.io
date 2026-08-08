// Ranking search over the Observer catalogue. Pure and dependency-free so the
// same logic backs the live combobox and the Node tests.
//
// Ranking priority (highest first): exact code (event id / ATT&CK id) ->
// title -> alias -> keyword/synonym -> tag (category/kind) -> description.
// Broad topic queries ("persistence") return grouped results instead of one
// dominant card.

import { normalize, tokenize, expandQuery, fuzzyTokenMatch } from "./normalize.js?v=276fa973";

const WEIGHT = {
  codeExact: 1000,
  codePrefix: 320,
  titleExact: 900,
  titlePhrase: 620,
  titleToken: 300,
  aliasExact: 680,
  aliasPhrase: 470,
  keywordExact: 400,
  keywordPhrase: 300,
  tagExact: 220,
  textPhrase: 150,
  textToken: 80,
  fuzzy: 55
};

// Kind ordering as a small tiebreaker so, at equal score, a technique outranks
// a raw event and a concept overview floats up.
const KIND_RANK = { port: 11, service: 10, attack: 8, concept: 8, protocol: 7, utility: 7, "log-source": 6, "cloud-event": 6, technique: 5, event: 4, sysmon: 4, command: 3, registry: 2, artifact: 1 };

// Pull every event-id / ATT&CK-id string an entry should be findable by.
function entryCodes(entry) {
  const codes = new Set();
  const push = (value) => {
    if (!value) return;
    for (const part of String(value).split(/[^A-Za-z0-9.]+/)) {
      const token = part.trim().toLowerCase();
      if (token) codes.add(token);
    }
  };
  push(entry.detection && entry.detection.eventId);
  for (const mapping of entry.attack || []) push(mapping.id);
  for (const value of entry.identifiers?.eventIds || []) push(value);
  for (const value of entry.identifiers?.attackIds || []) push(value);
  for (const value of entry.identifiers?.ports || []) push(value);
  // The bare id slug's trailing code, e.g. "evt-4672" -> "4672".
  const slugTail = String(entry.id).split("-").pop();
  if (/^\d+$/.test(slugTail)) codes.add(slugTail);
  return Array.from(codes);
}

// Precompute the searchable projection of each entry once.
export function buildIndex(entries) {
  return entries.map((entry) => {
    const aliasNorms = (entry.aliases || []).map(normalize);
    const keywordNorms = (entry.keywords || []).map(normalize);
    const titleNorm = normalize(entry.title);
    const textNorm = normalize(
      [entry.summary, entry.significance, (entry.categories || []).join(" "), JSON.stringify(entry.identifiers || {})].filter(Boolean).join(" ")
    );
    const tokenBag = new Set([
      ...tokenize(entry.title),
      ...keywordNorms.flatMap((k) => k.split(" ")),
      ...aliasNorms.flatMap((a) => a.split(" ")),
      ...(entry.categories || []).flatMap((c) => tokenize(c))
    ]);
    return {
      entry,
      codes: entryCodes(entry),
      titleNorm,
      aliasNorms,
      keywordNorms,
      textNorm,
      categories: (entry.categories || []).map(normalize),
      kind: normalize(entry.kind),
      tokenBag: Array.from(tokenBag)
    };
  });
}

function scoreEntry(record, q) {
  let score = 0;
  const reasons = [];

  const filenameIdentifiers = (record.entry.identifiers?.filenames || []).map(normalize);
  if (q.phrase && filenameIdentifiers.includes(q.phrase)) {
    score += 1500;
    reasons.push("filename");
  }

  // Contextual implementation names are exact investigative identifiers. They
  // outrank a loose alias, but an existing first-class tool record still wins
  // through its exact title. This keeps PsExec and Cobalt Strike canonical
  // while queries such as Mimikatz open the relevant Attack field guide.
  const implementationIdentifiers = (record.entry.identifiers?.implementations || []).map(normalize);
  if (q.phrase && implementationIdentifiers.includes(q.phrase)) {
    score += 850;
    reasons.push("implementation");
  }

  // A numeric port lookup should lead with the registered port and associated
  // service articles, ahead of unrelated event records sharing the same number.
  if (/^\d{1,5}$/.test(q.phrase) && (record.entry.identifiers?.ports || []).map(String).includes(q.phrase)) {
    score += 1500;
    reasons.push("port");
  }

  // ── Codes (event ids / ATT&CK ids) ─────────────────────────────────────
  for (const code of q.codes) {
    if (record.codes.includes(code)) {
      score += WEIGHT.codeExact;
      reasons.push("code");
    } else if (code.length >= 2 && record.codes.some((c) => c.startsWith(code))) {
      score += WEIGHT.codePrefix;
      reasons.push("code-prefix");
    }
  }

  const hasPhrase = q.phrase.length >= 2;

  // ── Title ──────────────────────────────────────────────────────────────
  if (hasPhrase && record.titleNorm === q.phrase) {
    score += WEIGHT.titleExact;
    reasons.push("title");
  } else if (hasPhrase && record.titleNorm.includes(q.phrase)) {
    score += WEIGHT.titlePhrase;
    reasons.push("title");
  }

  // ── Aliases ────────────────────────────────────────────────────────────
  for (const alias of record.aliasNorms) {
    if (hasPhrase && alias === q.phrase) {
      score += WEIGHT.aliasExact;
      reasons.push("alias");
      break;
    }
  }
  if (hasPhrase && !reasons.includes("alias")) {
    for (const alias of record.aliasNorms) {
      if (alias.length >= 3 && (alias.includes(q.phrase) || q.phrase.includes(alias))) {
        score += WEIGHT.aliasPhrase;
        reasons.push("alias");
        break;
      }
    }
  }

  // ── Keywords / synonyms ────────────────────────────────────────────────
  for (const keyword of record.keywordNorms) {
    if (hasPhrase && keyword === q.phrase) {
      score += WEIGHT.keywordExact;
      reasons.push("keyword");
      break;
    }
  }
  if (hasPhrase && !reasons.includes("keyword")) {
    for (const keyword of record.keywordNorms) {
      if (keyword.includes(q.phrase)) {
        score += WEIGHT.keywordPhrase;
        reasons.push("keyword");
        break;
      }
    }
  }

  // ── Per-token coverage across title/alias/keyword/text ─────────────────
  let tokenHits = 0;
  let fuzzyHits = 0;
  let matchedTokens = 0;
  for (const token of q.tokens) {
    if (token.length < 3) continue;
    if (record.tokenBag.includes(token)) {
      tokenHits += 1;
      matchedTokens += 1;
      score += WEIGHT.titleToken * 0.35;
    } else if (record.categories.includes(token) || record.kind === token) {
      matchedTokens += 1;
      score += WEIGHT.tagExact;
      reasons.push("tag");
    } else if (record.textNorm.includes(token)) {
      matchedTokens += 1;
      score += WEIGHT.textToken;
      reasons.push("text");
    } else if (record.tokenBag.some((target) => fuzzyTokenMatch(token, target))) {
      fuzzyHits += 1;
      matchedTokens += 1;
      score += WEIGHT.fuzzy;
    }
  }
  if (tokenHits) reasons.push("token");
  if (fuzzyHits && !tokenHits) reasons.push("fuzzy");

  // ── Description phrase fallback ────────────────────────────────────────
  if (hasPhrase && score === 0 && record.textNorm.includes(q.phrase)) {
    score += WEIGHT.textPhrase;
    reasons.push("text");
  }

  // Require all multi-token queries to cover reasonably: if nothing matched at
  // all, drop the entry.
  const meaningfulTokens = q.tokens.filter((token) => token.length >= 3);
  const hasStrongMatch = reasons.some((reason) => ["code", "code-prefix", "title", "alias", "keyword"].includes(reason));
  if (score === 0 || (meaningfulTokens.length >= 3 && matchedTokens < 2 && !hasStrongMatch)) return null;

  // Small kind tiebreak.
  score += (KIND_RANK[record.kind] || 0);

  return { entry: record.entry, score, reasons: Array.from(new Set(reasons)) };
}

// Run a full search. Returns:
//   { results, grouped, broad, query }
// results , ranked matches (all of them; caller slices for display)
// grouped , when broad, a [{ category, entries }] list; otherwise null
// broad   , true when the query is a broad topic word or matched widely
export function search(index, rawQuery, { limit = 50 } = {}) {
  const q = expandQuery(rawQuery);
  if (!q.phrase && !q.codes.length) {
    return { results: [], grouped: null, broad: false, query: q };
  }

  const scored = [];
  for (const record of index) {
    const hit = scoreEntry(record, q);
    if (hit) scored.push(hit);
  }

  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  const results = scored.slice(0, limit);

  // Grouping is reserved for explicit broad topic words ("persistence",
  // "authentication", ...). Specific queries, even ones that match many
  // entries loosely, stay a ranked list so the best card leads.
  let broad = false;
  let grouped = null;
  const category = q.broadCategory;
  if (category) {
    const inCat = scored.filter((hit) => (hit.entry.categories || []).includes(category));
    if (inCat.length > 3) {
      broad = true;
      grouped = groupByCategory(inCat);
    }
  }

  return { results, grouped, broad, query: q };
}

function groupByCategory(scored) {
  const buckets = new Map();
  for (const hit of scored) {
    const primary = (hit.entry.categories && hit.entry.categories[0]) || hit.entry.kind || "other";
    if (!buckets.has(primary)) buckets.set(primary, []);
    buckets.get(primary).push(hit.entry);
  }
  return Array.from(buckets, ([category, entries]) => ({ category, entries }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

// Compact predictive suggestions for the combobox, capped, de-duplicated,
// each carrying the label that actually matched (title or alias) for display.
export function suggest(index, rawQuery, { limit = 8 } = {}) {
  const { results, query } = search(index, rawQuery, { limit: limit * 3 });
  const out = [];
  for (const hit of results) {
    const entry = hit.entry;
    let label = entry.title;
    // If an alias matched more directly than the title, surface it.
    if (hit.reasons.includes("alias") && !hit.reasons.includes("title")) {
      const alias = (entry.aliases || []).find((a) => normalize(a).includes(query.phrase));
      if (alias) label = `${alias}, ${entry.title}`;
    }
    out.push({ id: entry.id, label, kind: entry.kind, title: entry.title, score: hit.score });
    if (out.length >= limit) break;
  }
  return out;
}

export function findById(entries, id) {
  return entries.find((entry) => entry.id === id) || null;
}
