// 404 page: turn the missing URL into "did you mean" links. The words of the
// path (/writeups/titanic -> "titanic") are scored against the same indexes
// the Ctrl+K palette searches, and a button opens the palette with them typed.

const PAGES = [
  { label: "Writeups", detail: "Hack The Box and TryHackMe archive", href: "/writeups/" },
  { label: "OSINT toolkit", detail: "Open-source intelligence tools", href: "/osint/" },
  { label: "Talks", detail: "Slides and PDF downloads", href: "/#talks" },
  { label: "Observer", detail: "Operational lookup for endpoint, identity, network, cloud and DFIR", href: "/observer/" },
  { label: "Threat actors", detail: "CTI dossiers", href: "/#threat-actors" }
];
const INDEXES = ["/writeups/search.json", "/talks/index.json", "/threat-actors/index.json"];
const IGNORE = new Set(["404", "www", "index", "html", "htm", "php", "the", "and", "page", "pages", "writeups", "writeup", "talks", "thm", "htb"]);

const pathWords = () => decodeURIComponent(location.pathname)
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((word) => word.length >= 3 && !IGNORE.has(word));

const score = (entry, words) => words.reduce((total, word) => {
  if (entry.href.toLowerCase().includes(word)) return total + 3;
  if (entry.label.toLowerCase().includes(word)) return total + 2;
  if (`${(entry.terms || []).join(" ")} ${entry.words || ""}`.toLowerCase().includes(word)) return total + 1;
  return total;
}, 0);

const loadEntries = async () => {
  const documents = await Promise.all(INDEXES.map((url) => fetch(url)
    .then((response) => (response.ok ? response.json() : { entries: [] }))
    .catch(() => ({ entries: [] }))));
  return [...PAGES, ...documents.flatMap((doc) => (Array.isArray(doc.entries) ? doc.entries : []))]
    .filter((entry) => entry.type !== "Talk slide" && !entry.external);
};

const render = (matches, words) => {
  const section = document.querySelector("[data-not-found-suggest]");
  const list = section?.querySelector("ul");
  if (!section || !list) return;
  list.replaceChildren(...matches.map((entry) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = entry.href;
    const label = document.createElement("strong");
    label.textContent = entry.label;
    const detail = document.createElement("span");
    detail.textContent = entry.detail || "";
    link.append(label, detail);
    item.append(link);
    return item;
  }));
  const search = section.querySelector("[data-not-found-search]");
  if (search && words.length) {
    search.textContent = `Search the site for "${words.join(" ")}"`;
    search.hidden = false;
    search.addEventListener("click", () => {
      document.querySelector(".command-trigger")?.click();
      requestAnimationFrame(() => {
        const input = document.querySelector(".command-input");
        if (!input) return;
        input.value = words.join(" ");
        input.dispatchEvent(new Event("input"));
      });
    });
  }
  section.hidden = !matches.length && !words.length;
  section.querySelector("[data-not-found-title]").textContent = matches.length ? "Did you mean" : "Nothing close to that address";
};

export const initNotFound = async () => {
  const words = pathWords();
  if (!words.length) return;
  const entries = await loadEntries();
  const scored = entries
    .map((entry) => ({ entry, points: score(entry, words) }))
    .filter(({ points }) => points > 0)
    .sort((a, b) => b.points - a.points);
  // only matches at least half as strong as the best, so one stray body word
  // doesn't pad the list
  const best = scored[0]?.points || 0;
  const matches = scored
    .filter(({ points }) => points >= best / 2)
    .slice(0, 5)
    .map(({ entry }) => entry);
  render(matches, words);
};

document.addEventListener("DOMContentLoaded", () => { void initNotFound(); });
