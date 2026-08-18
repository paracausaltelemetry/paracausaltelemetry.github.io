// Entry for the generated static writeup article pages. These used to ship no
// JavaScript at all, which left the baked header's theme toggle and mobile menu
// inert and the prose unenhanced. The same enhancement the client-side reader
// applies runs here: heading anchors, syntax highlighting, copy-able code
// blocks with a line-number gutter. No TOC rail — the article is the page.
import { enhanceMarkdownBody } from "./markdown.js?v=276fa973-lean";
import { initCommandPalette } from "./command-palette.js?v=276fa973-lean";
import { initSiteHeader } from "./site-header.js?v=276fa973-shell";
import { initTheme } from "./theme.js?v=276fa973";

document.addEventListener("DOMContentLoaded", () => {
  initCommandPalette();
  initSiteHeader();
  initTheme();
  enhanceMarkdownBody(document.querySelector(".markdown-body"));
});
