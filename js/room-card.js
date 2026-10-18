// Room / machine info card, shared by the static writeup pages
// (scripts/build-content-index.mjs) and the in-page reader (js/writeups.js),
// so both show the same thing. Input is the saved details from
// writeups/meta/ (scripts/fetch-writeup-meta.py) plus iconSrc. Returns an
// HTML string; every value from the data is escaped here.

import { osIcon, isBlankOs } from "./os-icons.js?v=os1";
import { categoryIcon } from "./challenge-icons.js?v=ci1";

const esc = (value = "") =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const shortDate = (iso) => {
  const parsed = iso ? new Date(`${iso}T00:00:00Z`) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "";
};
const count = (n) => (typeof n === "number" ? n.toLocaleString("en-GB") : "");
const titleCase = (s = "") => String(s).charAt(0).toUpperCase() + String(s).slice(1);
// links and icons must be http(s) or site-relative; anything else is dropped
const safeUrl = (url) => (typeof url === "string" && /^(https?:\/\/|\/(?!\/))/i.test(url.trim()) ? url.trim() : "");

/* rated difficulty: one bar per player vote bucket, easiest to hardest */
const difficultyBars = (buckets) => {
  if (!Array.isArray(buckets) || !buckets.some((n) => n > 0)) return "";
  const max = Math.max(...buckets), w = 20, gap = 6, h = 64;
  const hues = [96, 96, 80, 70, 50, 38, 28, 16, 8, 0];
  const bars = buckets.map((n, i) => {
    const bh = Math.max(2, Math.round((n / max) * h));
    return `<rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" rx="2" fill="hsl(${hues[i]} 70% 55%)"><title>${n} votes</title></rect>`;
  }).join("");
  return `<figure class="room-chart"><figcaption>Rated difficulty</figcaption><svg viewBox="0 0 ${10 * (w + gap) - gap} ${h}" role="img" aria-label="Player-rated difficulty, ${buckets.reduce((a, b) => a + b, 0)} votes from easiest to hardest">${bars}</svg></figure>`;
};

/* radar: Enumeration, Real-Life, CVE, Custom Exploitation, CTF-Like (0-10) */
const RADAR_AXES = ["Enumeration", "Real-Life", "CVE", "Custom Exploitation", "CTF-Like"];
const radarGraph = (values) => {
  if (!Array.isArray(values) || values.length !== 5) return "";
  const c = 110, r = 70, max = 10;
  const point = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [c + Math.cos(a) * r * (v / max), c + Math.sin(a) * r * (v / max)];
  };
  const ring = (v) => RADAR_AXES.map((_, i) => point(i, v).map((n) => n.toFixed(1)).join(",")).join(" ");
  const rings = [2.5, 5, 7.5, 10].map((v) => `<polygon points="${ring(v)}" class="radar-ring"/>`).join("");
  const spokes = RADAR_AXES.map((_, i) => { const [x, y] = point(i, max); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-ring"/>`; }).join("");
  const shape = values.map((v, i) => point(i, Math.max(0, Math.min(max, Number(v) || 0))).map((n) => n.toFixed(1)).join(",")).join(" ");
  const labels = RADAR_AXES.map((label, i) => {
    const [x, y] = point(i, max + 2.6);
    const anchor = x < c - 5 ? "end" : x > c + 5 ? "start" : "middle";
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text>`;
  }).join("");
  const summary = RADAR_AXES.map((label, i) => `${label} ${Number(values[i]).toFixed(1)}`).join(", ");
  return `<figure class="room-chart room-radar"><figcaption>Player profile</figcaption><svg viewBox="-60 0 340 230" role="img" aria-label="Radar graph out of 10: ${esc(summary)}">${rings}${spokes}<polygon points="${shape}" class="radar-shape"/>${labels}</svg></figure>`;
};

const fact = (label, value) => (value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : "");
const osFact = (os) => (os && !isBlankOs(os) ? `<div><dt>OS</dt><dd class="room-os">${osIcon(os)}<span>${esc(os)}</span></dd></div>` : "");

// options.os: the writeup's own OS (front-matter), used when the platform
// gives none (TryHackMe never does)
export const roomCardHtml = (meta, options = {}) => {
  if (!meta) return "";
  const os = meta.os || options.os;
  const thm = meta.platform === "thm";
  const event = meta.platform === "event";
  const name = thm ? meta.title : meta.name;
  const difficulty = (meta.difficulty || "").toLowerCase();
  const kicker = event
    ? `${meta.event} · ${meta.category ? `${meta.category} challenge` : "challenge"}`
    : thm ? `TryHackMe ${meta.type === "challenge" ? "challenge" : "room"}` : `Hack The Box ${meta.kind}`;
  const iconSrc = safeUrl(meta.iconSrc);
  // a CTF event without artwork (writeups/meta/events/) gets its category drawn
  const glyph = event && !iconSrc ? `<span class="room-card-glyph">${categoryIcon(meta.category)}</span>` : "";
  const link = safeUrl(meta.url);
  const linkLabel = event ? meta.organiser || meta.event : thm ? "TryHackMe" : "Hack The Box";
  const facts = event
    ? [
        fact("Event", meta.event),
        fact("Organiser", meta.organiser),
        fact("Category", meta.category),
        osFact(os)
      ]
    : thm
    ? [
        fact("Released", shortDate(meta.released)),
        osFact(os),
        fact("Type", titleCase(meta.type)),
        fact("Time", meta.minutes ? `${meta.minutes} min` : ""),
        fact("Joined", count(meta.users)),
        fact("Votes", count(meta.votes)),
        fact("Access", meta.free === true ? "Free" : meta.free === false ? "Subscribers" : "")
      ]
    : [
        fact("Released", shortDate(meta.released)),
        fact("Retired", meta.retiredOn ? shortDate(meta.retiredOn) : meta.retired ? "Yes" : ""),
        osFact(os),
        fact("Category", meta.category),
        fact(meta.makers?.length > 1 ? "Creators" : "Creator", (meta.makers || []).join(", ")),
        fact("Rating", typeof meta.stars === "number" ? `${meta.stars.toFixed(1)} / 5` : ""),
        fact("User owns", count(meta.userOwns)),
        fact("Root owns", count(meta.rootOwns)),
        fact("Solves", count(meta.solves))
      ];
  const bloods = thm || event ? "" : [["User blood", meta.userBlood], ["Root blood", meta.rootBlood]]
    .filter(([, b]) => b && (b.user || b.time))
    .map(([label, b]) => `<div><dt>${label}</dt><dd>${esc([b.user, b.time].filter(Boolean).join(" · "))}</dd></div>`).join("");
  // CTF events: the official challenge prompt, quoted
  const challenge = event && meta.challenge
    ? `<figure class="room-challenge"><figcaption>Challenge</figcaption><blockquote><p>${esc(meta.challenge)}</p></blockquote></figure>`
    : "";
  const charts = thm || event ? "" : `${difficultyBars(meta.ratedDifficulty)}${radarGraph(meta.radar)}`;
  return `<section class="room-card" aria-label="${esc(kicker)} details"><div class="room-card-head${iconSrc || glyph ? " room-card-has-icon" : ""}">${iconSrc ? `<img src="${esc(iconSrc)}" width="56" height="56" alt="" loading="lazy" decoding="async" />` : glyph}<div class="room-card-title"><p class="eyebrow">${esc(kicker)}</p><h2>${esc(name)}</h2>${meta.description ? `<p>${esc(meta.description)}</p>` : ""}</div>${difficulty ? `<span class="room-badge room-badge-${esc(difficulty.replace(/[^a-z]/g, ""))}">${esc(titleCase(difficulty))}</span>` : ""}</div>${challenge}<dl class="room-facts">${facts.join("")}${bloods}</dl>${charts ? `<div class="room-charts">${charts}</div>` : ""}${link ? `<p class="room-link"><a href="${esc(link)}" rel="noreferrer" target="_blank">Open on ${esc(linkLabel)}<span class="visually-hidden"> (opens in a new tab)</span></a></p>` : ""}</section>`;
};
