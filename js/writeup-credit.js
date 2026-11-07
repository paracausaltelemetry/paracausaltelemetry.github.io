// Author banner for writeups written by someone else. Their front-matter names
// them (`author:`) and links their GitHub (`author_url:`); the banner opens the
// static writeup page (scripts/build-content-index.mjs) and the in-page reader
// (js/writeups.js). Returns an HTML string; every value from the data is
// escaped here.

const esc = (value = "") =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// only https links, so nothing else can ride along in the data
const httpsUrl = (url) => (typeof url === "string" && /^https:\/\/[^\s"'<>]+$/i.test(url.trim()) ? url.trim() : "");

// GitHub's mark, drawn in currentColor
const GITHUB_MARK =
  '<svg class="writeup-credit-mark" viewBox="0 0 16 16" width="28" height="28" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

/**
 * @param {{ name: string, url?: string } | null | undefined} author
 * @returns {string}
 */
export const writeupCreditHtml = (author) => {
  if (!author?.name) return "";
  const profile = httpsUrl(author.url);
  const onGitHub = /^https:\/\/github\.com\//i.test(profile);
  const handle = onGitHub ? profile.replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/, "") : "";
  const text = `<span class="writeup-credit-text"><span class="writeup-credit-label">Writeup by</span><strong class="writeup-credit-name">${esc(author.name)}</strong></span>`;
  if (!profile) return `<aside class="writeup-credit" aria-label="Writeup author"><div class="writeup-credit-inner">${text}</div></aside>`;
  const cta = onGitHub ? `github.com/${esc(handle)}` : "Author's profile";
  return `<aside class="writeup-credit" aria-label="Writeup author"><a class="writeup-credit-inner" href="${esc(profile)}" rel="author noreferrer" target="_blank">${onGitHub ? GITHUB_MARK : ""}${text}<span class="writeup-credit-cta">${cta}<span aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span></span></a></aside>`;
};
