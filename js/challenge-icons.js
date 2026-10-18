// Category marks for CTF event challenges (hardware, AI/ML, ICS, web...),
// shown in the info card's image tile where a platform room has its own
// artwork. Simple 24x24 line drawings made for this site, stroked in
// currentColor, decorative only.

const ICONS = {
  hardware: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3"/>',
  ai: '<path d="M11 3.5 12.9 9 18.5 11l-5.6 2L11 18.5 9.1 13 3.5 11l5.6-2z"/><path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  ics: '<path d="M3 20.5V10l5 3v-3l5 3v-3l5 3V4h3v16.5z"/><path d="M7 17h2M12 17h2"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z"/>',
  crypto: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M13.5 9.5l2 2"/>',
  forensics: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  pwn: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 10l3 2-3 2M12 15h5"/>',
  reversing: '<path d="M4.5 11A7.5 7.5 0 0 1 17.6 6.6L20 9M20 4v5h-5M19.5 13a7.5 7.5 0 0 1-13.1 4.4L4 15M4 20v-5h5"/>',
  osint: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  blockchain: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  mobile: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  cloud: '<path d="M7 18.5a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9z"/>',
  flag: '<path d="M5 21V3.5M5 4h12l-2.5 4.5L17 13H5"/>'
};

/** Map a free-text category ("AI/ML", "Hardware", "OT/ICS") to an icon key. */
export const categoryKey = (category = "") => {
  const s = String(category).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/hardware|embedded|rf|iot|firmware/.test(s)) return "hardware";
  if (/\bai\b|aiml|machine learning|\bml\b|llm/.test(s)) return "ai";
  if (/ics|\bot\b|scada|plc/.test(s)) return "ics";
  if (/web/.test(s)) return "web";
  if (/crypt/.test(s)) return "crypto";
  if (/forensic|dfir|stego/.test(s)) return "forensics";
  if (/pwn|exploit|binary/.test(s)) return "pwn";
  if (/rev/.test(s)) return "reversing";
  if (/osint|recon/.test(s)) return "osint";
  if (/blockchain|smart contract/.test(s)) return "blockchain";
  if (/mobile|android|ios/.test(s)) return "mobile";
  if (/cloud/.test(s)) return "cloud";
  return "flag";
};

/** Inline SVG string for a challenge category (a flag when nothing matches). */
export const categoryIcon = (category) => {
  const key = categoryKey(category);
  return `<svg class="category-icon category-icon-${key}" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[key]}</svg>`;
};
