import { updateMetric } from "./utils.js?v=276fa973";
import { renderMarkdown, enhanceMarkdownBody, copyTextToClipboard } from "./markdown.js?v=276fa973-th";
import { roomCardHtml } from "./room-card.js?v=rc7";
import { stripWriteupHeader, takeChallengePrompt } from "./writeup-header.js?v=wh2";
import { osIcon, isBlankOs } from "./os-icons.js?v=os1";
import { categoryIcon } from "./challenge-icons.js?v=ci1";

const state = {
  activeWriteupPath: "",
  githubConfig: null,
  portfolio: null,
  writeupsByPath: new Map(),
  allWriteups: [],
  filteredWriteups: [],
  writeupSources: [],
  query: "",
  // Landing view state: the page opens on a filterable card gallery; opening
  // a card swaps to the docs-shell reader (see the view-switching section).
  view: "gallery",
  galleryPlatform: "all",
  galleryDifficulty: "all",
  gallerySort: "newest"
};

// --- Utility helpers ---

const titleizeFileName = (fileName) =>
  fileName
    .replace(/\.md$/i, "")
    .replace(/^(htb|thm|ctf)-/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const titleizePathSegment = (segment) => {
  if (/^[A-Z0-9]+$/.test(segment)) return segment;
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

const detectWriteupLabel = (fileName, fallbackLabel) => {
  if (/^htb-/i.test(fileName)) return "Hack The Box";
  if (/^thm-/i.test(fileName)) return "TryHackMe";
  if (/^ctf-/i.test(fileName)) return "CTF";
  return fallbackLabel;
};

const normalizeTags = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  return [];
};

const formatDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// Parses sanitised Markdown HTML into a DocumentFragment — avoids innerHTML on a live node
const htmlToFragment = (html) => document.createRange().createContextualFragment(html);


// --- Writeup cache helpers ---

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const WRITEUP_CACHE_PREFIX = "ws-writeup-v2-";

const readWriteupCache = (key) => {
  try {
    const raw = localStorage.getItem(`${WRITEUP_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.timestamp !== "number" || Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
};

const writeWriteupCache = (key, data) => {
  try {
    localStorage.setItem(`${WRITEUP_CACHE_PREFIX}${key}`, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // localStorage may be full — silently skip caching
  }
};

const removeWriteupCache = (key) => {
  try {
    localStorage.removeItem(`${WRITEUP_CACHE_PREFIX}${key}`);
  } catch {
    // Ignore storage access errors.
  }
};

// --- GitHub API helpers ---

const encodeRepoPath = (path) => path.split("/").map(encodeURIComponent).join("/");

const getRepoConfig = (portfolio) => {
  const { owner, repo, branch, autoDetectGithubPages } = portfolio.github;
  if (owner && repo) return { owner, repo, branch };
  if (autoDetectGithubPages && window.location.hostname.endsWith(".github.io")) {
    const detectedOwner = window.location.hostname.split(".")[0];
    return { owner: detectedOwner, repo: `${detectedOwner}.github.io`, branch };
  }
  return null;
};

const getTreeApiUrl = (config) =>
  `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees/${encodeURIComponent(config.branch)}?recursive=1`;

const getRawUrl = (config, path) =>
  `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch)}/${encodeRepoPath(path)}`;

const getHtmlUrl = (config, path) =>
  `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/blob/${encodeURIComponent(config.branch)}/${encodeRepoPath(path)}`;

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch markdown file (${response.status}).`);
  return response.text();
};

const repoTreePromises = new Map();

const fetchRecursiveTree = async (config) => {
  const cacheKey = `${config.owner}/${config.repo}/${config.branch}`;
  if (!repoTreePromises.has(cacheKey)) {
    repoTreePromises.set(
      cacheKey,
      fetchJson(getTreeApiUrl(config)).then((data) => {
        if (data.truncated) throw new Error("GitHub API returned a truncated tree.");
        if (!Array.isArray(data.tree)) throw new Error("GitHub API returned an invalid tree.");
        return data.tree;
      }).catch((error) => {
        repoTreePromises.delete(cacheKey);
        throw error;
      })
    );
  }
  return repoTreePromises.get(cacheKey);
};

const pathSegments = (path) => path.split("/").filter(Boolean);

const fileNameFromPath = (path) => pathSegments(path).at(-1) || path;

const isVisibleSegment = (segment) => {
  const normalized = segment.toLowerCase();
  return !segment.startsWith(".") && !segment.startsWith("_") && normalized !== "hidden";
};

const isVisibleMarkdownPath = (path) => {
  const segments = pathSegments(path);
  const fileName = segments.at(-1) || "";
  return /\.md$/i.test(fileName) && segments.every(isVisibleSegment);
};

const isUnderFolder = (path, folderPath) => path.startsWith(`${folderPath.replace(/\/+$/, "")}/`);

const toMarkdownFile = (entry, config) => ({
  name: fileNameFromPath(entry.path),
  path: entry.path,
  download_url: getRawUrl(config, entry.path),
  html_url: getHtmlUrl(config, entry.path)
});

const filesForFolder = (tree, folder, config) =>
  tree
    .filter((entry) => entry.type === "blob" && isUnderFolder(entry.path, folder.path) && isVisibleMarkdownPath(entry.path))
    .map((entry) => toMarkdownFile(entry, config))
    .sort((left, right) => left.path.localeCompare(right.path));

// --- Baked listing index ---
// Built by .github/workflows/content-index.yml into /writeups/index.json so
// browsing doesn't depend on the rate-limited GitHub API. Fetched once per
// page load; when absent or stale the live API path below still works.

let bakedIndexPromise = null;

const fetchBakedIndex = () => {
  // no-cache: always revalidate so a freshly rebuilt index (i.e. newly pushed
  // writeups) is picked up promptly instead of served stale from the browser
  // or CDN cache.
  bakedIndexPromise ??= fetch("/writeups/index.json", { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return bakedIndexPromise;
};

// Folder list is auto-discovered from the baked index (any top-level folder
// in the writeups repo becomes a platform section, so adding one needs no
// site edit); portfolio.writeupFolders is only the offline/no-network fallback.
const resolveWriteupFolders = async (portfolio) => {
  const baked = await fetchBakedIndex();
  if (Array.isArray(baked?.foldersMeta) && baked.foldersMeta.length) return baked.foldersMeta;
  return portfolio.writeupFolders;
};

// --- Markdown rendering ---

const normalizeRepoPath = (sourcePath, targetPath) => {
  if (/^(https?:|mailto:|data:|#)/i.test(targetPath)) return targetPath;
  if (targetPath.startsWith("/")) return targetPath.slice(1);
  const segments = sourcePath.split("/");
  segments.pop();
  targetPath.split("/").forEach((segment) => {
    if (!segment || segment === ".") return;
    if (segment === "..") { segments.pop(); return; }
    segments.push(segment);
  });
  return segments.join("/");
};

const resolveMarkdownLink = (href, context) => {
  const repoPath = normalizeRepoPath(context.path, href);
  if (/^(https?:|mailto:|data:|#)/i.test(repoPath)) return repoPath;
  return getRawUrl(context.githubConfig, repoPath);
};

// --- Front-matter parsing ---

const parseFrontMatter = (markdown) => {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: markdown };

  const metadata = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator === -1) return;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!key) return;
    metadata[key] = key.toLowerCase() === "tags" ? normalizeTags(rawValue) : rawValue.replace(/^['"]|['"]$/g, "");
  });

  return { metadata, body: markdown.slice(match[0].length) };
};

const extractTitleFromBody = (body, fallbackName) => {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : titleizeFileName(fallbackName);
};

const extractSummaryFromBody = (body) => {
  const withoutCode = body.replace(/```[\s\S]*?```/g, "");
  const blocks = withoutCode.split(/\r?\n\r?\n+/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    if (
      block.startsWith("#") ||
      block.startsWith(">") ||
      block.startsWith("- ") ||
      block.startsWith("* ") ||
      /^\d+\.\s/.test(block)
    ) continue;
    return block.replace(/\r?\n/g, " ");
  }

  return "Markdown writeup ready to be expanded with a short summary.";
};

// --- Tree sidebar ---

const setGroupState = (container, message, type = "status", onRetry = null) => {
  const wrapper = document.createElement("div");
  wrapper.className = "writeup-state-block";
  const p = document.createElement("p");
  p.className = type === "error" ? "writeup-error" : "writeup-status";
  p.textContent = message;
  wrapper.append(p);
  if (type === "error" && typeof onRetry === "function") {
    const retryBtn = document.createElement("button");
    retryBtn.className = "action secondary writeup-retry-button";
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", onRetry);
    wrapper.append(retryBtn);
  }
  container.replaceChildren(wrapper);
};

// --- Writeup picker ---
// The reader's archive is a grid of room artwork, one group per platform.
// Every tile is dimmed except the open writeup and whichever one is under the
// pointer or keyboard focus (see .writeup-picker in styles.css).
const createPickerGroup = (folder, itemCount) => {
  const group = document.createElement("div");
  group.className = "writeup-picker-group";
  group.dataset.folderKey = folder.key;

  const label = document.createElement("p");
  label.className = "writeup-picker-label";
  label.textContent = folder.label;
  const count = document.createElement("span");
  count.textContent = String(itemCount);
  label.append(count);

  const list = document.createElement("ul");
  list.className = "writeup-picker-grid";
  list.setAttribute("aria-label", folder.label);

  group.append(label, list);
  return group;
};

const structurePartsForWriteup = (writeup) => pathSegments(writeup.path).slice(1, -1);

const createStructureNode = ({ key = "", label = "" } = {}) => ({
  key,
  label,
  writeups: [],
  children: new Map()
});

const buildWriteupStructure = (writeups) => {
  const root = createStructureNode();
  for (const writeup of writeups) {
    let node = root;
    const parts = structurePartsForWriteup(writeup);
    parts.forEach((part, index) => {
      const key = `${writeup.folderKey}:${parts.slice(0, index + 1).join("/")}`;
      if (!node.children.has(part)) {
        node.children.set(part, createStructureNode({ key, label: titleizePathSegment(part) }));
      }
      node = node.children.get(part);
    });
    node.writeups.push(writeup);
  }
  return root;
};

const sortedStructureChildren = (node) =>
  Array.from(node.children.values()).sort((left, right) => left.label.localeCompare(right.label));


const flattenWriteupStructure = (node) => [
  ...node.writeups,
  ...sortedStructureChildren(node).flatMap((child) => flattenWriteupStructure(child))
];

const createPickerTile = (writeup) => {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.className = "writeup-tile";
  button.type = "button";
  button.dataset.writeupPath = writeup.path;
  if (writeup.difficulty) button.dataset.difficulty = writeup.difficulty;
  const difficulty = writeup.difficulty ? writeup.difficulty.charAt(0).toUpperCase() + writeup.difficulty.slice(1) : "";
  button.dataset.caption = [writeup.title, difficulty, writeup.folderLabel].filter(Boolean).join(" · ");
  button.setAttribute("aria-label", [writeup.title, difficulty, writeup.folderLabel].filter(Boolean).join(", "));
  if (writeup.path === state.activeWriteupPath) {
    button.classList.add("is-active");
    button.setAttribute("aria-current", "true");
  }

  const room = writeup.room || {};
  const iconSrc = /^\/(?!\/)/.test(room.iconSrc || "") ? room.iconSrc : "";
  if (iconSrc) {
    const img = document.createElement("img");
    img.src = iconSrc;
    img.alt = "";
    img.width = 56;
    img.height = 56;
    img.loading = "lazy";
    img.decoding = "async";
    button.append(img);
  } else {
    // Trusted static SVG: the challenge category for an event, else the platform mark
    const mark = document.createElement("span");
    mark.className = "writeup-tile-mark";
    mark.append(htmlToFragment(room.platform === "event"
      ? categoryIcon(room.category)
      : PLATFORM_LOGOS[writeup.folderKey] || PLATFORM_LOGOS.default));
    button.append(mark);
  }
  // Event challenges share their event's artwork, so a category mark tells them apart
  if (iconSrc && room.platform === "event") {
    const badge = document.createElement("span");
    badge.className = "writeup-tile-badge";
    badge.append(htmlToFragment(categoryIcon(room.category)));
    button.append(badge);
  }

  item.append(button);
  return item;
};

const writeupMatchesQuery = (writeup) => {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = [writeup.title, writeup.summary, writeup.path, writeup.folderLabel, ...writeup.tags].join(" ").toLowerCase();
  return haystack.includes(query);
};

const updateWriteupFilterCount = () => {
  const count = document.getElementById("writeup-filter-count");
  if (!(count instanceof HTMLElement)) return;
  const total = state.allWriteups.length;
  const visible = state.filteredWriteups.length;
  if (!total) { count.textContent = "No writeups loaded"; return; }
  count.textContent = visible === total ? `${total} writeups` : `${visible} of ${total} writeups`;
};

// The caption under the picker names the tile under the pointer or focus,
// and otherwise the open writeup (decorative: each tile has its own label).
const setPickerCaption = (tile) => {
  const caption = document.getElementById("writeup-picker-caption");
  if (!caption) return;
  const shown = tile || document.querySelector(".writeup-tile.is-active");
  caption.textContent = shown?.dataset.caption || "";
};

// The picker is one Tab stop (roving tabindex): Tab lands on the open
// writeup's tile, or the first, and the arrow keys, Home and End move
// between tiles; Enter or Space opens one.
const pickerTiles = () => [...document.querySelectorAll(".writeup-tile")];

const setPickerTabStop = (tile) => {
  pickerTiles().forEach((button) => { button.tabIndex = button === tile ? 0 : -1; });
};

const syncPickerTabStop = () => {
  const tiles = pickerTiles();
  setPickerTabStop(tiles.find((button) => button.classList.contains("is-active")) || tiles[0]);
};

// Nearest tile in the next row up or down, by horizontal distance
const tileInNextRow = (tiles, from, direction) => {
  const box = from.getBoundingClientRect();
  const rows = tiles
    .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
    .filter(({ box: other }) => (direction > 0 ? other.top > box.bottom - 4 : other.bottom < box.top + 4));
  if (!rows.length) return null;
  const rowTop = direction > 0 ? Math.min(...rows.map((r) => r.box.top)) : Math.max(...rows.map((r) => r.box.top));
  return rows
    .filter((r) => Math.abs(r.box.top - rowTop) < 4)
    .sort((a, b) => Math.abs(a.box.left - box.left) - Math.abs(b.box.left - box.left))[0].tile;
};

const movePickerFocus = (event) => {
  const from = event.target instanceof Element ? event.target.closest(".writeup-tile") : null;
  if (!from) return;
  const tiles = pickerTiles();
  const index = tiles.indexOf(from);
  let to = null;
  if (event.key === "ArrowRight") to = tiles[index + 1];
  else if (event.key === "ArrowLeft") to = tiles[index - 1];
  else if (event.key === "ArrowDown") to = tileInNextRow(tiles, from, 1);
  else if (event.key === "ArrowUp") to = tileInNextRow(tiles, from, -1);
  else if (event.key === "Home") to = tiles[0];
  else if (event.key === "End") to = tiles[tiles.length - 1];
  else return;
  event.preventDefault();
  if (!to) return;
  setPickerTabStop(to);
  to.focus();
};

const updateActiveTreeItem = () => {
  document.querySelectorAll(".writeup-tile").forEach((button) => {
    const active = button.dataset.writeupPath === state.activeWriteupPath;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  syncPickerTabStop();
  setPickerCaption();
};

const writeupsInDisplayOrder = (writeups) => flattenWriteupStructure(buildWriteupStructure(writeups));

const renderWriteupTree = () => {
  const treeRoot = document.getElementById("writeup-tree");
  if (!(treeRoot instanceof HTMLElement)) return;

  treeRoot.replaceChildren();

  // When every group failed (typically one offline GitHub call behind all of
  // them), show a single quiet notice instead of repeating the error per group.
  const allErrored =
    state.writeupSources.length > 1 &&
    state.writeupSources.every((source) => source.error && !source.error.includes("Nothing here yet"));
  if (allErrored) {
    const retryAll = () => {
      if (state.githubConfig) {
        state.writeupSources.forEach((source) => {
          const cacheKey = `${state.githubConfig.owner}/${state.githubConfig.repo}/${source.folder.path}`;
          removeWriteupCache(cacheKey);
        });
      }
      if (state.portfolio) void loadRepositoryWriteups(state.portfolio);
    };
    setGroupState(treeRoot, "The archive couldn't be loaded right now. It lives on GitHub, so this is usually a connection hiccup.", "error", retryAll);
    return;
  }

  state.writeupSources.forEach((source) => {
    const filtered = source.writeups.filter(writeupMatchesQuery);
    const group = createPickerGroup(source.folder, filtered.length);
    const list = group.querySelector(".writeup-picker-grid");
    treeRoot.append(group);

    if (!(list instanceof HTMLElement)) return;

    if (source.error) {
      const retryHandler = source.error.includes("Nothing here yet") ? null : () => {
        if (state.githubConfig) {
          const cacheKey = `${state.githubConfig.owner}/${state.githubConfig.repo}/${source.folder.path}`;
          removeWriteupCache(cacheKey);
        }
        if (state.portfolio) void loadRepositoryWriteups(state.portfolio);
      };
      setGroupState(list, source.error, "error", retryHandler);
      return;
    }
    if (!source.writeups.length) { setGroupState(list, "Nothing here yet!"); return; }
    if (!filtered.length) { setGroupState(list, "No matches."); return; }

    writeupsInDisplayOrder(filtered).forEach((writeup) => list.append(createPickerTile(writeup)));
  });
  syncPickerTabStop();
};

const renderWriteupSkeleton = () => {
  const treeRoot = document.getElementById("writeup-tree");
  if (!(treeRoot instanceof HTMLElement)) return;

  treeRoot.replaceChildren();
  const grid = document.createElement("div");
  grid.className = "writeup-picker-grid";
  for (let i = 0; i < 12; i++) {
    const tile = document.createElement("div");
    tile.className = "writeup-tile-skeleton";
    grid.append(tile);
  }
  treeRoot.append(grid);
};

// --- Reader pane ---

const renderEmptyWriteupViewer = (title, message = "") => {
  const viewer = document.getElementById("writeup-viewer");
  if (!viewer) return;

  const wrapper = document.createElement("div");
  wrapper.className = "writeup-viewer-empty";
  const inner = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = title;
  inner.append(heading);
  if (message) {
    const p = document.createElement("p");
    p.textContent = message;
    inner.append(p);
  }
  wrapper.append(inner);
  viewer.classList.remove("has-rail");
  viewer.replaceChildren(wrapper);
};

// Baked records don't carry a body (see buildBakedWriteupRecord) so it's
// fetched on first open and cached on the record for instant revisits within
// the session (a full reload re-fetches — the localStorage listing cache only
// covers the lightweight tree/meta fields, not full markdown bodies).
const loadWriteupBody = async (writeup) => {
  if (writeup.bodyLoaded) return writeup.body;
  const markdown = await fetchText(writeup.rawUrl);
  const { body } = parseFrontMatter(markdown);
  writeup.body = body;
  writeup.bodyLoaded = true;
  return body;
};

const showWriteupBodyLoading = (body) => {
  body.replaceChildren();
  const p = document.createElement("p");
  p.className = "writeup-status";
  p.textContent = "Loading writeup…";
  body.append(p);
};

const showWriteupBodyError = (body, retry) => {
  body.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "writeup-state-block";
  const p = document.createElement("p");
  p.className = "writeup-error";
  p.textContent = "Couldn't load this writeup's contents.";
  wrapper.append(p);
  const retryBtn = document.createElement("button");
  retryBtn.className = "action secondary writeup-retry-button";
  retryBtn.type = "button";
  retryBtn.textContent = "Retry";
  retryBtn.addEventListener("click", retry);
  wrapper.append(retryBtn);
  body.append(wrapper);
};

const renderWriteupBody = (body, writeup, tocPanel, toc) => {
  // Rendered markdown is assembled from controlled templates + escapeHtml()-sanitised user text
  body.replaceChildren(
    htmlToFragment(
      // with an info card, its name stands in for the writeup's own title
      // an event card carries the challenge prompt, so it leaves the body
      renderMarkdown(stripWriteupHeader(writeup.room?.challenge ? takeChallengePrompt(writeup.body).body : writeup.body, { dropTitle: Boolean(writeup.room) }), {
        resolveLink: (href) => resolveMarkdownLink(href, { path: writeup.path, githubConfig: state.githubConfig }),
        headingOffset: 1
      })
    )
  );
  enhanceMarkdownBody(body, { tocPanel, toc });
  // Room/machine info card (baked into index.json from writeups/meta/), added
  // after the markdown is enhanced so its heading stays out of the contents.
  // roomCardHtml escapes every value it takes from the data.
  if (writeup.room) body.prepend(htmlToFragment(roomCardHtml(writeup.room, { os: writeup.os })));
};

const syncWriteupUrl = (writeup) => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("path", writeup.path);
    window.history.replaceState({}, "", url);
  } catch {
    // history API unavailable — deep links just won't update
  }
};

// --- Box Info side panel ---
// Generic monochrome platform marks (a hexagon, a shield, a flag) drawn in
// currentColor — not the official brand logos. Drop official SVGs under /src
// and swap them in here if exact branding is wanted.
const PLATFORM_LOGOS = {
  htb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.4 20 7v10l-8 4.6L4 17V7z"/><path d="m12 7 4 2.3v4.6L12 16.2 8 13.9V9.3z"/></svg>',
  thm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.4 4 5.4v6.1c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5.4z"/><path d="m8.6 12 2.3 2.3 4.5-4.6"/></svg>',
  ctf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 21V3"/><path d="M5.5 4h11l-2.2 3 2.2 3h-11"/></svg>',
  // Auto-discovered folders (any platform not in the map above) get this plain
  // hexagon outline so Box Info always shows a mark, never a blank slot.
  default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.4 20 7v10l-8 4.6L4 17V7z"/></svg>'
};

// Official platform logos, self-hosted under /src. When the file is present it
// renders as a small tile; if it's missing the generic mark above is shown
// instead. (CTF has no brand, so it keeps the generic flag.)
const PLATFORM_LOGO_SRC = {
  htb: "/src/logo-htb.png",
  thm: "/src/logo-thm.jpg"
};

const appendMetaRow = (list, term, value) => {
  if (value == null || value === "") return;
  const row = document.createElement("div");
  row.className = "meta-row";
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (value instanceof Node) dd.append(value);
  else dd.textContent = value;
  row.append(dt, dd);
  list.append(row);
};

const buildMetaPanel = (writeup) => {
  const panel = document.createElement("section");
  panel.className = "writeup-meta-panel";
  panel.setAttribute("aria-label", "Box info");

  const label = document.createElement("p");
  label.className = "tool-label";
  label.textContent = "Box Info";
  panel.append(label);

  const platform = document.createElement("div");
  platform.className = "meta-platform";
  const fallbackLogo = PLATFORM_LOGOS[writeup.folderKey] || PLATFORM_LOGOS.default;
  const logoSrc = PLATFORM_LOGO_SRC[writeup.folderKey];
  if (fallbackLogo || logoSrc) {
    const logoWrap = document.createElement("span");
    logoWrap.className = "meta-platform-logo";
    // Trusted static SVG — createContextualFragment avoids innerHTML on a live node
    const useFallback = () => {
      logoWrap.classList.remove("has-image");
      if (fallbackLogo) logoWrap.replaceChildren(htmlToFragment(fallbackLogo));
    };
    if (logoSrc) {
      const img = document.createElement("img");
      img.className = "meta-platform-logo-img";
      img.src = logoSrc;
      img.alt = `${writeup.folderLabel} logo`;
      img.loading = "lazy";
      // Missing/blocked file → quietly drop back to the generic mark.
      img.addEventListener("error", useFallback, { once: true });
      logoWrap.classList.add("has-image");
      logoWrap.append(img);
    } else {
      useFallback();
    }
    platform.append(logoWrap);
  }
  const name = document.createElement("span");
  name.className = "meta-platform-name";
  name.textContent = writeup.folderLabel;
  platform.append(name);
  panel.append(platform);

  const list = document.createElement("dl");
  list.className = "meta-list";
  if (["easy", "medium", "hard"].includes(writeup.difficulty)) {
    const chip = document.createElement("span");
    chip.className = `tree-chip difficulty-chip difficulty-${writeup.difficulty}`;
    chip.textContent = writeup.difficulty;
    appendMetaRow(list, "Difficulty", chip);
  }
  if (writeup.os && !isBlankOs(writeup.os)) {
    const os = document.createElement("span");
    os.className = "meta-os";
    // osIcon is a fixed SVG from js/os-icons.js; the OS text goes in as text
    os.append(htmlToFragment(osIcon(writeup.os)), document.createTextNode(writeup.os));
    appendMetaRow(list, "OS", os);
  }
  appendMetaRow(list, "Published", writeup.displayDate);
  if (writeup.readingTimeMin) appendMetaRow(list, "Read time", `${writeup.readingTimeMin} min`);
  if (list.childElementCount) panel.append(list);

  if (writeup.tags.length) {
    const tagsLabel = document.createElement("p");
    tagsLabel.className = "tool-label meta-tags-label";
    tagsLabel.textContent = "Tags";
    const tags = document.createElement("div");
    tags.className = "meta-tags";
    writeup.tags.forEach((tag) => {
      const span = document.createElement("span");
      span.textContent = tag;
      tags.append(span);
    });
    panel.append(tagsLabel, tags);
  }

  if (/^https?:\/\//i.test(writeup.roomUrl)) {
    const link = document.createElement("a");
    link.className = "action secondary meta-room-link";
    link.href = writeup.roomUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `Open on ${writeup.folderLabel}`;
    panel.append(link);
  }

  const sources = document.createElement("div");
  sources.className = "meta-source-links";
  const gh = document.createElement("a");
  gh.href = writeup.sourceUrl;
  gh.target = "_blank";
  gh.rel = "noreferrer";
  gh.textContent = "View source";
  const raw = document.createElement("a");
  raw.href = writeup.rawUrl;
  raw.target = "_blank";
  raw.rel = "noreferrer";
  raw.textContent = "Raw markdown";
  const permalink = document.createElement("button");
  permalink.type = "button";
  permalink.className = "meta-permalink";
  permalink.textContent = "Copy link";
  permalink.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("path", writeup.path);
    void copyTextToClipboard(url.toString(), permalink, "Copy link");
  });
  sources.append(gh, raw, permalink);
  panel.append(sources);

  return panel;
};

// --- Reading aids: TOC scroll-spy + progress hairline ---
// The reader scrolls with the window (the rail is window-sticky). One
// permanent rAF-throttled scroll/resize listener (registered in initWriteups)
// reads module-level state that setupReadingAids swaps in per writeup and
// teardownReadingAids clears; the progress element is a lazily created
// singleton that is only ever hidden, so no listener or node can be stranded
// by re-renders.

let readingAids = null; // { body, headings, tocLinks } for the open writeup
let progressElement = null;
let readingAidsFrame = 0;

const ensureProgressElement = () => {
  if (progressElement) return progressElement;
  progressElement = document.createElement("div");
  progressElement.className = "writeup-progress";
  progressElement.setAttribute("aria-hidden", "true");
  const bar = document.createElement("div");
  bar.className = "writeup-progress-bar";
  progressElement.append(bar);
  document.body.append(progressElement);
  return progressElement;
};

const updateReadingAids = () => {
  readingAidsFrame = 0;
  if (!readingAids) return;
  const { body, headings, tocLinks } = readingAids;

  // Reading line: just below the sticky header, where the eye starts.
  const header = document.querySelector(".site-header");
  const line = (header instanceof HTMLElement ? header.offsetHeight : 88) + 32;

  if (headings.length) {
    let currentId = headings[0].id;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= line) currentId = heading.id;
      else break;
    }
    tocLinks.forEach((link, id) => link.classList.toggle("is-active", id === currentId));
  }

  const bar = progressElement && !progressElement.hidden ? progressElement.firstElementChild : null;
  if (bar instanceof HTMLElement) {
    const rect = body.getBoundingClientRect();
    const total = rect.height - (window.innerHeight - line);
    const read = total > 0 ? Math.min(1, Math.max(0, (line - rect.top) / total)) : 1;
    bar.style.transform = `scaleX(${read})`;
  }
};

const scheduleReadingAidsUpdate = () => {
  if (readingAidsFrame || !readingAids) return;
  readingAidsFrame = window.requestAnimationFrame(updateReadingAids);
};

const teardownReadingAids = () => {
  readingAids = null;
  if (progressElement) progressElement.hidden = true;
};

const setupReadingAids = (body, tocNav) => {
  const tocLinks = new Map();
  tocNav.querySelectorAll("a.writeup-toc-link[href^='#']").forEach((link) => {
    const id = (link.getAttribute("href") || "").slice(1);
    if (id) tocLinks.set(id, link);
  });
  const headings = [...body.querySelectorAll("h1[id], h2[id], h3[id], h4[id]")].filter((heading) =>
    tocLinks.has(heading.id)
  );

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (progressElement) progressElement.hidden = true;
  } else {
    ensureProgressElement().hidden = false;
  }

  readingAids = { body, headings, tocLinks };
  updateReadingAids();
};

const renderWriteup = (writeup, options = {}) => {
  const viewer = document.getElementById("writeup-viewer");
  if (!viewer) return;

  state.activeWriteupPath = writeup.path;
  updateActiveTreeItem();
  syncWriteupUrl(writeup);

  const activeIndex = state.filteredWriteups.findIndex((e) => e.path === writeup.path);
  const previousWriteup = activeIndex > 0 ? state.filteredWriteups[activeIndex - 1] : null;
  const nextWriteup =
    activeIndex >= 0 && activeIndex < state.filteredWriteups.length - 1
      ? state.filteredWriteups[activeIndex + 1]
      : null;

  const tocPanel = document.createElement("section");
  tocPanel.className = "writeup-toc-panel";
  tocPanel.hidden = true;
  const tocLabel = document.createElement("p");
  tocLabel.className = "tool-label";
  tocLabel.textContent = "On This Page";
  const tocNav = document.createElement("nav");
  tocNav.className = "writeup-toc";
  tocNav.id = "writeup-toc";
  tocNav.setAttribute("aria-label", "Writeup table of contents");
  tocPanel.append(tocLabel, tocNav);

  const body = document.createElement("div");
  body.className = "writeup-viewer-body markdown-body";

  const makePrevNextBtn = (target, directionLabel, emptyLabel) => {
    const btn = document.createElement("button");
    btn.className = "action secondary writeup-nav-button";
    btn.type = "button";
    if (target) {
      btn.setAttribute("data-writeup-path", target.path);
      btn.addEventListener("click", () => renderWriteup(target, { focusHeading: true }));
    } else {
      btn.disabled = true;
    }
    const direction = document.createElement("span");
    direction.className = "writeup-nav-direction";
    direction.textContent = directionLabel;
    const title = document.createElement("span");
    title.className = "writeup-nav-title";
    title.textContent = target ? target.title : emptyLabel;
    btn.append(direction, title);
    return btn;
  };

  const pagination = document.createElement("div");
  pagination.className = "writeup-viewer-pagination";
  pagination.append(
    makePrevNextBtn(previousWriteup, "Previous", "Start of list"),
    makePrevNextBtn(nextWriteup, "Next", "End of list")
  );

  const footer = document.createElement("div");
  footer.className = "writeup-viewer-footer";
  footer.append(pagination);

  const rail = document.createElement("aside");
  rail.className = "writeup-rail";
  rail.append(buildMetaPanel(writeup), tocPanel);

  viewer.classList.add("has-rail");
  viewer.replaceChildren(rail, body, footer);

  const focusReaderAfterRender = () => {
    if (!options.focusHeading) return;
    // Move keyboard focus to the writeup's first heading so screen-reader users
    // hear the new content from the top.
    const focusTarget = body.querySelector("h1, h2, h3, h4") || body;
    focusTarget.tabIndex = -1;
    window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    // The reader sits below the picker: bring its top into view if it isn't
    const top = viewer.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) viewer.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (writeup.bodyLoaded) {
    renderWriteupBody(body, writeup, tocPanel, tocNav);
    setupReadingAids(body, tocNav);
    focusReaderAfterRender();
    return;
  }

  // Baked records defer the raw-markdown fetch until the writeup is actually
  // opened (see buildBakedWriteupRecord) — show a loading state, then swap in
  // the rendered body. Guarded against the user clicking elsewhere meanwhile.
  teardownReadingAids();
  showWriteupBodyLoading(body);
  loadWriteupBody(writeup)
    .then(() => {
      if (state.activeWriteupPath !== writeup.path) return;
      renderWriteupBody(body, writeup, tocPanel, tocNav);
      setupReadingAids(body, tocNav);
      focusReaderAfterRender();
    })
    .catch(() => {
      if (state.activeWriteupPath !== writeup.path) return;
      showWriteupBodyError(body, () => renderWriteup(writeup, options));
    });
};

// --- Card gallery (landing view) ---
// Built from the same records as the tree; the text query (state.query) is
// shared between both views, while platform/difficulty/sort apply to the
// gallery only. Opening a card pushes ?path= and swaps to the reader.

const GALLERY_DIFFICULTIES = ["easy", "medium", "hard"];

const gallerySortComparators = {
  // Delegate lazily — sortWriteups is declared further down the module.
  newest: (left, right) => sortWriteups(left, right),
  oldest: (left, right) => {
    if (left.sortDate && right.sortDate && left.sortDate !== right.sortDate) {
      return left.sortDate.localeCompare(right.sortDate);
    }
    if (left.sortDate && !right.sortDate) return -1;
    if (!left.sortDate && right.sortDate) return 1;
    return left.title.localeCompare(right.title);
  },
  title: (left, right) => left.title.localeCompare(right.title)
};

const writeupMatchesGalleryFilters = (writeup) =>
  writeupMatchesQuery(writeup) &&
  (state.galleryPlatform === "all" || writeup.folderKey === state.galleryPlatform) &&
  (state.galleryDifficulty === "all" || writeup.difficulty === state.galleryDifficulty);

const galleryWriteups = () =>
  state.allWriteups
    .filter(writeupMatchesGalleryFilters)
    .sort(gallerySortComparators[state.gallerySort] || sortWriteups);

const updateGalleryCount = (visible) => {
  const count = document.getElementById("writeup-gallery-count");
  if (!(count instanceof HTMLElement)) return;
  const total = state.allWriteups.length;
  if (!total) { count.textContent = "No writeups loaded"; return; }
  count.textContent = visible === total ? `${total} writeups` : `${visible} of ${total} writeups`;
};

const createWriteupCard = (writeup) => {
  const card = document.createElement("a");
  card.className = "writeup-card";
  // Crawlable static article URL; same-tab clicks still open the in-page
  // reader below. Falls back to the ?path= view if the static URL is absent.
  card.href = writeup.url || `/writeups/?path=${encodeURIComponent(writeup.path)}`;
  card.addEventListener("click", (event) => {
    // Modified clicks (open in new tab etc.) fall through to the real link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openWriteupFromGallery(writeup);
  });

  const head = document.createElement("span");
  head.className = "writeup-card-head";
  const kicker = document.createElement("span");
  kicker.className = "writeup-card-kicker";
  kicker.textContent = writeup.folderLabel;
  head.append(kicker);
  if (GALLERY_DIFFICULTIES.includes(writeup.difficulty)) {
    const chip = document.createElement("span");
    chip.className = `tree-chip difficulty-chip difficulty-${writeup.difficulty}`;
    chip.textContent = writeup.difficulty;
    head.append(chip);
  }
  card.append(head);

  const title = document.createElement("strong");
  title.textContent = writeup.title;
  card.append(title);

  if (writeup.summary) {
    const summary = document.createElement("p");
    summary.textContent = writeup.summary;
    card.append(summary);
  }

  const metaParts = [
    writeup.displayDate,
    writeup.readingTimeMin ? `${writeup.readingTimeMin} min read` : "",
    isBlankOs(writeup.os) ? "" : writeup.os
  ].filter(Boolean);
  if (metaParts.length) {
    const meta = document.createElement("span");
    meta.className = "writeup-card-meta";
    meta.textContent = metaParts.join(" · ");
    card.append(meta);
  }

  return card;
};

const clearGalleryFilters = () => {
  state.query = "";
  state.galleryPlatform = "all";
  state.galleryDifficulty = "all";
  syncSearchInputs();
  updateGalleryFilterButtons();
  applyWriteupFilters();
};

const renderGallery = () => {
  const grid = document.getElementById("writeup-gallery-grid");
  if (!(grid instanceof HTMLElement)) return;

  const writeups = galleryWriteups();
  updateGalleryCount(writeups.length);

  if (!writeups.length) {
    const wrapper = document.createElement("div");
    wrapper.className = "writeup-gallery-empty";
    const p = document.createElement("p");
    p.textContent = state.allWriteups.length
      ? "No writeups match the current filters."
      : "No writeups available yet.";
    wrapper.append(p);
    if (state.allWriteups.length) {
      const clear = document.createElement("button");
      clear.className = "action secondary";
      clear.type = "button";
      clear.textContent = "Clear filters";
      clear.addEventListener("click", clearGalleryFilters);
      wrapper.append(clear);
    }
    grid.replaceChildren(wrapper);
    return;
  }

  grid.replaceChildren(...writeups.map(createWriteupCard));
};

const renderGallerySkeleton = () => {
  const grid = document.getElementById("writeup-gallery-grid");
  if (!(grid instanceof HTMLElement)) return;
  grid.replaceChildren(
    ...Array.from({ length: 6 }, () => {
      const card = document.createElement("div");
      card.className = "writeup-card-skeleton";
      return card;
    })
  );
};

const GALLERY_FILTER_GROUPS = [
  { id: "writeup-filter-platform", stateKey: "galleryPlatform" },
  { id: "writeup-filter-difficulty", stateKey: "galleryDifficulty" },
  { id: "writeup-filter-sort", stateKey: "gallerySort" }
];

const updateGalleryFilterButtons = () => {
  GALLERY_FILTER_GROUPS.forEach(({ id, stateKey }) => {
    document.querySelectorAll(`#${id} .gallery-filter-btn`).forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.value === state[stateKey] ? "true" : "false");
    });
  });
};

const buildGalleryFilterGroup = (id, stateKey, options) => {
  const group = document.getElementById(id);
  if (!(group instanceof HTMLElement)) return;
  group.replaceChildren(
    ...options.map(({ value, label }) => {
      const button = document.createElement("button");
      button.className = "gallery-filter-btn";
      button.type = "button";
      button.dataset.value = value;
      button.textContent = label;
      button.setAttribute("aria-pressed", state[stateKey] === value ? "true" : "false");
      button.addEventListener("click", () => {
        if (state[stateKey] === value) return;
        state[stateKey] = value;
        updateGalleryFilterButtons();
        renderGallery();
      });
      return button;
    })
  );
};

const buildGalleryControls = (folders) => {
  buildGalleryFilterGroup("writeup-filter-platform", "galleryPlatform", [
    { value: "all", label: "All" },
    ...folders.map((folder) => ({ value: folder.key, label: folder.label }))
  ]);
  buildGalleryFilterGroup("writeup-filter-difficulty", "galleryDifficulty", [
    { value: "all", label: "Any difficulty" },
    ...GALLERY_DIFFICULTIES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))
  ]);
  buildGalleryFilterGroup("writeup-filter-sort", "gallerySort", [
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "title", label: "A-Z" }
  ]);
};

// The gallery toolbar and the reader sidebar each carry a search input; both
// drive the shared state.query so a search follows the visitor across views.
const syncSearchInputs = () => {
  ["writeup-search", "writeup-gallery-search"].forEach((id) => {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement && input.value !== state.query) input.value = state.query;
  });
};

// --- View switching + history ---

const setView = (view) => {
  state.view = view;
  const gallery = document.getElementById("writeup-gallery");
  const reader = document.getElementById("writeup-reader-section");
  if (gallery instanceof HTMLElement) gallery.hidden = view !== "gallery";
  if (reader instanceof HTMLElement) reader.hidden = view !== "reader";
  if (view !== "reader") teardownReadingAids();
};

const openWriteupFromGallery = (writeup) => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("path", writeup.path);
    window.history.pushState({}, "", url);
  } catch {
    // history API unavailable — the view still swaps, the URL just stays put
  }
  setView("reader");
  renderWriteup(writeup, { focusHeading: true });
  window.scrollTo({ top: 0 });
};

const returnToGallery = () => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("path");
    window.history.pushState({}, "", url);
  } catch {
    // history API unavailable
  }
  setView("gallery");
  renderGallery();
};

// Single source of truth for which view the URL describes — run on popstate so
// browser Back/Forward walk between gallery and reader.
const syncViewFromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const writeup = state.writeupsByPath.get(params.get("path") || "");
  if (writeup) {
    setView("reader");
    if (state.activeWriteupPath !== writeup.path) renderWriteup(writeup);
    return;
  }
  setView("gallery");
  renderGallery();
};

const applyWriteupFilters = () => {
  // Tree order (folder by folder, then nested path groups), so prev/next walk
  // the list as displayed.
  state.filteredWriteups = state.writeupSources.flatMap((source) =>
    writeupsInDisplayOrder(source.writeups.filter(writeupMatchesQuery))
  );
  renderWriteupTree();
  updateWriteupFilterCount();
  renderGallery();

  if (!state.allWriteups.length) {
    state.activeWriteupPath = "";
    renderEmptyWriteupViewer(
      "No writeups available yet.",
      "Push markdown files to the connected writeups repository and reload the page."
    );
  }
};

// Deep link (?path=) opens the reader directly; otherwise the page lands on
// the card gallery and no writeup is pre-rendered.
const pickDeepLinkedWriteup = () => {
  const params = new URLSearchParams(window.location.search);
  return state.writeupsByPath.get(params.get("path") || "") || null;
};

const sortWriteups = (left, right) => {
  if (left.sortDate && right.sortDate && left.sortDate !== right.sortDate) {
    return right.sortDate.localeCompare(left.sortDate);
  }
  if (left.sortDate && !right.sortDate) return -1;
  if (!left.sortDate && right.sortDate) return 1;
  return left.title.localeCompare(right.title);
};

// Baked index.json already carries every field the tree + Box Info need (see
// scripts/build-content-index.mjs), so this never fetches the raw markdown —
// the body is loaded lazily, only once the writeup is actually opened (see
// loadWriteupBody / renderWriteup).
const buildBakedWriteupRecord = (file, folder) => ({
  body: null,
  bodyLoaded: false,
  folderKey: folder.key,
  folderLabel: detectWriteupLabel(file.name, folder.label),
  path: file.path,
  // Static article URL from the baked index; enables crawlable card links.
  url: file.url || "",
  rawUrl: file.download_url,
  sourceUrl: file.html_url,
  summary: file.summary || "",
  sortDate: file.date && !Number.isNaN(new Date(file.date).getTime()) ? new Date(file.date).toISOString() : "",
  tags: normalizeTags(file.tags),
  title: file.title || titleizeFileName(file.name),
  displayDate: formatDate(file.date),
  readingTimeMin: file.readingTimeMin || 0,
  difficulty: String(file.difficulty || "").trim().toLowerCase(),
  os: String(file.os || "").trim(),
  roomUrl: String(file.roomUrl || "").trim(),
  room: file.room && typeof file.room === "object" ? file.room : null
});

// Live-API fallback (baked index absent/stale): the recursive tree lists files
// without metadata, so each body is fetched eagerly to derive it.
const buildWriteupRecord = async (file, folder, config) => {
  const rawUrl = file.download_url || getRawUrl(config, file.path);
  const markdown = await fetchText(rawUrl);
  const { metadata, body } = parseFrontMatter(markdown);
  const title = metadata.title || extractTitleFromBody(body, file.name);
  const summary = metadata.summary || extractSummaryFromBody(body);
  const tags = normalizeTags(metadata.tags);
  const difficulty = String(metadata.difficulty || "").trim().toLowerCase();
  const os = String(metadata.os || "").trim();
  const roomUrl = String(metadata.url || metadata.link || metadata.room || "").trim();
  const displayDate = formatDate(metadata.date);
  const sortDate =
    metadata.date && !Number.isNaN(new Date(metadata.date).getTime())
      ? new Date(metadata.date).toISOString()
      : "";

  const wordCount = body.trim().split(/\s+/).length;
  const readingTimeMin = Math.max(1, Math.round(wordCount / 200));

  return {
    body,
    bodyLoaded: true,
    folderKey: folder.key,
    folderLabel: detectWriteupLabel(file.name, folder.label),
    path: file.path,
    rawUrl,
    sourceUrl: file.html_url,
    summary,
    sortDate,
    tags,
    title,
    displayDate,
    readingTimeMin,
    difficulty,
    os,
    roomUrl
  };
};

// Build records resiliently: a single unreachable file (a transient
// raw.githubusercontent 4xx under burst load, a renamed/removed file, etc.) is
// skipped rather than collapsing the whole folder. Only a fully successful load
// is cached, so transient failures are retried on the next visit, not stored.
const buildFolderRecords = async (files, folder, config, cacheKey, builder) => {
  const settled = await Promise.allSettled(
    files.map((file) => builder(file, folder, config))
  );
  const writeups = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort(sortWriteups);
  if (writeups.length && settled.every((result) => result.status === "fulfilled")) {
    writeWriteupCache(cacheKey, writeups);
  }
  return writeups;
};

const errorMessageForWriteupLoad = (error) => {
  const isNotFound = error instanceof Error && error.message.includes("404");
  const isNetworkError = error instanceof TypeError;
  return isNotFound
    ? "Nothing here yet!"
    : isNetworkError
      ? "Network error: check your connection and retry."
      : error instanceof Error
        ? error.message
        : "Nothing here yet!";
};

const loadFolderWriteups = async (folder, config) => {
  const cacheKey = `${config.owner}/${config.repo}/${folder.path}`;

  // Prefer the baked listing: it carries full metadata already, so records
  // build with zero fetches (bodies load lazily, see buildBakedWriteupRecord).
  // It is checked before the localStorage cache, which only stands in for the
  // live GitHub path: otherwise a visit within the cache's lifetime would keep
  // showing the listing (cards, icons) from before the latest deploy.
  const baked = await fetchBakedIndex();
  const bakedFiles = baked?.folders?.[folder.path];
  if (Array.isArray(bakedFiles)) {
    if (bakedFiles.length) {
      const writeups = await buildFolderRecords(bakedFiles, folder, config, cacheKey, buildBakedWriteupRecord);
      if (writeups.length) return { folder, writeups, error: "" };
    }
  }

  const cached = readWriteupCache(cacheKey);
  if (cached) return { folder, writeups: cached, error: "" };

  try {
    const tree = await fetchRecursiveTree(config);
    const markdownFiles = filesForFolder(tree, folder, config);

    if (!markdownFiles.length) return { folder, writeups: [], error: "" };

    const writeups = await buildFolderRecords(markdownFiles, folder, config, cacheKey, buildWriteupRecord);
    return { folder, writeups, error: "" };
  } catch (error) {
    return { folder, writeups: [], error: errorMessageForWriteupLoad(error) };
  }
};

export const loadRepositoryWriteups = async (portfolio) => {
  const treeRoot = document.getElementById("writeup-tree");
  if (!(treeRoot instanceof HTMLElement)) return;

  renderWriteupSkeleton();
  renderGallerySkeleton();
  state.portfolio = portfolio;
  state.writeupsByPath.clear();
  state.allWriteups = [];
  state.filteredWriteups = [];
  state.writeupSources = [];
  state.githubConfig = getRepoConfig(portfolio);

  if (!state.githubConfig) {
    renderEmptyWriteupViewer("Writeups are unavailable right now.");
    setView("gallery");
    renderGallery();
    return;
  }

  const folders = await resolveWriteupFolders(portfolio);
  buildGalleryControls(folders);

  state.writeupSources = await Promise.all(
    folders.map((folder) => loadFolderWriteups(folder, state.githubConfig))
  );
  state.allWriteups = state.writeupSources.flatMap((source) => source.writeups).sort(sortWriteups);
  state.allWriteups.forEach((writeup) => state.writeupsByPath.set(writeup.path, writeup));

  updateMetric("Writeups Ready", String(state.allWriteups.length).padStart(2, "0"));

  // A ?path= deep link opens the reader directly; without one the page
  // stays on the gallery.
  const initial = pickDeepLinkedWriteup();

  applyWriteupFilters();
  if (initial) {
    setView("reader");
    renderWriteup(initial);
  } else {
    setView("gallery");
  }
};

export function initWriteups(portfolio) {
  if (!state.writeupSources.length) void loadRepositoryWriteups(portfolio);

  const handleSearchInput = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    state.query = event.target.value;
    syncSearchInputs();
    applyWriteupFilters();
  };
  document.getElementById("writeup-search")?.addEventListener("input", handleSearchInput);
  document.getElementById("writeup-gallery-search")?.addEventListener("input", handleSearchInput);

  document.getElementById("writeup-back-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    returnToGallery();
  });

  // Browser Back/Forward walks between the gallery and reader views.
  window.addEventListener("popstate", () => {
    if (state.allWriteups.length) syncViewFromLocation();
  });

  // Permanent listeners for the reading aids; they no-op while no writeup is
  // open (see updateReadingAids).
  window.addEventListener("scroll", scheduleReadingAidsUpdate, { passive: true });
  window.addEventListener("resize", scheduleReadingAidsUpdate, { passive: true });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".writeup-tile") : null;
    if (!target) return;
    const writeup = state.writeupsByPath.get(target.dataset.writeupPath || "");
    if (writeup) renderWriteup(writeup, { focusHeading: true });
  });

  const picker = document.getElementById("writeup-tree");
  const tileFrom = (event) => (event.target instanceof Element ? event.target.closest(".writeup-tile") : null);
  picker?.addEventListener("pointerover", (event) => setPickerCaption(tileFrom(event)));
  picker?.addEventListener("pointerleave", () => setPickerCaption());
  picker?.addEventListener("focusin", (event) => setPickerCaption(tileFrom(event)));
  picker?.addEventListener("focusout", () => setPickerCaption());
  picker?.addEventListener("keydown", movePickerFocus);

  // Phones: the grid folds behind a "Browse writeups" toggle so the open
  // writeup isn't pushed a screen down. Wider screens ignore the toggle (CSS).
  const pickerNav = document.querySelector(".writeup-picker");
  const pickerToggle = document.getElementById("writeup-picker-toggle");
  const setPickerOpen = (open) => {
    pickerNav?.classList.toggle("is-collapsed", !open);
    pickerToggle?.setAttribute("aria-expanded", String(open));
  };
  pickerToggle?.addEventListener("click", () => setPickerOpen(pickerNav?.classList.contains("is-collapsed")));
  // filtering means looking for one: show the grid
  document.getElementById("writeup-search")?.addEventListener("input", () => setPickerOpen(true));
  // picking one folds it away again, so the writeup comes into view
  picker?.addEventListener("click", (event) => { if (tileFrom(event)) setPickerOpen(false); });

  return { loadRepositoryWriteups };
}
