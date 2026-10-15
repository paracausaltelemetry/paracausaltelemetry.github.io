import { initCommandPalette } from "../js/command-palette.js?v=276fa973-palette";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";

/* ---------- reading the search box ----------
   Words are matched against the start of a tool's words, so "ip" finds IP
   addresses but not "equipment". Each word also matches its synonyms, and
   from five letters on, one typo. Best matches sort to the top. */

/* Words people search with, grouped with the words the cards use. */
const SYNONYMS = [
  ["plane", "planes", "aircraft", "aeroplane", "flight", "flights", "adsb", "ads-b", "aviation", "jet"],
  ["ship", "ships", "boat", "vessel", "vessels", "ais", "maritime", "mmsi", "imo", "shipping"],
  ["car", "cars", "vehicle", "vehicles", "numberplate", "plate", "plates", "registration", "dvla", "mot"],
  ["photo", "photos", "picture", "pictures", "image", "images", "selfie", "jpeg", "jpg"],
  ["video", "videos", "youtube", "footage", "clip"],
  ["metadata", "exif", "gps"],
  ["map", "maps", "satellite", "imagery", "geolocate", "geolocation", "location", "where"],
  ["malware", "virus", "sample", "samples", "payload", "trojan", "ransomware", "hash", "sandbox"],
  ["whois", "rdap", "registrar", "registrant", "domain", "domains"],
  ["dns", "subdomain", "subdomains", "nameserver", "passive"],
  ["ip", "ips", "address", "host", "server", "asn", "bgp", "network"],
  ["cert", "certs", "certificate", "certificates", "tls", "ssl", "ct"],
  ["company", "companies", "business", "firm", "corporate", "director", "directors", "officers", "ownership"],
  ["crypto", "bitcoin", "btc", "ethereum", "eth", "wallet", "wallets", "blockchain", "chain", "on-chain"],
  ["sanction", "sanctions", "sanctioned", "ofac", "pep"],
  ["person", "people", "username", "usernames", "account", "accounts", "profile", "profiles", "social"],
  ["email", "emails", "mail", "e-mail"],
  ["breach", "breaches", "leak", "leaks", "leaked", "pwned", "password", "passwords"],
  ["archive", "archives", "archived", "cache", "cached", "wayback", "snapshot", "deleted", "history"],
  ["war", "conflict", "frontline", "front", "military", "strike", "strikes", "ukraine", "attack"],
  ["fire", "fires", "firms", "thermal", "explosion"],
  ["telegram", "channel", "channels"],
  ["code", "github", "repo", "repos", "source", "secret", "secrets", "key", "keys"],
  ["fake", "verify", "verification", "manipulated", "edited", "deepfake", "forensics", "ela"],
  ["sun", "shadow", "shadows", "time"],
  ["mountain", "mountains", "skyline", "ridge", "peak", "peaks"],
  ["guide", "guides", "how", "method", "methods", "index", "toolkit"]
];
const SYN = new Map();
for (const group of SYNONYMS) for (const word of group) SYN.set(word, [...new Set([...(SYN.get(word) || []), ...group])]);

/* Expansions for a typed word: itself, plus every synonym group it starts. */
const expand = (q) => {
  const out = new Set();
  if (q.length >= 3) for (const [word, group] of SYN) if (word.startsWith(q)) group.forEach((w) => out.add(w));
  out.delete(q);
  return [...out];
};

/* One edit apart (substitution, insertion, deletion or swap), for typos. */
const nearlyEqual = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.slice(i + 1) === b.slice(i + 1)) return true;
  if (a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1)) return true;
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
};

const split = (text) => text.split(/[^a-z0-9.+#-]+/).filter(Boolean);

/* ---------- recognising a pasted indicator ----------
   Defanged forms (hxxp, [.]) are accepted. Lookups are plain links: nothing
   leaves this page until someone clicks one. */
const LABELS = {
  ip: "an IP address", domain: "a domain", url: "a URL", hash: "a file hash", email: "an email address",
  username: "a username", btc: "a Bitcoin address", eth: "an Ethereum address", coords: "coordinates",
  asn: "an AS number", icao: "an aircraft ICAO code", mmsi: "a ship MMSI"
};
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 = /^(?=.*:.*:)[0-9a-f:]{2,39}$/i;
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function detect(input, toolHosts) {
  const value = input.trim().replace(/\[\.\]|\(\.\)|\{\.\}/g, ".").replace(/^hxxp/i, "http").replace(/^\[|\]$/g, "");
  if (!value) return [];
  const coords = value.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (coords) {
    const lat = Number(coords[1]), lon = Number(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && /\./.test(value)) return [{ type: "coords", value: `${lat}, ${lon}`, lat, lon }];
  }
  if (/\s/.test(value)) return [];
  if (/^https?:\/\/\S+$/i.test(value)) {
    try {
      const host = new URL(value).hostname;
      return [{ type: "url", value }, ...(IPV4.test(host) ? [{ type: "ip", value: host }] : DOMAIN.test(host) ? [{ type: "domain", value: host }] : [])];
    } catch { return []; }
  }
  if (IPV4.test(value) || IPV6.test(value)) return [{ type: "ip", value }];
  const email = value.match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (email) return [{ type: "email", value }, { type: "domain", value: email[1].toLowerCase() }];
  if (/^[a-f0-9]{64}$/i.test(value)) return [{ type: "sha256", value: value.toLowerCase(), sub: "SHA-256" }, { type: "hash", value: value.toLowerCase(), sub: "SHA-256" }];
  if (/^[a-f0-9]{40}$/i.test(value)) return [{ type: "hash", value: value.toLowerCase(), sub: "SHA-1" }];
  if (/^[a-f0-9]{32}$/i.test(value)) return [{ type: "hash", value: value.toLowerCase(), sub: "MD5" }];
  if (/^0x[a-f0-9]{40}$/i.test(value)) return [{ type: "eth", value }];
  if (/^(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value)) return [{ type: "btc", value }];
  const asn = value.match(/^as(\d{1,10})$/i);
  if (asn) return [{ type: "asn", value: asn[1], label: `AS${asn[1]}` }];
  if (/^\d{9}$/.test(value)) return [{ type: "mmsi", value }];
  if (/^[a-f0-9]{6}$/i.test(value) && /\d/.test(value) && /[a-f]/i.test(value)) return [{ type: "icao", value: value.toLowerCase() }];
  const user = value.match(/^@([a-z0-9_.-]{2,40})$/i);
  if (user) return [{ type: "username", value: user[1], label: `@${user[1]}` }];
  /* a tool's own address ("crt.sh", "grep.app") is a search for that tool */
  if (DOMAIN.test(value) && !toolHosts.has(value.toLowerCase().replace(/^www\./, ""))) return [{ type: "domain", value: value.toLowerCase() }];
  return [];
}

/* the first port of call for each kind of lookup; the rest follow in page order */
const FIRST = {
  ip: ["VirusTotal", "AbuseIPDB", "Shodan", "GreyNoise", "IPinfo"],
  domain: ["VirusTotal", "urlscan.io", "crt.sh", "SecurityTrails", "ICANN Lookup"],
  url: ["URLhaus", "Wayback Machine"],
  hash: ["VirusTotal", "MalwareBazaar", "Hybrid Analysis"],
  sha256: ["MalwareBazaar"],
  coords: ["Google Earth", "OpenStreetMap", "Copernicus Browser"],
  btc: ["mempool.space"],
  eth: ["Etherscan"]
};
const rank = (type, title) => {
  const at = (FIRST[type] || []).indexOf(title);
  return at === -1 ? 99 : at;
};

const fill = (template, kind) => template
  .replaceAll("{q}", encodeURIComponent(kind.value))
  .replaceAll("{raw}", kind.value)
  .replaceAll("{lat}", String(kind.lat))
  .replaceAll("{lon}", String(kind.lon));

/* Search, category chips and "Free only" narrow the grid in place. The
   category lives in the URL hash (/osint/#tracking) so a filtered view can
   be shared, and /osint/?q=… opens with a search filled in. Without this
   script the chips are plain jump links. */
function initToolkit() {
  const search = document.querySelector("[data-osint-filter]");
  const input = document.getElementById("osint-filter-input");
  if (!search || !input) return;
  const chips = [...document.querySelectorAll("[data-osint-chip]")];
  const free = document.querySelector("[data-osint-free]");
  const status = document.querySelector("[data-osint-status]");
  const empty = document.querySelector("[data-osint-empty]");
  const bar = document.querySelector("[data-osint-bar]");
  const panel = document.querySelector("[data-osint-lookup]");
  const sections = [...document.querySelectorAll("[data-osint-section]")];
  const cards = [...document.querySelectorAll("[data-osint-tool]")];
  const ids = new Set(sections.map((section) => section.id));
  const main = sections[0]?.parentElement;
  const sectionOrder = [...sections];
  const cardOrder = new Map(sections.map((section) => [section, [...section.querySelectorAll("[data-osint-tool]")]]));
  const info = new Map(cards.map((card) => [card, {
    name: card.dataset.name || "",
    nameWords: split(card.dataset.name || ""),
    tags: split(card.dataset.tags || ""),
    words: split(card.dataset.terms),
    title: card.querySelector("h3 a")?.firstChild?.textContent || "",
    lookup: card.dataset.lookup ? JSON.parse(card.dataset.lookup) : null
  }]));
  const toolHosts = new Set(cards.map((card) => card.querySelector(".osint-host")?.textContent.trim().toLowerCase()).filter(Boolean));
  const state = { q: "", cat: "all", free: false };

  const fromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    state.cat = ids.has(id) ? id : "all";
  };

  /* how well one typed word fits a card: 0 means not at all */
  const wordScore = (card, q) => {
    const { name, nameWords, tags, words } = info.get(card);
    if (name.startsWith(q)) return 10;
    if (nameWords.some((w) => w.startsWith(q))) return 8;
    if (tags.some((w) => w.startsWith(q))) return 5;
    if (words.some((w) => w.startsWith(q))) return 3;
    const alts = expand(q);
    if (alts.some((a) => nameWords.includes(a) || tags.some((w) => w.startsWith(a)))) return 4;
    if (alts.some((a) => words.some((w) => w.startsWith(a)))) return 2;
    /* a typo against the whole word or the part of it typed so far */
    const near = (w) => [w, w.slice(0, q.length), w.slice(0, q.length + 1)].some((part) => nearlyEqual(part, q));
    if (q.length >= 5 && words.some((w) => w.length >= 4 && near(w))) return 1;
    return 0;
  };

  const showLookups = (kinds) => {
    const list = panel.querySelector("[data-osint-lookup-list]");
    list.replaceChildren();
    const lead = kinds[0];
    let count = 0;
    const seen = new Set();
    for (const kind of kinds) {
      const able = cards.filter((card) => info.get(card).lookup?.[kind.type])
        .sort((a, b) => rank(kind.type, info.get(a).title) - rank(kind.type, info.get(b).title));
      for (const card of able) {
        const template = info.get(card).lookup?.[kind.type];
        const title = info.get(card).title;
        if (!template || seen.has(title + kind.value)) continue;
        seen.add(title + kind.value);
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = fill(template, kind);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        const b = document.createElement("b");
        b.textContent = title;
        const small = document.createElement("small");
        /* a URL or email also gets its domain looked up: say which */
        small.textContent = kind.type === "domain" && kind !== lead ? `domain ${kind.value}` : "";
        const vh = document.createElement("span");
        vh.className = "visually-hidden";
        vh.textContent = " (opens in a new tab)";
        a.append(b, small, vh);
        li.append(a);
        list.append(li);
        count += 1;
      }
    }
    const name = lead.label || lead.value;
    const shown = name.length > 48 ? `${name.slice(0, 45)}…` : name;
    panel.querySelector("[data-osint-lookup-title]").textContent = `Look up ${shown}`;
    panel.querySelector("[data-osint-lookup-note]").textContent = count
      ? `That looks like ${lead.sub ? `an ${lead.sub} hash` : LABELS[lead.type]}. ${count} lookup${count === 1 ? "" : "s"} below, each opening the result in a new tab. Nothing leaves this page until you click.`
      : `That looks like ${LABELS[lead.type]}, but none of these tools takes one directly.`;
    panel.hidden = false;
    return count;
  };

  const apply = () => {
    const query = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const kinds = detect(state.q, toolHosts);
    const types = new Set(kinds.map((kind) => kind.type));
    if (kinds.length) showLookups(kinds); else panel.hidden = true;

    const scores = new Map();
    let shown = 0;
    for (const section of sections) {
      const inCat = state.cat === "all" || section.id === state.cat;
      let inSection = 0, best = 0;
      for (const card of cardOrder.get(section)) {
        let score = 0, hit = inCat && (!state.free || card.dataset.access === "free");
        if (hit && kinds.length) {
          const lookup = info.get(card).lookup || {};
          hit = Object.keys(lookup).some((type) => types.has(type));
          score = hit ? 1 : 0;
        } else if (hit && query.length) {
          for (const q of query) {
            const s = wordScore(card, q);
            if (!s) { hit = false; break; }
            score += s;
          }
        }
        card.hidden = !hit;
        scores.set(card, score);
        if (hit) { inSection += 1; best = Math.max(best, score); }
      }
      section.hidden = inSection === 0;
      section.dataset.best = String(best);
      shown += inSection;
    }

    /* best matches first while searching; the original order otherwise */
    const ranking = query.length && !kinds.length;
    for (const section of sections) {
      const order = [...cardOrder.get(section)];
      if (ranking) order.sort((a, b) => scores.get(b) - scores.get(a));
      section.querySelector(".osint-grid").append(...order);
    }
    const sectionsNow = ranking ? [...sectionOrder].sort((a, b) => Number(b.dataset.best) - Number(a.dataset.best)) : sectionOrder;
    const anchor = empty;
    for (const section of sectionsNow) main.insertBefore(section, anchor);

    for (const chip of chips) {
      if (chip.dataset.osintChip === state.cat) chip.setAttribute("aria-current", "true");
      else chip.removeAttribute("aria-current");
    }
    free.setAttribute("aria-pressed", String(state.free));
    const filtered = query.length || state.cat !== "all" || state.free;
    status.textContent = kinds.length ? `${shown} tool${shown === 1 ? " takes" : "s take"} this` : filtered ? `${shown} of ${cards.length} tools` : "";
    empty.hidden = shown !== 0 || kinds.length > 0;
  };

  /* after a chip or toggle, bring the top of the results back into view */
  const toResults = () => {
    const top = bar.getBoundingClientRect().bottom;
    const first = panel.hidden ? sections.find((section) => !section.hidden) : panel;
    if (first && first.getBoundingClientRect().top < top) {
      window.scrollTo({ top: window.scrollY + first.getBoundingClientRect().top - top - 8 });
    }
  };

  for (const chip of chips) {
    chip.hidden = false;
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      const id = chip.dataset.osintChip;
      state.cat = id === state.cat ? "all" : id;
      history.replaceState(null, "", state.cat === "all" ? location.pathname + location.search : `${location.search}#${state.cat}`);
      apply();
      toResults();
    });
  }
  free.hidden = false;
  free.addEventListener("click", () => { state.free = !state.free; apply(); toResults(); });

  input.addEventListener("input", () => { state.q = input.value; apply(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      /* Enter opens the top result: the first lookup, or the best match */
      const first = panel.hidden
        ? sections.find((section) => !section.hidden)?.querySelector("[data-osint-tool]:not([hidden]) h3 a")
        : panel.querySelector("a");
      if (first && state.q.trim()) { event.preventDefault(); first.click(); }
      return;
    }
    if (event.key !== "Escape") return;
    if (input.value) { input.value = ""; state.q = ""; apply(); } else input.blur();
  });
  document.querySelector("[data-osint-reset]")?.addEventListener("click", () => {
    input.value = ""; Object.assign(state, { q: "", cat: "all", free: false });
    history.replaceState(null, "", location.pathname);
    apply();
    input.focus();
  });

  /* "/" jumps to search from anywhere outside a text field */
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    event.preventDefault();
    input.focus();
  });

  addEventListener("hashchange", () => { fromHash(); apply(); });
  search.hidden = false;
  const initial = new URLSearchParams(location.search).get("q");
  if (initial) { input.value = initial; state.q = initial; }
  fromHash();
  apply();
}

/* "New" on tools added in the last 30 days, worked out here rather than at
   build time so the generated page does not change with the date. Skipped
   while most of the list is new, when the badge would say nothing. */
function markNew() {
  const cards = [...document.querySelectorAll("[data-osint-tool][data-added]")];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const fresh = cards.filter((card) => Date.parse(`${card.dataset.added}T00:00:00Z`) >= cutoff);
  if (!fresh.length || fresh.length > cards.length / 2) return;
  for (const card of fresh) {
    const badge = document.createElement("span");
    badge.className = "osint-new";
    badge.textContent = "New";
    card.querySelector("h3").append(badge);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  markNew();
  initToolkit();
});
