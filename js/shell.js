// Shared entry for pages that need nothing but the site chrome.
import { initCommandPalette } from "./command-palette.js?v=search2";
import { initHeroDither } from "./hero-dither.js?v=276fa973-idle";
import { initSiteHeader } from "./site-header.js?v=276fa973-header";
import { initTheme } from "./theme.js?v=276fa973";

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  initHeroDither();
});
