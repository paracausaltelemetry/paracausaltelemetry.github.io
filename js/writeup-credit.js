// Author credit for writeups by someone else (front-matter `author:`,
// `author_url:` and `source:`), shared by the static writeup pages
// (scripts/build-content-index.mjs) and the in-page reader (js/writeups.js) so
// both open with the same byline. Returns an HTML string; every value from the
// data is escaped here.

const esc = (value = "") =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// only https links, so nothing else can ride along in the data
const httpsUrl = (url) => (typeof url === "string" && /^https:\/\/[^\s"'<>]+$/i.test(url.trim()) ? url.trim() : "");

// GitHub's mark, drawn in currentColor
const GITHUB_MARK =
  '<svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

// opens in a new tab
const EXTERNAL_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10"/><path d="M9.5 2H14v4.5M14 2 7.5 8.5"/></svg>';

// "https://github.com/ethanbauer10" -> "@ethanbauer10"
const githubHandle = (url) => {
  const m = url.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/i);
  return m ? `@${m[1]}` : "";
};

/**
 * @param {{ name: string, url?: string, source?: string } | null | undefined} author
 * @returns {string}
 */
export const writeupCreditHtml = (author) => {
  if (!author?.name) return "";
  const profile = httpsUrl(author.url);
  const source = httpsUrl(author.source);
  const handle = githubHandle(profile);
  const name = profile
    ? `<a class="writeup-credit-author" href="${esc(profile)}" rel="author noreferrer" target="_blank">${esc(author.name)}</a>`
    : `<span class="writeup-credit-author">${esc(author.name)}</span>`;
  const sourceLink = source
    ? `<a class="writeup-credit-source" href="${esc(source)}" rel="noreferrer" target="_blank">${/^https:\/\/github\.com\//i.test(source) ? "Original on GitHub" : "Read the original"}${EXTERNAL_ICON}</a>`
    : "";
  return `<aside class="writeup-credit" aria-label="Author"><span class="writeup-credit-mark">${handle ? GITHUB_MARK : ""}</span><div class="writeup-credit-body"><p class="writeup-credit-kicker">Guest writeup</p><p class="writeup-credit-name">${name}${handle ? ` <span class="writeup-credit-handle">${esc(handle)}</span>` : ""}</p><p class="writeup-credit-note">Published here with the author's permission.</p></div>${sourceLink}</aside>`;
};
