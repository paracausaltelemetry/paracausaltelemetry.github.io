// "Latest writeups" on the homepage: the three newest posts from the baked
// writeups index, rendered as cards. The section stays hidden unless the
// index resolves, so a fetch failure costs nothing.

const formatDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fetchJsonOrNull = (url) =>
  fetch(url)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

const labelForPath = (index, path) => {
  const folder = String(path || "").split("/")[0];
  const meta = (index?.foldersMeta || []).find((entry) => entry.path === folder);
  return meta?.label || "Writeup";
};

const formatMeta = (writeup) => {
  const difficulty = String(writeup.difficulty || "");
  return [
    formatDate(writeup.date),
    difficulty && difficulty[0].toUpperCase() + difficulty.slice(1),
    writeup.readingTimeMin ? `${writeup.readingTimeMin} min read` : ""
  ]
    .filter(Boolean)
    .join(" · ");
};

const createCard = (index, writeup) => {
  const card = document.createElement("a");
  card.className = "latest-card";
  card.href = `/writeups/?path=${encodeURIComponent(writeup.path)}`;

  const kicker = document.createElement("span");
  kicker.className = "latest-kicker";
  kicker.textContent = labelForPath(index, writeup.path);

  const heading = document.createElement("strong");
  heading.textContent = writeup.title;

  const meta = document.createElement("span");
  meta.className = "latest-meta";
  meta.textContent = formatMeta(writeup);

  card.append(kicker, heading);
  if (writeup.summary) {
    const summary = document.createElement("p");
    summary.textContent = writeup.summary;
    card.append(summary);
  }
  card.append(meta);
  return card;
};

export async function initLatest() {
  const section = document.getElementById("latest");
  const list = document.getElementById("latest-list");
  if (!section || !list) return;

  const index = await fetchJsonOrNull("/writeups/index.json");
  const writeups = Object.values(index?.folders || {})
    .flat()
    .filter((writeup) => writeup?.title && writeup?.path)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 3);
  if (!writeups.length) return;

  list.replaceChildren(...writeups.map((writeup) => createCard(index, writeup)));
  section.hidden = false;
}
