import { initCommandPalette } from "../js/command-palette.js?v=276fa973-1-defer";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";
import { loadObserverStore } from "../js/observer/data.js?v=276fa973-1";
import { initObserver } from "../js/observer/render.js?v=276fa973-2";

document.addEventListener("DOMContentLoaded", async () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  const input = document.getElementById("observer-input");
  const listbox = document.getElementById("observer-suggestions");
  const status = document.getElementById("observer-status");
  const results = document.getElementById("observer-results");
  const facetBar = document.getElementById("observer-facets");
  if (!input || !listbox || !status || !results || !facetBar) return;
  try {
    const store = await loadObserverStore();
    initObserver({ input, listbox, status, results, facetBar, store });
  } catch (error) {
    input.disabled = true;
    const alert = document.createElement("div");
    alert.className = "observer-error";
    alert.setAttribute("role", "alert");
    alert.textContent = `Observer could not load: ${error instanceof Error ? error.message : "unknown error"}`;
    results.replaceChildren(alert);
    status.textContent = "The operational reference is unavailable.";
  }
});
