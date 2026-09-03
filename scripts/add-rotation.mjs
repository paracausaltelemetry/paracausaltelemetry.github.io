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
    // track is normally the bare numeric id copied out of the embed; a full
    // api.soundcloud.com URL is still accepted for older entries.
    if (entry.track && !/^\d+$/.test(String(entry.track))) {
      try {
        const url = new URL(entry.track);
        if (url.protocol !== "https:") throw new Error();
      } catch {
        problems.push(`${at}: track must be a numeric SoundCloud id or an HTTPS URL`);
      }
    }
    for (const key of ["artistUrl", "url"]) {
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

// SoundCloud escapes the credit line, so titles arrive as "Denham Audio &amp;
// Notion" and "Bullet Tooth&#x27;s". Store the real characters.
const decodeEntities = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

// The player carries the track reference in its own ?url= parameter, these days
// as a URN (soundcloud:tracks:123). Only the number is worth storing: it is the
// part a human can copy by eye, and the page rebuilds the URN around it.
const parseEmbed = (html) => {
  const src = html.match(/<iframe[^>]*\ssrc="([^"]+)"/i)?.[1];
  if (!src) throw new Error("no <iframe src> found — paste the whole embed block");

  const reference = new URL(src.replace(/&amp;/g, "&")).searchParams.get("url");
  if (!reference) throw new Error("the iframe src has no url parameter");
  const track = reference.match(/(\d+)\s*$/)?.[1];
  if (!track) throw new Error(`could not find a track id in ${reference}`);

  // SoundCloud's credit line is two links: the artist, then the track.
  const links = [...html.matchAll(/<a\s+href="(https:\/\/soundcloud\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gi)]
    .map((match) => ({ href: match[1], text: match[2].trim() }));
  if (links.length < 2) {
    throw new Error("could not find the artist and title links — paste the credit <div> too");
  }

  return {
    track,
    artist: decodeEntities(links[0].text),
    artistUrl: links[0].href,
    title: decodeEntities(links[1].text),
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
