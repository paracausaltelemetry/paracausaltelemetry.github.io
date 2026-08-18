import { portfolio } from "./content.js?v=276fa973-lean";
import { initPlatform } from "./js/platform.js?v=276fa973-lean";
import { initTheme } from "./js/theme.js?v=276fa973";
import { initLatest } from "./js/latest.js?v=276fa973";
import { initThreatActors } from "./js/threat-actors-home.js?v=276fa973-lean";
import { initCommandPalette } from "./js/command-palette.js?v=276fa973-lean";
import { initHeroDither } from "./js/hero-dither.js?v=276fa973";
import { initSiteHeader } from "./js/site-header.js?v=276fa973-shell";

document.addEventListener("DOMContentLoaded", () => {
  initPlatform(portfolio);
  initCommandPalette();
  initSiteHeader();
  initTheme();
  initHeroDither();
  void initLatest();
  void initThreatActors();
});
