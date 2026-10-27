// Visual blocks for the field guides, drawn at build time from small text
// formats in the guide's markdown so a guide stays one readable file:
//
//   ```sequence  who talks to whom, in order (AssumeRole, presigned URLs, OAuth)
//   Client[user] -> STS[security]: AssumeRole(RoleArn)
//   STS -> Client: AccessKeyId ASIA..., SecretKey, SessionToken
//   note: Credentials expire after 1h by default
//   ```
//
//   ```flow      boxes left to right, one row per line; the same box in the
//                same column on consecutive rows is drawn once, spanning them
//   App[app] --invoke--> Lambda[compute] --logs--> CloudWatch[mgmt]
//   ```
//
//   ```layers    an architecture map: bands top to bottom, then connections
//   Edge :: Laptop[user]{laptop}, Starlink Mini[compute]{dish}
//   Core :: Hub firewall[security]{firewall}
//   Laptop -> Starlink Mini: Wi-Fi
//   Starlink Mini -> Hub firewall: IPsec
//   ```
//
//   ```bars      a labelled bar chart
//   GEO :: 600 :: ms round trip
//   LEO :: 40 :: ms round trip
//   ```
//
//   ```anatomy   a value split into labelled parts (ARNs, URLs, key IDs)
//   arn :: prefix
//   :
//   aws :: partition
//   ```
//
//   ```terms     term cards
//   Region :: A geographic area made of several Availability Zones
//   ```
//
// [kind] tags colour a box from the page's provider theme (field-guides.css:
// compute, storage, security, mgmt, network, app, data, user, external), and
// pick its icon unless {icon} names one ({none} for no icon) or {vendor/name}
// names an official vendor architecture icon from field-guides/icons/. Everything is
// escaped here; diagrams carry role="img" with a title, and their content is
// repeated as a visually hidden list.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../../js/markdown.js?v=276fa973-th";

// Official vendor architecture icons (field-guides/icons/<vendor>/<name>.svg,
// see the README there for sources and terms), used as {aws/lambda}.
const VENDOR_ICONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "field-guides", "icons");
const VENDOR_VERSION = "vi1";
const vendorIcon = (path) => {
  if (!existsSync(resolve(VENDOR_ICONS, `${path}.svg`))) throw new Error(`no vendor icon field-guides/icons/${path}.svg`);
  return path;
};

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

// inline markdown (code spans, bold) without the wrapping paragraph
const inline = (text) => renderMarkdown(text).replace(/^<p>|<\/p>$/g, "");

// rough text width for the site's UI font at 13px: enough to size boxes
const textWidth = (text, size = 13) => Math.ceil(String(text).length * size * 0.56);

/* ---------- icons: 24px line glyphs, stroked in the box's kind colour ---------- */
const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1"/><path d="M2 19h20"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  server: '<rect x="4" y="3" width="16" height="8" rx="1"/><rect x="4" y="13" width="16" height="8" rx="1"/><path d="M8 7h.01M8 17h.01"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  firewall: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.7h18M9 4v5.3M15 9.3v5.4M9 14.7V20"/>',
  satellite: '<rect x="10" y="9" width="4" height="6" rx="1"/><path d="M2 10h7v4H2zM15 10h7v4h-7zM12 15v3M9 21h6"/>',
  dish: '<path d="M4 9a9 9 0 0 0 11 11z"/><path d="M9.5 14.5l5-5M17 4.5a4 4 0 0 1 2.5 2.5M17.5 1.5a7 7 0 0 1 5 5"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 13V7M17 13V7M7 16.5h.01M11 16.5h.01"/>',
  switch: '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/>',
  tower: '<path d="M12 10v11M8 21h8M9 15l3-5 3 5M6 6.5a8 8 0 0 1 12 0M8.6 9a4 4 0 0 1 6.8 0"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  bucket: '<ellipse cx="12" cy="6" rx="8" ry="2.5"/><path d="M4 6l2 14h12l2-14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  log: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  app: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/>',
  function: '<path d="M8 4C6 4 5 5 5 7v2c0 1-1 2-2 3 1 1 2 2 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1 1 2 2 3-1 1-2 2-2 3v2c0 2-1 3-3 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6-6"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>',
  ship: '<path d="M3 15h18l-3 5H6z"/><path d="M12 3v12M12 5l6 7h-6"/>',
  car: '<path d="M3 16v-4l3-5h12l3 5v4z"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  building: '<path d="M4 21V4h10v17M14 9h6v12M2 21h20M7 8h4M7 12h4M7 16h4"/>',
  sensor: '<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>',
  plane: '<path d="M2 13l8-2 4-8h2l-1.5 8 6.5 1.5v2L14.5 16 16 21h-2l-4-4-8-2z"/>'
};
const DEFAULT_ICON = { user: "user", compute: "server", storage: "db", security: "shield", mgmt: "log", network: "globe", app: "app", data: "db", external: "cloud" };

const KINDS = new Set(["compute", "storage", "security", "mgmt", "network", "app", "data", "user", "external"]);
const parseNode = (raw) => {
  const m = raw.trim().match(/^(.*?)(?:\[([a-z]+)\])?(?:\{([a-z0-9-]+(?:\/[a-z0-9-]+)?)\})?$/);
  const kind = KINDS.has(m[2]) ? m[2] : "external";
  if (m[3]?.includes("/")) return { name: m[1].trim(), kind, icon: "", vendor: vendorIcon(m[3]) };
  const icon = m[3] === "none" ? "" : ICONS[m[3]] ? m[3] : DEFAULT_ICON[kind];
  return { name: m[1].trim(), kind, icon };
};
const VENDOR = 24;
const ICON = 18;
const nodeWidth = (node, size = 13) => textWidth(node.name, size) + 28 + (node.vendor ? VENDOR + 8 : node.icon ? ICON + 8 : 0);

// one box: rect, optional icon on the left, label centred in what's left
const box = (node, x, y, w, h) => {
  const icon = node.vendor ? VENDOR + 8 : node.icon ? ICON + 8 : 0;
  const glyph = node.vendor
    ? `<image class="gv-vendor-icon" href="/field-guides/icons/${node.vendor}.svg?v=${VENDOR_VERSION}" x="${x + 10}" y="${y + (h - VENDOR) / 2}" width="${VENDOR}" height="${VENDOR}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"/>`
    : node.icon
    ? `<svg class="gv-icon" x="${x + 12}" y="${y + (h - ICON) / 2}" width="${ICON}" height="${ICON}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[node.icon]}</svg>`
    : "";
  return `<g class="gv-node" data-kind="${node.kind}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>${glyph}<text x="${x + icon / 2 + w / 2 + (icon ? 4 : 0)}" y="${y + h / 2 + 4.5}" text-anchor="middle">${esc(node.name)}</text></g>`;
};

/* ---------- sequence ---------- */
const sequence = (source, id) => {
  const actors = new Map();
  const steps = [];
  const actor = (raw) => {
    const node = parseNode(raw);
    if (!actors.has(node.name)) actors.set(node.name, node);
    else if (/[[{]/.test(raw)) Object.assign(actors.get(node.name), { kind: node.kind, icon: node.icon });
    return actors.get(node.name);
  };
  for (const line of source.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const note = line.match(/^note:\s*(.+)$/i);
    if (note) { steps.push({ note: note[1] }); continue; }
    const m = line.match(/^(.+?)\s*(-->|->)\s*(.+?):\s*(.+)$/);
    if (!m) throw new Error(`sequence: can't read "${line}"`);
    steps.push({ from: actor(m[1]), to: actor(m[3]), dashed: m[2] === "-->", label: m[4] });
  }
  const list = [...actors.values()];
  const colWidth = Math.max(160, ...list.map((a) => nodeWidth(a) + 16));
  let width = Math.max(560, list.length * colWidth);
  const gap = width / list.length;
  list.forEach((a, i) => { a.x = Math.round(gap * i + gap / 2); });
  // labels can be wider than the columns: grow the canvas (and shift the
  // actors right) until every label fits
  let left = 8, right = width - 8;
  steps.forEach((step, i) => {
    if (step.note) return;
    const w = textWidth(`${i + 1}. ${step.label}`, 12);
    if (step.from === step.to) right = Math.max(right, step.from.x + 42 + w);
    else {
      const mid = (step.from.x + step.to.x) / 2;
      left = Math.min(left, mid - w / 2);
      right = Math.max(right, mid + w / 2);
    }
  });
  const shift = Math.ceil(8 - left);
  list.forEach((a) => { a.x += shift; });
  width = Math.ceil(right + shift + 8);
  const top = 18, boxH = 40, rowH = 46;
  let y = top + boxH + 34;
  const body = [];
  let n = 0;
  steps.forEach((step) => {
    if (step.note) {
      const w = Math.min(width - 24, textWidth(step.note, 12) + 28);
      body.push(`<rect class="gv-note" x="${(width - w) / 2}" y="${y - 16}" width="${w}" height="26" rx="3"/><text class="gv-note-text" x="${width / 2}" y="${y + 1}" text-anchor="middle">${esc(step.note)}</text>`);
      y += rowH - 8;
      return;
    }
    n += 1;
    const { from, to } = step;
    if (from === to) {
      body.push(`<path class="gv-arrow" d="M${from.x} ${y - 6} h34 v18 h-30" marker-end="url(#${id}-head)"/><text class="gv-label" x="${from.x + 42}" y="${y + 6}">${n}. ${esc(step.label)}</text>`);
    } else {
      const dir = to.x > from.x ? 1 : -1;
      const x1 = from.x + dir * 4, x2 = to.x - dir * 6;
      body.push(`<line class="gv-arrow${step.dashed ? " gv-dashed" : ""}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-end="url(#${id}-head)"/><text class="gv-label" x="${(from.x + to.x) / 2}" y="${y - 8}" text-anchor="middle">${n}. ${esc(step.label)}</text>`);
    }
    y += rowH;
  });
  const height = y - 10;
  const heads = list.map((a) => {
    const w = Math.min(gap - 12, nodeWidth(a));
    return `<line class="gv-life" x1="${a.x}" y1="${top + boxH}" x2="${a.x}" y2="${height - 6}"/>${box(a, a.x - w / 2, top, w, boxH)}`;
  }).join("");
  let k = 0;
  const described = steps.map((s) => (s.note ? `Note: ${s.note}` : `${++k}. ${s.from.name} to ${s.to.name}: ${s.label}`));
  return figure(id, "sequence", `<svg class="gv-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Sequence: ${esc(list.map((a) => a.name).join(", "))}</title>${marker(id)}${heads}${body.join("")}</svg>`, described);
};

/* ---------- flow ---------- */
const flow = (source, id) => {
  const rows = source.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    // a label can't start with ">" or "-", so a bare "-->" never swallows the next arrow
    const parts = line.split(/\s*--(?:([^>\-][^>]*?)--)?>\s*/);
    // split keeps the captured labels between the nodes: node, label, node, label, node
    const nodes = [], labels = [];
    parts.forEach((part, i) => (i % 2 === 0 ? nodes.push(parseNode(part)) : labels.push(part || "")));
    return { nodes, labels };
  });
  const arrowW = (label) => Math.max(56, textWidth(label, 12) + 20);
  const boxH = 44, rowGap = 30, pad = 12;
  // rows share a column grid, so the same box in the same column on
  // consecutive rows is drawn once, spanning them (several links into one
  // firewall, say)
  const cols = Math.max(...rows.map((row) => row.nodes.length));
  const nodeW = Array.from({ length: cols }, (_, c) => Math.max(96, ...rows.map((row) => (row.nodes[c] ? nodeWidth(row.nodes[c]) : 0))));
  const gapW = Array.from({ length: cols - 1 }, (_, c) => Math.max(56, ...rows.map((row) => (c < row.labels.length ? arrowW(row.labels[c]) : 0))));
  const colX = [];
  nodeW.forEach((w, c) => { colX[c] = c ? colX[c - 1] + nodeW[c - 1] + gapW[c - 1] : pad; });
  const width = colX[cols - 1] + nodeW[cols - 1] + pad;
  const rowY = (r) => pad + r * (boxH + rowGap);
  const same = (a, b) => a && b && a.name === b.name && a.kind === b.kind;
  const parts = [];
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows.length; r += 1) {
      const node = rows[r].nodes[c];
      if (!node || same(rows[r - 1]?.nodes[c], node)) continue;
      let last = r;
      while (same(rows[last + 1]?.nodes[c], node)) last += 1;
      const y = rowY(r);
      parts.push(box(node, colX[c], y, nodeW[c], rowY(last) + boxH - y));
    }
  }
  rows.forEach((row, r) => {
    const mid = rowY(r) + boxH / 2;
    row.labels.forEach((label, i) => {
      const x1 = colX[i] + nodeW[i] + 4, x2 = colX[i + 1] - 6;
      parts.push(`<line class="gv-arrow" x1="${x1}" y1="${mid}" x2="${x2}" y2="${mid}" marker-end="url(#${id}-head)"/>`);
      if (label) parts.push(`<text class="gv-label" x="${(x1 + x2) / 2}" y="${mid - 8}" text-anchor="middle">${esc(label)}</text>`);
    });
  });
  const height = pad * 2 + rows.length * boxH + (rows.length - 1) * rowGap;
  const described = rows.map((row) => row.nodes.map((n, i) => `${n.name}${i < row.labels.length ? ` (${row.labels[i] || "to"})` : ""}`).join(" → "));
  return figure(id, "flow", `<svg class="gv-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Flow: ${esc(rows.map((r) => r.nodes.map((n) => n.name).join(" to ")).join("; "))}</title>${marker(id)}${parts.join("")}</svg>`, described);
};

/* ---------- layers: an architecture map ---------- */
const layers = (source, id) => {
  const bands = [];
  const nodes = new Map();
  const links = [];
  for (const line of source.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const band = line.match(/^(.+?)\s::\s(.+)$/);
    if (band) {
      const list = band[2].split(/\s*,\s*/).map(parseNode);
      list.forEach((node) => { node.band = bands.length; nodes.set(node.name, node); });
      // a band name can carry a vendor group icon too: "Accounts{aws/account}"
      const label = band[1].match(/^(.*?)(?:\{([a-z0-9-]+\/[a-z0-9-]+)\})?$/);
      bands.push({ name: label[1].trim(), icon: label[2] ? vendorIcon(label[2]) : "", nodes: list });
      continue;
    }
    const link = line.match(/^(.+?)\s*(-->|->)\s*(.+?)(?::\s*(.+))?$/);
    if (!link) throw new Error(`layers: can't read "${line}"`);
    const [from, to] = [nodes.get(link[1].trim()), nodes.get(link[3].trim())];
    if (!from || !to) throw new Error(`layers: "${line}" names a box no band declares`);
    links.push({ from, to, dashed: link[2] === "-->", label: link[4] || "" });
  }
  // band names are 11px monospace capitals with letter spacing: about 8.4px a character
  const labelW = Math.max(110, ...bands.map((b) => Math.ceil(b.name.length * 8.4) + 32 + (b.icon ? 26 : 0)));
  const slotW = Math.max(150, ...[...nodes.values()].map((n) => nodeWidth(n) + 22));
  const perBand = Math.max(...bands.map((b) => b.nodes.length));
  const width = labelW + perBand * slotW + 16;
  const bandH = 64, gap = 52, top = 10, boxH = 40;
  const parts = [];
  bands.forEach((band, b) => {
    const y = top + b * (bandH + gap);
    const bandIcon = band.icon ? `<image class="gv-vendor-icon" href="/field-guides/icons/${band.icon}.svg?v=${VENDOR_VERSION}" x="14" y="${y + bandH / 2 - 10}" width="20" height="20" aria-hidden="true"/>` : "";
    parts.push(`<rect class="gv-band" x="4" y="${y}" width="${width - 8}" height="${bandH}" rx="6"/>${bandIcon}<text class="gv-band-label" x="${band.icon ? 42 : 16}" y="${y + bandH / 2 + 4}">${esc(band.name.toUpperCase())}</text>`);
    const slot = (width - labelW - 16) / band.nodes.length;
    band.nodes.forEach((node, i) => {
      node.cx = labelW + slot * i + slot / 2;
      node.w = Math.min(slot - 18, nodeWidth(node) + 6);
      node.top = y + (bandH - boxH) / 2;
    });
  });
  const height = top * 2 + bands.length * bandH + (bands.length - 1) * gap;
  // where several links leave or reach the same edge of a box, spread their
  // end points along it (ordered by the other end's position) so they don't
  // pile onto one spot
  const ends = new Map();
  const endKey = (node, side) => `${node.name}|${side}`;
  links.forEach((link) => {
    if (link.from.band === link.to.band) return;
    const down = link.to.band > link.from.band;
    for (const [node, side, other] of [[link.from, down ? "b" : "t", link.to], [link.to, down ? "t" : "b", link.from]]) {
      const key = endKey(node, side);
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push({ link, other });
    }
  });
  const offset = new Map();
  for (const [key, list] of ends) {
    const node = nodes.get(key.split("|")[0]);
    const step = list.length > 1 ? Math.min(26, (node.w * 0.6) / (list.length - 1)) : 0;
    list.sort((a, b) => a.other.cx - b.other.cx).forEach((entry, i) => offset.set(`${key}|${links.indexOf(entry.link)}`, (i - (list.length - 1) / 2) * step));
  }
  const at = (node, side, link) => node.cx + (offset.get(`${endKey(node, side)}|${links.indexOf(link)}`) || 0);
  // links first, so boxes sit on top of them; curves from bottom to top edges
  links.forEach((link) => {
    const { from, to, dashed, label } = link;
    let d, lx, ly;
    const between = from.band === to.band && bands[from.band].nodes.some((n) => n !== from && n !== to && (n.cx - from.cx) * (n.cx - to.cx) < 0);
    if (between) {
      // same band with boxes in the way: arc underneath the band instead
      const y1 = from.top + boxH + 2, y2 = to.top + boxH + 6;
      d = `M${from.cx} ${y1} C${from.cx} ${y1 + 36}, ${to.cx} ${y2 + 36}, ${to.cx} ${y2}`;
      lx = (from.cx + to.cx) / 2; ly = y1 + 32;
    } else if (from.band === to.band) {
      const dir = to.cx > from.cx ? 1 : -1;
      const x1 = from.cx + dir * (from.w / 2 + 2), x2 = to.cx - dir * (to.w / 2 + 6), y1 = from.top + boxH / 2;
      d = `M${x1} ${y1} H${x2}`;
      // a label wider than the gap between the boxes goes above them instead
      lx = (x1 + x2) / 2; ly = textWidth(label, 11) > Math.abs(x2 - x1) - 8 ? from.top - 6 : y1 - 8;
    } else {
      const down = to.band > from.band;
      const x1 = at(from, down ? "b" : "t", link), x2 = at(to, down ? "t" : "b", link);
      const y1 = down ? from.top + boxH + 2 : from.top - 2;
      const y2 = down ? to.top - 6 : to.top + boxH + 6;
      const bend = (y2 - y1) / 2;
      d = `M${x1} ${y1} C${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
      // label a third of the way along, nearer its source, so labels on
      // converging links don't stack where the curves meet
      const t = 0.35, u = 1 - t;
      lx = u ** 3 * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x2;
      ly = u ** 3 * y1 + 3 * u * u * t * (y1 + bend) + 3 * u * t * t * (y2 - bend) + t ** 3 * y2 + 4;
    }
    parts.push(`<path class="gv-arrow gv-link${dashed ? " gv-dashed" : ""}" d="${d}" marker-end="url(#${id}-head)"/>`);
    if (label) parts.push(`<text class="gv-label gv-link-label" x="${lx}" y="${ly}" text-anchor="middle">${esc(label)}</text>`);
  });
  for (const node of nodes.values()) parts.push(box(node, node.cx - node.w / 2, node.top, node.w, boxH));
  const described = [
    ...bands.map((b) => `${b.name}: ${b.nodes.map((n) => n.name).join(", ")}`),
    ...links.map((l) => `${l.from.name} to ${l.to.name}${l.label ? `: ${l.label}` : ""}`)
  ];
  return figure(id, "layers", `<svg class="gv-svg gv-layers-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Architecture: ${esc(bands.map((b) => b.name).join(", "))}</title>${marker(id)}${parts.join("")}</svg>`, described);
};

/* ---------- bars: a labelled bar chart ---------- */
const bars = (source, id) => {
  const rows = source.split("\n").filter((l) => l.trim()).map((line) => {
    const [label, value, unit = ""] = line.split(/\s::\s/).map((s) => s.trim());
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`bars: "${line}" needs "Label :: number :: unit"`);
    return { label, value: n, unit };
  });
  const max = Math.max(...rows.map((r) => r.value));
  // labels are right-aligned against the bars; capitals run wide, so allow extra
  const labelW = Math.ceil(Math.max(...rows.map((r) => textWidth(r.label, 13))) * 1.15) + 16;
  const barW = 420, rowH = 34, valueW = Math.max(...rows.map((r) => textWidth(`${r.value} ${r.unit}`, 12))) + 16;
  const width = labelW + barW + valueW + 8;
  const height = rows.length * rowH + 8;
  const parts = rows.map((r, i) => {
    const y = 4 + i * rowH;
    const w = Math.max(3, Math.round((r.value / max) * barW));
    return `<text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(r.label)}</text><rect class="gv-bar-track" x="${labelW}" y="${y + 7}" width="${barW}" height="${rowH - 14}" rx="3"/><rect class="gv-bar" data-n="${(i % 6) + 1}" x="${labelW}" y="${y + 7}" width="${w}" height="${rowH - 14}" rx="3"/><text class="gv-label" x="${labelW + w + 8}" y="${y + rowH / 2 + 4}">${esc(`${r.value.toLocaleString("en-GB")} ${r.unit}`.trim())}</text>`;
  });
  const described = rows.map((r) => `${r.label}: ${r.value} ${r.unit}`.trim());
  return figure(id, "bars", `<svg class="gv-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Chart: ${esc(described.join("; "))}</title>${parts.join("")}</svg>`, described);
};

/* ---------- anatomy ---------- */
const anatomy = (source) => {
  const segments = source.split("\n").filter((l) => l.trim()).map((line) => {
    const [part, caption] = line.split(/\s::\s/);
    // separators keep their spaces (" via "); captioned parts are trimmed
    return caption === undefined ? { part, caption: "" } : { part: part.trim(), caption: caption.trim() };
  });
  let n = 0;
  const html = segments.map((s) => s.caption
    ? `<span class="gv-seg" data-n="${(n++ % 6) + 1}"><code>${esc(s.part)}</code><small>${esc(s.caption)}</small></span>`
    : `<span class="gv-sep"><code>${esc(s.part)}</code></span>`).join("");
  const plain = segments.map((s) => s.part).join("");
  // long values (URLs) read better one part per row, caption beside it
  const stacked = plain.length > 64 ? " gv-anatomy-stack" : "";
  return `<figure class="gv gv-anatomy${stacked}"><div class="gv-anatomy-row" role="img" aria-label="${esc(`${plain}: ${segments.filter((s) => s.caption).map((s) => `${s.part} is the ${s.caption}`).join("; ")}`)}">${html}</div><figcaption class="gv-anatomy-plain"><code>${esc(plain)}</code></figcaption></figure>`;
};

/* ---------- terms ---------- */
const terms = (source) => {
  const cards = source.split("\n").filter((l) => l.trim()).map((line) => {
    const [term, ...rest] = line.split(/\s::\s/);
    if (!rest.length) throw new Error(`terms: "${line}" needs "Term :: definition"`);
    return `<div class="gv-term"><dt>${inline(term.trim())}</dt><dd>${inline(rest.join(" :: ").trim())}</dd></div>`;
  });
  return `<dl class="gv-terms">${cards.join("")}</dl>`;
};


/* ---------- figure: an official vendor diagram, with its credit ---------- */
// field-guides/media/<vendor>/<file>, reused under the vendor's licence (see
// the README there). Size comes from the file, so the page never shifts.
const MEDIA = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "field-guides", "media");
const imageSize = (file) => {
  const buf = readFileSync(file);
  if (file.endsWith(".svg")) {
    const vb = buf.toString("utf8").match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
    if (!vb) throw new Error(`figure: ${file} has no viewBox`);
    return [Math.round(Number(vb[1])), Math.round(Number(vb[2]))];
  }
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error(`figure: ${file} isn't SVG or WebP`);
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  const bits = buf.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
};
const figureBlock = (source) => {
  const f = Object.fromEntries(source.split("\n").filter((l) => l.trim()).map((line) => {
    const i = line.indexOf(":");
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }));
  for (const key of ["src", "alt", "caption", "credit", "source", "licence"]) if (!f[key]) throw new Error(`figure: missing ${key}`);
  if (!/^https:\/\//.test(f.source)) throw new Error(`figure: source must be https`);
  const file = resolve(MEDIA, f.src);
  if (!existsSync(file)) throw new Error(`figure: no field-guides/media/${f.src}`);
  const [w, h] = imageSize(file);
  const url = `/field-guides/media/${f.src}?v=${VENDOR_VERSION}`;
  return `<figure class="gv gv-official"><a class="gv-official-image" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" width="${w}" height="${h}" alt="${esc(f.alt)}" loading="lazy" decoding="async" /><span class="visually-hidden"> (opens full size in a new tab)</span></a><figcaption><span>${inline(f.caption)}</span><small>Diagram: <a href="${esc(f.source)}" rel="noreferrer" target="_blank">${esc(f.credit)}<span class="visually-hidden"> (opens in a new tab)</span></a> · ${esc(f.licence)}</small></figcaption></figure>`;
};

/* ---------- decide: a decision flowchart ---------- */
//   ```decide
//   start :: Request arrives: implicitly denied
//   Explicit deny in any policy? :: yes :: Denied
//   An allow in the identity policy? :: no :: Denied
//   end :: Allowed
//   ```
// Each question exits right on the given answer, and carries on down on the
// other one. Outcomes containing "deny/denied/block" go red, "allow" green.
const decide = (source, id) => {
  const rows = source.split("\n").filter((l) => l.trim()).map((line) => line.split(/\s::\s/).map((s) => s.trim()));
  const start = rows.find((r) => r[0] === "start")?.[1];
  const end = rows.find((r) => r[0] === "end")?.[1];
  const steps = rows.filter((r) => r[0] !== "start" && r[0] !== "end");
  if (!start || !end || steps.some((r) => r.length !== 3)) throw new Error("decide: needs start, end and \"Question? :: answer :: outcome\" lines");
  const tone = (text) => (/den(y|ied)|block|not allowed/i.test(text) ? "deny" : /allow/i.test(text) ? "allow" : "neutral");
  const other = (answer) => (/^yes$/i.test(answer) ? "No" : /^no$/i.test(answer) ? "Yes" : "Otherwise");
  const qW = Math.max(300, ...steps.map((r) => textWidth(r[0], 13) + 40), textWidth(start, 13) + 40, textWidth(end, 13) + 40);
  const outW = Math.max(130, ...steps.map((r) => textWidth(r[2], 13) + 36));
  const cx = 16 + qW / 2, outX = 16 + qW + 96;
  const width = outX + outW + 16;
  const boxH = 44, gap = 34;
  const parts = [];
  let y = 12;
  const pill = (x, yy, w, text, t) => `<g class="gv-outcome" data-tone="${t}"><rect x="${x}" y="${yy}" width="${w}" height="${boxH}" rx="${boxH / 2}"/><text x="${x + w / 2}" y="${yy + boxH / 2 + 5}" text-anchor="middle">${esc(text)}</text></g>`;
  parts.push(`<g class="gv-step"><rect x="16" y="${y}" width="${qW}" height="${boxH}" rx="6"/><text x="${cx}" y="${y + boxH / 2 + 5}" text-anchor="middle">${esc(start)}</text></g>`);
  y += boxH;
  steps.forEach(([question, answer, outcome], i) => {
    // the arrow down into each question carries the previous one's other answer
    parts.push(`<line class="gv-arrow" x1="${cx}" y1="${y + 2}" x2="${cx}" y2="${y + gap - 6}" marker-end="url(#${id}-head)"/>`);
    if (i) parts.push(`<text class="gv-label" x="${cx + 8}" y="${y + gap / 2 + 4}">${esc(other(steps[i - 1][1]))}</text>`);
    y += gap;
    parts.push(`<g class="gv-question"><rect x="16" y="${y}" width="${qW}" height="${boxH}" rx="6"/><text x="${cx}" y="${y + boxH / 2 + 5}" text-anchor="middle">${esc(question)}</text></g>`);
    parts.push(`<line class="gv-arrow" x1="${16 + qW + 2}" y1="${y + boxH / 2}" x2="${outX - 6}" y2="${y + boxH / 2}" marker-end="url(#${id}-head)"/><text class="gv-label" x="${16 + qW + 48}" y="${y + boxH / 2 - 8}" text-anchor="middle">${esc(answer[0].toUpperCase() + answer.slice(1))}</text>`);
    parts.push(pill(outX, y, outW, outcome, tone(outcome)));
    y += boxH;
  });
  parts.push(`<line class="gv-arrow" x1="${cx}" y1="${y + 2}" x2="${cx}" y2="${y + gap - 6}" marker-end="url(#${id}-head)"/><text class="gv-label" x="${cx + 8}" y="${y + gap / 2 + 4}">${esc(other(steps[steps.length - 1][1]))}</text>`);
  y += gap;
  const endW = Math.max(160, textWidth(end, 13) + 36);
  parts.push(pill(cx - endW / 2, y, endW, end, tone(end)));
  const height = y + boxH + 12;
  const described = [`Start: ${start}`, ...steps.map(([q, a, o]) => `${q} If ${a}: ${o}.`), `Otherwise: ${end}`];
  return figure(id, "decide", `<svg class="gv-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Decision flow: ${esc(start)}</title>${marker(id)}${parts.join("")}</svg>`, described);
};

const marker = (id) => `<defs><marker id="${id}-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="gv-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
const NAMES = { sequence: "Sequence diagram", flow: "Flow diagram", layers: "Architecture map", bars: "Chart", decide: "Decision flow" };
const figure = (id, type, svg, described) =>
  `<figure class="gv gv-${type}"><div class="gv-scroll" tabindex="0" role="group" aria-label="${NAMES[type]}, scrolls sideways">${svg}</div><ul class="visually-hidden">${described.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></figure>`;

const RENDERERS = { sequence, flow, layers, bars, decide, anatomy, terms, figure: figureBlock };

// Swaps every visual fence for a placeholder line before markdown runs, then
// back for the rendered block afterwards (markdown would escape the HTML).
export const extractVisuals = (markdown, prefix) => {
  const blocks = [];
  const text = markdown.replace(/^```(sequence|flow|layers|bars|decide|figure|anatomy|terms)\n([\s\S]*?)^```$/gm, (_, type, body) => {
    const id = `${prefix}-${type}-${blocks.length + 1}`;
    blocks.push(RENDERERS[type](body.replace(/\n$/, ""), id));
    return `GUIDEVISUAL${blocks.length - 1}END`;
  });
  return { text, restore: (html) => html.replace(/<p>GUIDEVISUAL(\d+)END<\/p>/g, (_, i) => blocks[Number(i)]) };
};

// A guide's signature icons, for its card and header: the official vendor
// icons its diagrams use (first five), or else the site's own glyphs, drawn
// with attributes rather than classes so the strip also works on the
// homepage, which doesn't load field-guides.css.
export const iconStrip = (markdown, size = 22, chosen = null) => {
  // a guide can name its own (guides.json "icons"); otherwise take them from its diagrams
  const found = chosen || [...new Set([...markdown.matchAll(/\{([a-z0-9-]+(?:\/[a-z0-9-]+)?)\}/g)].map((m) => m[1]))];
  for (const name of chosen || []) if (!ICONS[name] && !name.includes("/")) throw new Error(`iconStrip: unknown icon "${name}"`);
  if (chosen) chosen.filter((name) => name.includes("/")).forEach(vendorIcon);
  const vendor = found.filter((name) => name.includes("/") && existsSync(resolve(VENDOR_ICONS, `${name}.svg`)));
  const own = found.filter((name) => ICONS[name]);
  const pick = chosen ? chosen.slice(0, 6) : (vendor.length >= 3 ? vendor : [...vendor, ...own]).slice(0, 5);
  return pick.map((name) => (name.includes("/")
    ? `<img src="/field-guides/icons/${name}.svg?v=${VENDOR_VERSION}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" />`
    : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`)).join("");
};
