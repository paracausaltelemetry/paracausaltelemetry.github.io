// Writeups in the CTF-Writeups repo open with a hand-written header that
// repeats their front-matter:
//
//   # CTF Room: Titanic
//   - [Link to machine](https://app.hackthebox.com/machines/Titanic)
//   - **Difficulty:** Easy
//   - **Category:** Web / PrivEsc
//   - **OS:** Linux
//
// The info card, Box Info panel and tags show all of that now, so the list is
// dropped, and the title too when an info card stands in for it. Shared by the
// static pages (scripts/build-content-index.mjs) and the reader (js/writeups.js).

const FACT_ITEM = /^\s*[-*+]\s+(?:\*\*|__)?(?:difficulty|category|categories|os|platform|type|points)\s*:?\s*(?:\*\*|__)?\s*:?/i;
const LINK_ITEM = /^\s*[-*+]\s+\[[^\]]*\]\([^)]*\)\s*$/;

/**
 * @param {string} markdown  Writeup body, front-matter already removed.
 * @param {{ dropTitle?: boolean }} [options]  dropTitle also removes a leading `#` title.
 * @returns {string}
 */
export const stripWriteupHeader = (markdown, { dropTitle = false } = {}) => {
  const lines = String(markdown).split("\n");
  let i = 0;
  const skipBlank = () => { while (i < lines.length && !lines[i].trim()) i++; };

  skipBlank();
  const titleAt = /^#\s+\S/.test(lines[i] || "") ? i : -1;
  if (titleAt >= 0) { i++; skipBlank(); }

  const listStart = i;
  let facts = 0;
  while (i < lines.length && (FACT_ITEM.test(lines[i]) || LINK_ITEM.test(lines[i]))) {
    if (FACT_ITEM.test(lines[i])) facts++;
    i++;
  }
  // only a list made entirely of header items, with at least one fact, and
  // ending at a blank line or heading, counts as the header
  const next = lines[i] ?? "";
  const isHeader = facts > 0 && (!next.trim() || /^#/.test(next));
  const keepFrom = isHeader ? i : listStart;

  const rest = lines.slice(keepFrom).join("\n");
  return titleAt >= 0 && !dropTitle ? `${lines[titleAt]}\n\n${rest}` : rest;
};
