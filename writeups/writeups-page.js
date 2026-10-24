import { portfolio } from "../content.js?v=276fa973-lean";
import { initCommandPalette } from "../js/command-palette.js?v=search1";
import { initHeroDither } from "../js/hero-dither.js?v=276fa973-idle";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-header";
import { initTheme } from "../js/theme.js?v=276fa973";
import { initWriteups } from "../js/writeups.js?v=276fa973-ui7";

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initWriteups(portfolio);
  initTheme();
  initHeroDither();
});
