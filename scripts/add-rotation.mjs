// Add an entry to rotation/rotation.json from a pasted SoundCloud embed.
//
//   node scripts/add-rotation.mjs --format mix --genres techno,industrial < embed.txt
//   node scripts/add-rotation.mjs --check
//
// The embed markup SoundCloud gives you already carries everything the page
// needs: the track reference in the iframe src, and the artist and title in the
// credit <div> underneath. Rather than retyping any of that, paste the whole
// blob on stdin and let this pull it apart.
//
// --check validates the committed file instead of writing, so CI catches a
// malformed hand-edit.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "rotation", "rotation.json");
const FORMATS = new Set(["track", "mix"]);

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");

const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? "" : (argv[index + 1] || "").trim();
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const load = () => {
  const document = JSON.parse(readFileSync(FILE, "utf8"));
  if (!Array.isArray(document.entries)) throw new Error("entries must be an array");
  return document;
};

// --- Validation, shared by --check and the write path ---

const validate = (document) => {
  const problems = [];
  const seen = new Set();

  if (document.schemaVersion !== 1) problems.push("schemaVersion must be 1");

  document.entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    for (const key of ["track", "artist", "artistUrl", "title", "url", "format", "added"]) {
      if (!entry[key]) problems.push(`${at}: missing ${key}`);
    }
    if (entry.format && !FORMATS.has(entry.format)) {
      problems.push(`${at}: format must be one of ${[...FORMATS].join(", ")}`);
    }
    if (!Array.isArray(entry.genres) || !entry.genres.length) {
      problems.push(`${at}: genres must be a non-empty array`);
    } else if (entry.genres.some((genre) => genre !== String(genre).toLowerCase())) {
      problems.push(`${at}: genres must be lowercase`);
    }
    if (entry.added && !/^\d{4}-\d{2}-\d{2}$/.test(entry.added)) {
      problems.push(`${at}: added must be YYYY-MM-DD`);
    }
    for (const key of ["track", "artistUrl", "url"]) {
      if (!entry[key]) continue;
      try {
        const url = new URL(entry[key]);
        if (url.protocol !== "https:") throw new Error();
      } catch {
        problems.push(`${at}: ${key} must be a valid HTTPS URL`);
      }
    }
    if (entry.track) {
      if (seen.has(entry.track)) problems.push(`${at}: duplicate track ${entry.track}`);
      seen.add(entry.track);
    }
  });

  return problems;
};

// --- Parsing a pasted embed ---

// The player carries the track reference in its own ?url= parameter. Keep the
// decoded value verbatim: SoundCloud now emits a URN
// (soundcloud:tracks:123) rather than a bare id, and re-encoding whatever it
// gave us reproduces the original exactly.
const parseEmbed = (html) => {
  const src = html.match(/<iframe[^>]*\ssrc="([^"]+)"/i)?.[1];
  if (!src) throw new Error("no <iframe src> found — paste the whole embed block");

  const track = new URL(src.replace(/&amp;/g, "&")).searchParams.get("url");
  if (!track) throw new Error("the iframe src has no url parameter");

  // SoundCloud's credit line is two links: the artist, then the track.
  const links = [...html.matchAll(/<a\s+href="(https:\/\/soundcloud\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gi)]
    .map((match) => ({ href: match[1], text: match[2].trim() }));
  if (links.length < 2) {
    throw new Error("could not find the artist and title links — paste the credit <div> too");
  }

  return {
    track,
    artist: links[0].text,
    artistUrl: links[0].href,
    title: links[1].text,
    url: links[1].href
  };
};

// --- Run ---

const document = load();

if (CHECK) {
  const problems = validate(document);
  if (problems.length) {
    problems.forEach((problem) => console.error(`  FAIL ${problem}`));
    fail(`\nrotation.json is invalid: ${problems.length} problem(s).`);
  }
  console.log(`rotation.json: ${document.entries.length} entr${document.entries.length === 1 ? "y" : "ies"} checked.`);
  process.exit(0);
}

const format = flag("format") || "track";
if (!FORMATS.has(format)) fail(`--format must be one of ${[...FORMATS].join(", ")}`);

const genres = flag("genres").split(",").map((genre) => genre.trim().toLowerCase()).filter(Boolean);
if (!genres.length) fail("--genres is required, e.g. --genres techno,jungle");

const html = await readStdin();
if (!html.trim()) fail("nothing on stdin — pipe the pasted embed in, e.g. `... < embed.txt`");

let parsed;
try {
  parsed = parseEmbed(html);
} catch (error) {
  fail(`could not read the embed: ${error.message}`);
}

if (document.entries.some((entry) => entry.track === parsed.track)) {
  fail(`already in rotation: ${parsed.artist} — ${parsed.title}`);
}

const entry = {
  ...parsed,
  genres,
  format,
  note: flag("note"),
  added: new Date().toISOString().slice(0, 10)
};

// Newest first, matching how the page reads.
document.entries.unshift(entry);

const problems = validate(document);
if (problems.length) {
  problems.forEach((problem) => console.error(`  FAIL ${problem}`));
  fail("\nrefusing to write an invalid file.");
}

writeFileSync(FILE, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Added ${entry.artist} — ${entry.title} [${format}, ${genres.join(", ")}]`);
console.log(`rotation.json now holds ${document.entries.length} entries.`);
