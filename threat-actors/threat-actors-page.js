import { initCommandPalette } from "../js/command-palette.js?v=276fa973-threat-actors-defer";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";

const normalize = (value) => String(value || "").trim().toLowerCase();

function initActorDirectory() {
  // A live filter, not a form: nothing is ever submitted, and a <form> without
  // a submit button fails WCAG H32.
  const form = document.getElementById("actor-filter");
  if (!(form instanceof HTMLElement)) return;

  const query = document.getElementById("actor-query");
  const chips = [...form.querySelectorAll("[data-filter-state]")];
  const status = document.getElementById("actor-results-status");
  const empty = document.getElementById("actor-empty");
  const cards = [...document.querySelectorAll("[data-actor-card]")];
  if (!(query instanceof HTMLInputElement)) return;

  let activeState = "";
  const initial = new URLSearchParams(window.location.search);
  query.value = normalize(initial.get("q"));
  const initialState = normalize(initial.get("state"));
  if (chips.some((chip) => chip.dataset.filterState === initialState)) activeState = initialState;

  const syncChips = () => {
    for (const chip of chips) {
      const on = chip.dataset.filterState === activeState;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };

  const render = () => {
    const q = normalize(query.value);
    let visible = 0;

    for (const card of cards) {
      const matches = (!q || normalize(card.dataset.search).includes(q))
        && (!activeState || normalize(card.dataset.state) === activeState);
      card.hidden = !matches;
      if (matches) visible += 1;
    }

    if (status) status.textContent = `${visible} profile${visible === 1 ? "" : "s"}`;
    if (empty) empty.hidden = visible !== 0;

    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (activeState) next.set("state", activeState);
    window.history.replaceState(null, "", next.size ? `?${next.toString()}` : window.location.pathname);
  };

  query.addEventListener("input", render);
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      activeState = chip.dataset.filterState;
      syncChips();
      render();
    });
  }

  syncChips();
  render();
}

function initDossierNav() {
  const nav = document.querySelector(".actor-dossier-nav");
  if (!nav || !("IntersectionObserver" in window)) return;

  const map = new Map();
  for (const link of nav.querySelectorAll("a")) {
    const id = link.getAttribute("href")?.slice(1);
    const section = id && document.getElementById(id);
    if (section) map.set(section, link);
  }
  if (!map.size) return;

  let active = null;
  const setActive = (link) => {
    if (link === active) return;
    if (active) active.removeAttribute("aria-current");
    if (link) link.setAttribute("aria-current", "true");
    active = link;
  };

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    if (visible) setActive(map.get(visible.target));
  }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

  for (const section of map.keys()) observer.observe(section);
}

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  initActorDirectory();
  initDossierNav();
});
