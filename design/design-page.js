import { initCommandPalette } from "../js/command-palette.js?v=276fa973-defer";
import { initDesignReadouts } from "../js/design.js?v=276fa973";
import { initHeroDither } from "../js/hero-dither.js?v=276fa973";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  initHeroDither();
  initDesignReadouts();
});
