import { initCommandPalette } from "../js/command-palette.js?v=276fa973-lean";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-hdr";
import { initTheme } from "../js/theme.js?v=276fa973";

/* Search, category chips and "Free only" narrow the grid in place. The
   category lives in the URL hash (/osint/#tracking) so a filtered view can
   be shared. Without this script the chips are plain jump links. */
function initToolkit() {
  const search = document.querySelector("[data-osint-filter]");
  const input = document.getElementById("osint-filter-input");
  if (!search || !input) return;
  const chips = [...document.querySelectorAll("[data-osint-chip]")];
  const free = document.querySelector("[data-osint-free]");
  const status = document.querySelector("[data-osint-status]");
  const empty = document.querySelector("[data-osint-empty]");
  const bar = document.querySelector("[data-osint-bar]");
  const sections = [...document.querySelectorAll("[data-osint-section]")];
  const cards = [...document.querySelectorAll("[data-osint-tool]")];
  const ids = new Set(sections.map((section) => section.id));
  /* match the start of words, so "ip" finds IP addresses but not "equipment" */
  const words = new Map(cards.map((card) => [card, card.dataset.terms.split(/[^a-z0-9.+#-]+/).filter(Boolean)]));
  const state = { q: "", cat: "all", free: false };

  const fromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    state.cat = ids.has(id) ? id : "all";
  };

  const apply = () => {
    const query = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const section of sections) {
      const inCat = state.cat === "all" || section.id === state.cat;
      let inSection = 0;
      for (const card of section.querySelectorAll("[data-osint-tool]")) {
        const hit = inCat
          && (!state.free || card.dataset.access === "free")
          && query.every((q) => words.get(card).some((word) => word.startsWith(q)));
        card.hidden = !hit;
        if (hit) inSection += 1;
      }
      section.hidden = inSection === 0;
      shown += inSection;
    }
    for (const chip of chips) {
      if (chip.dataset.osintChip === state.cat) chip.setAttribute("aria-current", "true");
      else chip.removeAttribute("aria-current");
    }
    free.setAttribute("aria-pressed", String(state.free));
    const filtered = query.length || state.cat !== "all" || state.free;
    status.textContent = filtered ? `${shown} of ${cards.length} tools` : "";
    empty.hidden = shown !== 0;
  };

  /* after a chip or toggle, bring the top of the results back into view */
  const toResults = () => {
    const top = bar.getBoundingClientRect().bottom;
    const first = sections.find((section) => !section.hidden);
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
      history.replaceState(null, "", state.cat === "all" ? location.pathname : `#${state.cat}`);
      apply();
      toResults();
    });
  }
  free.hidden = false;
  free.addEventListener("click", () => { state.free = !state.free; apply(); toResults(); });

  input.addEventListener("input", () => { state.q = input.value; apply(); });
  input.addEventListener("keydown", (event) => {
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
