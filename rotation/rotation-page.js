import { initCommandPalette } from "../js/command-palette.js?v=276fa973-rotation";
import { initRotation } from "../js/rotation.js?v=276fa973-rotation";
import { initSiteHeader } from "../js/site-header.js?v=276fa973-shell";
import { initTheme } from "../js/theme.js?v=276fa973";

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  void initRotation();
});
