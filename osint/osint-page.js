import { initCommandPalette } from "../js/command-palette.js?v=276fa973-lean";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";

/* Filter: hides tools (and then whole categories) that do not match every
   word typed. The page works without it; the box only appears once this runs. */
function initFilter() {
  const box = document.querySelector("[data-osint-filter]");
  const input = document.getElementById("osint-filter-input");
  if (!box || !input) return;
  const status = box.querySelector(".osint-filter-status");
  const empty = document.querySelector("[data-osint-empty]");
  const sections = [...document.querySelectorAll("[data-osint-section]")];
  const jump = new Map([...document.querySelectorAll(".osint-jump a")].map((link) => [link.getAttribute("href").slice(1), link]));
  const total = document.querySelectorAll("[data-osint-tool]").length;

  const apply = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const section of sections) {
      let inSection = 0;
      for (const tool of section.querySelectorAll("[data-osint-tool]")) {
        const hit = words.every((word) => tool.dataset.terms.includes(word));
        tool.hidden = !hit;
        if (hit) inSection += 1;
      }
      section.hidden = inSection === 0;
      const link = jump.get(section.id);
      if (link) link.hidden = inSection === 0;
      shown += inSection;
    }
    empty.hidden = shown !== 0;
    status.textContent = words.length ? `${shown} of ${total}` : "";
  };

  input.addEventListener("input", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value) { input.value = ""; apply(); }
  });
  box.hidden = false;
}

/* Mark the category in view in the jump bar. */
function initJumpNav() {
  const links = [...document.querySelectorAll(".osint-jump a")];
  if (!links.length || !("IntersectionObserver" in window)) return;
  const byId = new Map(links.map((link) => [link.getAttribute("href").slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((link) => link.removeAttribute("aria-current"));
      byId.get(entry.target.id)?.setAttribute("aria-current", "true");
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  document.querySelectorAll("[data-osint-section]").forEach((section) => observer.observe(section));
}

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  initFilter();
  initJumpNav();
});
