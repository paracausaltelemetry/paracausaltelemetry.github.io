import { initCommandPalette } from "../js/command-palette.js?v=276fa973-lean";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";

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
  initDossierNav();
});
