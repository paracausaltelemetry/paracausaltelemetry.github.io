// /rotation/ — SoundCloud tracks and mixes, rendered from rotation/rotation.json.
//
// Two things worth knowing about this file:
//
// 1. Nothing is requested from SoundCloud until the visitor presses play. Each
//    row ships as plain markup and the iframe is built on the click, which is
//    also the user gesture that lets auto_play actually start. The site has
//    click-gated third-party calls before (the old forecast panel); this keeps
//    that stance.
// 2. The `track` value from the JSON is treated as opaque. It is whatever
//    SoundCloud put in the embed's ?url= parameter — currently a URN rather
//    than a bare id — so it is handed straight back to URLSearchParams instead
//    of being parsed or rebuilt.

const PLAYER = "https://w.soundcloud.com/player/";
const normalize = (value) => String(value || "").trim().toLowerCase();

const playerSrc = (track) => {
  const url = new URL(PLAYER);
  url.searchParams.set("url", track);
  // The site's --signal coral rather than SoundCloud orange.
  url.searchParams.set("color", "#e14759");
  url.searchParams.set("auto_play", "true");
  url.searchParams.set("hide_related", "true");
  url.searchParams.set("show_comments", "false");
  url.searchParams.set("show_user", "true");
  url.searchParams.set("show_reposts", "false");
  url.searchParams.set("show_teaser", "false");
  url.searchParams.set("visual", "false");
  return url.href;
};

const catalogueNumber = (index) => String(index + 1).padStart(3, "0");

const createTag = (text, variant) => {
  const tag = document.createElement("span");
  tag.className = variant ? `rotation-tag rotation-tag-${variant}` : "rotation-tag";
  tag.textContent = text;
  return tag;
};

const createLink = (className, href, text) => {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  return link;
};

const createRow = (entry, index) => {
  const row = document.createElement("li");
  row.className = "rotation-row";
  row.dataset.format = normalize(entry.format);
  row.dataset.genres = (entry.genres || []).map(normalize).join(" ");
  row.dataset.search = [entry.artist, entry.title, entry.note, ...(entry.genres || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const head = document.createElement("div");
  head.className = "rotation-row-head";

  const number = document.createElement("span");
  number.className = "rotation-number";
  number.setAttribute("aria-hidden", "true");
  number.textContent = catalogueNumber(index);

  const copy = document.createElement("div");
  copy.className = "rotation-copy";
  copy.append(
    createLink("rotation-artist", entry.artistUrl, entry.artist),
    createLink("rotation-title", entry.url, entry.title)
  );

  if (entry.note) {
    const note = document.createElement("p");
    note.className = "rotation-note";
    note.textContent = entry.note;
    copy.append(note);
  }

  const tags = document.createElement("div");
  tags.className = "rotation-tags";
  tags.append(createTag(entry.format, normalize(entry.format)));
  for (const genre of entry.genres || []) tags.append(createTag(genre));
  copy.append(tags);

  const button = document.createElement("button");
  button.className = "rotation-play";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", `Play ${entry.artist} — ${entry.title} on SoundCloud`);
  const glyph = document.createElement("span");
  glyph.className = "rotation-play-glyph";
  glyph.setAttribute("aria-hidden", "true");
  button.append(glyph);

  head.append(number, copy, button);

  const player = document.createElement("div");
  player.className = "rotation-player";
  player.hidden = true;

  row.append(head, player);
  return row;
};

// Only one player at a time: opening a second closes the first, so pressing
// play never leaves two tracks running over each other.
const closePlayer = (row) => {
  const button = row.querySelector(".rotation-play");
  const player = row.querySelector(".rotation-player");
  if (!button || !player) return;
  button.setAttribute("aria-expanded", "false");
  player.replaceChildren();
  player.hidden = true;
};

const openPlayer = (row, entry) => {
  const button = row.querySelector(".rotation-play");
  const player = row.querySelector(".rotation-player");
  if (!button || !player) return;

  const frame = document.createElement("iframe");
  frame.src = playerSrc(entry.track);
  frame.title = `SoundCloud player: ${entry.artist} — ${entry.title}`;
  frame.width = "100%";
  frame.height = "166";
  frame.loading = "lazy";
  frame.setAttribute("frameborder", "no");
  frame.setAttribute("scrolling", "no");
  frame.setAttribute("allow", "autoplay; encrypted-media");

  player.replaceChildren(frame);
  player.hidden = false;
  button.setAttribute("aria-expanded", "true");
};

const createChip = (key, value, label) => {
  const chip = document.createElement("button");
  chip.className = "rotation-chip";
  chip.type = "button";
  chip.dataset.filter = key;
  chip.dataset.value = value;
  chip.setAttribute("aria-pressed", "false");
  chip.textContent = label;
  return chip;
};

// A live filter, not a form: nothing is ever submitted, and a <form> without a
// submit button fails WCAG H32.
const initFilters = (list, filter) => {
  const query = filter.querySelector("#rotation-query");
  const status = document.getElementById("rotation-status");
  const empty = document.getElementById("rotation-empty");
  const chips = [...filter.querySelectorAll("[data-filter]")];
  const rows = [...list.querySelectorAll(".rotation-row")];

  const active = { genre: "", format: "" };
  const initial = new URLSearchParams(window.location.search);
  if (query instanceof HTMLInputElement) query.value = initial.get("q") || "";
  for (const key of ["genre", "format"]) {
    const value = normalize(initial.get(key));
    if (chips.some((chip) => chip.dataset.filter === key && chip.dataset.value === value)) {
      active[key] = value;
    }
  }

  const syncChips = () => {
    for (const chip of chips) {
      const on = active[chip.dataset.filter] === chip.dataset.value;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };

  const render = () => {
    const q = normalize(query instanceof HTMLInputElement ? query.value : "");
    let visible = 0;

    for (const row of rows) {
      const matches = (!q || row.dataset.search.includes(q))
        && (!active.genre || row.dataset.genres.split(" ").includes(active.genre))
        && (!active.format || row.dataset.format === active.format);
      row.hidden = !matches;
      // A row that filters out must not keep playing.
      if (!matches) closePlayer(row);
      if (matches) visible += 1;
    }

    if (status) status.textContent = `${visible} ${visible === 1 ? "entry" : "entries"}`;
    if (empty) empty.hidden = visible !== 0;

    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (active.genre) next.set("genre", active.genre);
    if (active.format) next.set("format", active.format);
    window.history.replaceState(null, "", next.size ? `?${next}` : window.location.pathname);
  };

  query?.addEventListener("input", render);
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const { filter: key, value } = chip.dataset;
      // Clicking the active chip clears that axis.
      active[key] = active[key] === value ? "" : value;
      syncChips();
      render();
    });
  }

  syncChips();
  render();
};

export async function initRotation() {
  const list = document.getElementById("rotation-list");
  const filter = document.getElementById("rotation-filter");
  const status = document.getElementById("rotation-status");
  if (!list || !filter) return;

  const index = await fetch("/rotation/rotation.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const entries = (index?.entries || []).filter((entry) => entry?.track && entry?.artist);
  if (!entries.length) {
    if (status) status.textContent = "Nothing loaded — the rotation index could not be read.";
    return;
  }

  list.replaceChildren(...entries.map(createRow));

  // One delegated listener rather than one per row.
  list.addEventListener("click", (event) => {
    const button = event.target.closest(".rotation-play");
    if (!button) return;
    const row = button.closest(".rotation-row");
    const entry = entries[[...list.children].indexOf(row)];
    if (!entry) return;

    const isOpen = button.getAttribute("aria-expanded") === "true";
    for (const other of list.querySelectorAll(".rotation-row")) closePlayer(other);
    if (!isOpen) openPlayer(row, entry);
  });

  // Chips come from the data, so a new genre needs no code change.
  const genres = [...new Set(entries.flatMap((entry) => (entry.genres || []).map(normalize)))].sort();
  const formats = [...new Set(entries.map((entry) => normalize(entry.format)))].sort();

  filter.querySelector("#rotation-genres")?.append(
    ...genres.map((genre) => createChip("genre", genre, genre))
  );
  filter.querySelector("#rotation-formats")?.append(
    ...formats.map((format) => createChip("format", format, format))
  );

  initFilters(list, filter);
}
