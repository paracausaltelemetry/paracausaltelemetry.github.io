import { portfolio } from "../content.js?v=276fa973-lean";
import { initCommandPalette } from "../js/command-palette.js?v=276fa973-palette";
import { initHeroDither } from "../js/hero-dither.js?v=276fa973";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-header";
import { initTheme } from "../js/theme.js?v=276fa973";
import { initWriteups } from "../js/writeups.js?v=276fa973-rooms5";

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initWriteups(portfolio);
  initTheme();
  initHeroDither();
});
