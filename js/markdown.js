// Markdown renderer + viewer enhancer for the writeups reader. Renders GFM
// (tables, nested/task lists, callouts, fenced code) into a .markdown-body
// element, then enhances it with heading anchors, a table of contents, syntax
// highlighting, and copy-able code blocks with line numbers.
//
// renderMarkdown is link-source-agnostic: pass { resolveLink } to rewrite
// link/image targets. Writeups resolves them to GitHub raw URLs; same-origin
// callers use the default identity resolver.

import { escapeHtml, escapeAttribute } from "./utils.js?v=276fa973";
import { highlightAllIn } from "./highlight.js?v=276fa973";

const slugifyText = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

// Clipboard glyph for the code-block copy button. Static, trusted SVG built via
// createContextualFragment (no innerHTML on a live node).
const COPY_ICON_SVG =
  '<svg class="writeup-code-copy-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>';

const createCopyIcon = () => document.createRange().createContextualFragment(COPY_ICON_SVG);

// --- Flag / spoiler redaction ------------------------------------------------
//
// Writeups hide their answers behind click-to-reveal spoilers so the archive can
// be browsed without spoiling rooms. Two sources feed one pipeline:
//
//   1. Explicit `||spoiler||` markup — authored anywhere (prose, tables, lists,
//      code fences), for flags, passwords, hashes, anything. Handled up-front in
//      renderMarkdown by extractExplicitSpoilers.
//   2. Auto-detected flags — `PREFIX{...}` (THM/HTB/CTF/pico/generic) and, in
//      prose only, 32-hex hashes near the word "flag". A safety net for authors
//      who forget the markup.
//
// The decision is made on *source text*, never on the highlighted DOM: a flag in
// a syntax-highlighted block would otherwise be split across token <span>s and
// slip through. Each spoiler is replaced with a private-use sentinel that carries
// its value PUA-encoded — invisible to escapeHtml and to the highlighter's
// tokenizer (no grammar rule matches the private-use range) — then materialized
// into a button after highlighting.

const BRACED_FLAG_SOURCE = /\b[A-Za-z][A-Za-z0-9_]{1,}\{[^{}\s]{2,160}\}/;
const HEX_FLAG_SOURCE = /\b[a-fA-F0-9]{32}\b/;
const BRACED_FLAG_RE = new RegExp(BRACED_FLAG_SOURCE.source, "g");
const HEX_FLAG_RE = new RegExp(HEX_FLAG_SOURCE.source, "g");

// Private-use sentinel: U+E000 open, U+E001 close, payload bytes offset into
// U+E100–U+E1FF. None of these code points match any highlighter grammar rule,
// so the whole run survives tokenizing as a single plain-text token.
const SPOILER_OPEN = String.fromCharCode(0xe000);
const SPOILER_CLOSE = String.fromCharCode(0xe001);
const SPOILER_BYTE_BASE = 0xe100;
const SPOILER_SENTINEL_RE = new RegExp(SPOILER_OPEN + "([\\uE100-\\uE1FF]*)" + SPOILER_CLOSE, "g");

const encodeSpoiler = (value) => {
  let out = SPOILER_OPEN;
  new TextEncoder().encode(value).forEach((byte) => {
    out += String.fromCharCode(SPOILER_BYTE_BASE + byte);
  });
  return out + SPOILER_CLOSE;
};

const decodeSpoiler = (payload) => {
  const bytes = Uint8Array.from(payload, (ch) => ch.charCodeAt(0) - SPOILER_BYTE_BASE);
  return new TextDecoder().decode(bytes);
};

// `||secret||` → sentinel. Runs before block parsing so it works in every
// context. Requires non-pipe content, so empty GFM table cells (`| a || b |`)
// are left alone; a literal `||` inside a table cell should be escaped `\|\|`.
const extractExplicitSpoilers = (text) =>
  text.replace(/\|\|([^|\n]+?)\|\|/g, (_, value) => encodeSpoiler(value));

// Wrap braced flags in a raw code-block source before it is escaped/highlighted.
const autoDetectFlagsInSource = (source) =>
  source.replace(new RegExp(BRACED_FLAG_SOURCE.source, "g"), (match) => encodeSpoiler(match));

const hasNearbyFlagContext = (node) => {
  const parent = node.parentElement;
  const block = parent?.closest("pre, p, li, td, th, blockquote, dd, dt") || parent;
  if (!block) return false;

  // The word "flag" in the hash's own block is the strongest signal ("the flag
  // is <hash>"); otherwise look back over preceding siblings/ancestors.
  if (/\bflag\b/.test((block.textContent || "").toLowerCase())) return true;

  let current = block;
  for (let hops = 0; hops < 12; hops += 1) {
    if (current.previousElementSibling) {
      current = current.previousElementSibling;
    } else {
      current = current.parentElement;
    }
    if (!current) return false;
    const text = (current.textContent || "").toLowerCase();
    if (/\bflag\b/.test(text)) return true;
    if (/^H[12]$/.test(current.tagName)) return false;
  }
  return false;
};

const createFlagSpoiler = (value) => {
  const button = document.createElement("button");
  button.className = "flag-spoiler";
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", "Hidden flag. Press to reveal.");
  button.title = "Reveal flag";

  const span = document.createElement("span");
  span.className = "flag-spoiler-value";
  span.textContent = value;
  button.append(span);

  button.addEventListener("click", () => {
    const revealed = button.classList.toggle("is-revealed");
    button.setAttribute("aria-pressed", revealed ? "true" : "false");
    button.setAttribute("aria-label", revealed ? "Revealed flag. Press to hide." : "Hidden flag. Press to reveal.");
    button.title = revealed ? "Hide flag" : "Reveal flag";
  });

  return button;
};

// Replace sentinels (explicit spoilers + flags auto-detected in code) with
// reveal buttons. Runs after highlighting; the sentinel survives it intact.
const materializeSpoilers = (body) => {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!(node.nodeValue || "").includes(SPOILER_OPEN)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const text = node.nodeValue || "";
    const fragment = document.createDocumentFragment();
    let match;
    let lastIndex = 0;
    SPOILER_SENTINEL_RE.lastIndex = 0;
    while ((match = SPOILER_SENTINEL_RE.exec(text)) !== null) {
      if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      fragment.append(createFlagSpoiler(decodeSpoiler(match[1])));
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex === 0) return;
    if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
    node.parentNode?.replaceChild(fragment, node);
  });
};

// Prose safety net: auto-detect unmarked flags left in ordinary text (and inline
// code). Code fences are handled at source, so <pre> is skipped here — the
// post-highlight DOM splits flags across token spans and can't be matched.
const redactFlagTextNode = (node) => {
  const text = node.nodeValue || "";
  const regex = hasNearbyFlagContext(node)
    ? new RegExp(`${BRACED_FLAG_SOURCE.source}|${HEX_FLAG_SOURCE.source}`, "g")
    : new RegExp(BRACED_FLAG_SOURCE.source, "g");

  let match;
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
    fragment.append(createFlagSpoiler(match[0]));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return;
  if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
  node.parentNode?.replaceChild(fragment, node);
};

const redactFlagsInBody = (body) => {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.nodeValue || "";
      if (!BRACED_FLAG_RE.test(text) && !HEX_FLAG_RE.test(text)) return NodeFilter.FILTER_REJECT;
      BRACED_FLAG_RE.lastIndex = 0;
      HEX_FLAG_RE.lastIndex = 0;

      const parent = node.parentElement;
      if (!parent || parent.closest("pre, .flag-spoiler, .heading-anchor")) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => redactFlagTextNode(node));
};

// --- Clipboard ---

export const copyTextToClipboard = async (value, button, defaultLabel = null) => {
  if (!value) return false;
  const nextLabel = defaultLabel || button.textContent || "";
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
    window.setTimeout(() => { button.textContent = nextLabel; }, 1200);
    return true;
  } catch {
    button.textContent = "Copy Failed";
    window.setTimeout(() => { button.textContent = nextLabel; }, 1200);
    return false;
  }
};

// --- Inline markdown ---

const identity = (href) => href;

// Turns bare http(s) URLs into links. Runs on already-escaped text, after the
// markdown links/images have been pulled out into tokens, so it only ever sees
// plain URLs (never ones already inside a [](...)). Trailing sentence
// punctuation is left outside the link.
const linkifyBareUrls = (escaped) =>
  escaped.replace(/(^|[\s(])(https?:\/\/[^\s<>")]+)/g, (_, pre, url) => {
    const trail = url.match(/[.,;:!?]+$/);
    const tail = trail ? trail[0] : "";
    const href = tail ? url.slice(0, -tail.length) : url;
    return `${pre}<a href="${href}" target="_blank" rel="noreferrer">${href}</a>${tail}`;
  });

const renderInlineMarkdown = (text, resolveLink) => {
  const tokens = [];
  const pushToken = (html) => {
    const token = `@@TOKEN${tokens.length}@@`;
    tokens.push(html);
    return token;
  };

  let output = text;

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    pushToken(`<img src="${escapeAttribute(resolveLink(src))}" alt="${escapeAttribute(alt)}" loading="lazy" />`)
  );

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const resolved = resolveLink(href);
    const external = /^https?:/i.test(resolved);
    return pushToken(
      `<a href="${escapeAttribute(resolved)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHtml(label)}</a>`
    );
  });

  output = output.replace(/`([^`]+)`/g, (_, code) => pushToken(`<code>${escapeHtml(code)}</code>`));
  output = escapeHtml(output);
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  output = linkifyBareUrls(output);

  return output.replace(/@@TOKEN(\d+)@@/g, (_, index) => tokens[Number(index)] || "");
};

const isMarkdownBlockStart = (line) =>
  /^#{1,6}\s/.test(line) ||
  /^>\s?/.test(line) ||
  /^\s*[-*+]\s+/.test(line) ||
  /^\s*\d+\.\s+/.test(line) ||
  /^(```|~~~)/.test(line) ||
  /^---+$/.test(line.trim()) ||
  /^\*\*\*+$/.test(line.trim());

// --- GFM tables ---
// A header row of "| a | b |" cells followed by a "| --- | :--: |" separator.

const CELL_PIPE = "\u0000"; // stand-in for an escaped \| while splitting on |

const splitTableCells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .replace(/\\\|/g, CELL_PIPE)
    .split("|")
    .map((cell) => cell.split(CELL_PIPE).join("|").trim());

const isTableSeparatorRow = (line) => {
  if (!line || !line.includes("-")) return false;
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
};

const isTableStart = (lines, i) =>
  i + 1 < lines.length && lines[i].includes("|") && isTableSeparatorRow(lines[i + 1]);

const columnAlignment = (cell) => {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
};

// --- Nested / task lists ---
// Items nest by leading-indent width (a tab counts as two spaces). A stack
// tracks the open <ul>/<ol> levels so deeper items reopen the previous <li>.

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

const parseListItems = (block) => {
  const items = [];
  block.forEach((raw) => {
    const match = raw.match(LIST_ITEM_RE);
    if (match) {
      const indent = match[1].replace(/\t/g, "  ").length;
      let text = match[3];
      let checked = null;
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        checked = task[1].toLowerCase() === "x";
        text = task[2];
      }
      items.push({ indent, ordered: /\d/.test(match[2]), checked, text });
    } else if (items.length) {
      // Indented continuation line — fold into the previous item.
      items[items.length - 1].text += ` ${raw.trim()}`;
    }
  });
  return items;
};

const renderListBlock = (block, resolveLink) => {
  const items = parseListItems(block);
  if (!items.length) return "";

  let html = "";
  const stack = []; // { indent, ordered }

  items.forEach((item) => {
    // Close any lists deeper than this item first.
    while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) {
      html += stack.pop().ordered ? "</ol></li>" : "</ul></li>";
    }
    const top = stack[stack.length - 1];
    if (!top || item.indent > top.indent) {
      // First list, or a deeper list nested inside the previous <li>.
      if (top) html = html.replace(/<\/li>$/, "");
      stack.push({ indent: item.indent, ordered: item.ordered });
      html += item.ordered ? "<ol>" : "<ul>";
    } else if (top.ordered !== item.ordered) {
      // Same level but the marker switched bullet <-> number: a new sibling list.
      html += stack.pop().ordered ? "</ol>" : "</ul>";
      stack.push({ indent: item.indent, ordered: item.ordered });
      html += item.ordered ? "<ol>" : "<ul>";
    }
    const checkbox =
      item.checked === null ? "" : `<input type="checkbox" disabled${item.checked ? " checked" : ""} /> `;
    const liClass = item.checked === null ? "" : ' class="task-item"';
    html += `<li${liClass}>${checkbox}${renderInlineMarkdown(item.text, resolveLink)}</li>`;
  });

  while (stack.length) {
    html += stack.pop().ordered ? "</ol>" : "</ul>";
    if (stack.length) html += "</li>";
  }
  return html;
};

// --- Callouts (> **Note:** / **Defender view:** / **Watch for:** / **Warning:**) ---

const calloutVariant = (firstLine) => {
  const match = firstLine.match(/^\*\*(Note|Warning|Tip|Defender view|Watch for|Interview angle):\*\*/i);
  return match ? match[1].toLowerCase().replaceAll(" ", "-") : "";
};

// --- Block renderer ---

export const renderMarkdown = (markdown, { resolveLink = identity, headingOffset = 0 } = {}) => {
  // Extract explicit ||spoiler|| markup up-front (pre-parse) so it survives every
  // downstream stage — escaping, table splitting, and code highlighting — as an
  // opaque sentinel, then becomes a reveal button in enhanceMarkdownBody.
  const lines = extractExplicitSpoilers(markdown.replace(/\r\n/g, "\n")).split("\n");
  let index = 0;
  let html = "";

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) { index += 1; continue; }

    const fence = trimmed.match(/^(```|~~~)(.*)$/);
    if (fence) {
      const marker = fence[1];
      const language = fence[2].trim();
      const block = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(marker)) {
        block.push(lines[index]);
        index += 1;
      }
      index += 1;
      const langAttr = language ? ` class="language-${escapeAttribute(language)}"` : "";
      const langTag = language ? `<span class="bt-code-lang" aria-hidden="true">${escapeHtml(language)}</span>` : "";
      // Auto-detect flags on the raw source (before escaping/highlighting) so
      // they redact even when the highlighter would split them across tokens.
      const code = autoDetectFlagsInSource(block.join("\n"));
      html += `<pre>${langTag}<code${langAttr}>${escapeHtml(code)}</code></pre>`;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      // Embedded bodies (KB/writeup viewers) pass headingOffset: 1 so their
      // top-level "#" becomes h2 under the page h1 + entry-title heading,
      // keeping the document outline free of duplicate/mis-levelled h1s.
      const level = Math.min(Math.min(heading[1].length, 4) + headingOffset, 6);
      html += `<h${level}>${renderInlineMarkdown(heading[2], resolveLink)}</h${level}>`;
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      html += "<hr />";
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headerCells = splitTableCells(line);
      const aligns = splitTableCells(lines[index + 1]).map(columnAlignment);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(splitTableCells(lines[index]));
        index += 1;
      }
      const alignAttr = (i) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : "");
      const head = headerCells
        .map((cell, i) => `<th scope="col"${alignAttr(i)}>${renderInlineMarkdown(cell, resolveLink)}</th>`)
        .join("");
      const tbody = rows
        .map(
          (row) =>
            `<tr>${headerCells
              .map((_, i) => `<td${alignAttr(i)}>${renderInlineMarkdown(row[i] || "", resolveLink)}</td>`)
              .join("")}</tr>`
        )
        .join("");
      // Focusable scroll container so keyboard users can pan wide tables.
      html +=
        `<div class="md-table-scroll" tabindex="0" role="region" aria-label="Table">` +
        `<table><thead><tr>${head}</tr></thead>${tbody ? `<tbody>${tbody}</tbody>` : ""}</table></div>`;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const block = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        block.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      const variant = calloutVariant(block[0] || "");
      const cls = variant ? ` class="callout callout-${variant}"` : "";
      html += `<blockquote${cls}>${block
        .filter((item) => item.trim())
        .map((item) => `<p>${renderInlineMarkdown(item, resolveLink)}</p>`)
        .join("")}</blockquote>`;
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const block = [];
      while (index < lines.length) {
        const current = lines[index];
        if (LIST_ITEM_RE.test(current) || /^\s+\S/.test(current)) {
          block.push(current);
          index += 1;
          continue;
        }
        // Tolerate a blank line between items (loose lists) when the list
        // clearly continues on the next non-blank line.
        if (!current.trim()) {
          let look = index + 1;
          while (look < lines.length && !lines[look].trim()) look += 1;
          if (look < lines.length && LIST_ITEM_RE.test(lines[look])) {
            index = look;
            continue;
          }
        }
        break;
      }
      html += renderListBlock(block, resolveLink);
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isMarkdownBlockStart(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html += `<p>${renderInlineMarkdown(paragraph.join(" "), resolveLink)}</p>`;
  }

  return html || "<p>No markdown content found.</p>";
};

// --- Viewer enhancement ---

// Adds heading ids + anchor links, an optional table of contents, syntax
// highlighting, and copy-able code blocks with a line-number gutter, operating
// on a rendered .markdown-body element. When tocPanel/toc are supplied they
// receive the generated contents (shown only when there are >= 2 headings).
export const enhanceMarkdownBody = (body, { tocPanel = null, toc = null } = {}) => {
  if (!(body instanceof HTMLElement)) return;

  const headingCounts = new Map();
  const headings = Array.from(body.querySelectorAll("h1, h2, h3, h4, h5")).map((heading) => {
    // Capture the text before appending the anchor so the "#" stays out of it.
    const text = heading.textContent || "Section";
    const baseId = slugifyText(text);
    const count = headingCounts.get(baseId) || 0;
    headingCounts.set(baseId, count + 1);
    const id = count ? `${baseId}-${count + 1}` : baseId;
    heading.id = id;
    const anchor = document.createElement("a");
    anchor.className = "heading-anchor";
    anchor.href = `#${id}`;
    anchor.setAttribute("aria-label", `Link to "${text}"`);
    anchor.textContent = "#";
    heading.append(anchor);
    return { id, level: Number(heading.tagName.slice(1)), text };
  });

  if (tocPanel instanceof HTMLElement && toc instanceof HTMLElement) {
    if (headings.length >= 2) {
      tocPanel.hidden = false;
      toc.replaceChildren(
        ...headings.map((h) => {
          const a = document.createElement("a");
          a.className = `writeup-toc-link level-${h.level}`;
          a.href = `#${h.id}`;
          a.textContent = h.text;
          return a;
        })
      );
    } else {
      tocPanel.hidden = true;
      toc.replaceChildren();
    }
  }

  // Highlight before wrapping so the injected <span>s are already in place; the
  // copy handler reads textContent, so the clipboard still gets clean source.
  highlightAllIn(body);
  // Sentinels survive highlighting, so materialize them into reveal buttons now;
  // then run the prose auto-detect safety net (which skips <pre>).
  materializeSpoilers(body);
  redactFlagsInBody(body);

  body.querySelectorAll("pre").forEach((pre) => {
    if (pre.parentElement?.classList.contains("writeup-code-main")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "writeup-code-block";
    pre.parentNode?.insertBefore(wrapper, pre);

    // Header bar: language label on the left, copy button on the right. The
    // language span is emitted inside the <pre> by renderMarkdown; lift its text
    // up into the bar (leaving the code area clean) and drop the original.
    const langSpan = pre.querySelector(".bt-code-lang");
    const language = langSpan?.textContent?.trim() || "";
    langSpan?.remove();

    const header = document.createElement("div");
    header.className = "writeup-code-header";

    const langLabel = document.createElement("span");
    langLabel.className = "writeup-code-lang";
    langLabel.textContent = language; // empty for untagged blocks — bar still holds the copy button
    header.append(langLabel);

    const btn = document.createElement("button");
    btn.className = "writeup-code-copy";
    btn.type = "button";
    btn.append(createCopyIcon());
    const btnLabel = document.createElement("span");
    btnLabel.className = "writeup-code-copy-label";
    btnLabel.textContent = "Copy";
    btn.append(btnLabel);
    btn.addEventListener("click", async () => {
      const value = pre.querySelector("code")?.textContent || pre.textContent || "";
      // Pass the label span (not the button) so the icon survives the swap.
      await copyTextToClipboard(value.trim(), btnLabel, "Copy");
    });
    header.append(btn);

    // Code area: the gutter (multi-line only) and the pre sit in one flex row.
    const main = document.createElement("div");
    main.className = "writeup-code-main";

    // Line-number gutter for multi-line blocks. A separate aria-hidden element
    // so the numbers never reach the clipboard and multi-line highlight tokens
    // stay intact. Appended before the pre so it sits to its left in the row.
    const code = pre.querySelector("code");
    const lineCount = (code?.textContent ?? pre.textContent ?? "").replace(/\n$/, "").split("\n").length;
    if (lineCount >= 2) {
      main.classList.add("has-line-numbers");
      const gutter = document.createElement("span");
      gutter.className = "writeup-code-gutter";
      gutter.setAttribute("aria-hidden", "true");
      gutter.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");
      main.append(gutter);
    }
    main.append(pre);

    wrapper.append(header, main);
  });
};
