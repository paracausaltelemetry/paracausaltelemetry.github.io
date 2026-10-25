// Visual blocks for the field guides, drawn at build time from small text
// formats in the guide's markdown so a guide stays one readable file:
//
//   ```sequence  who talks to whom, in order (AssumeRole, presigned URLs, OAuth)
//   Client[user] -> STS[security]: AssumeRole(RoleArn)
//   STS -> Client: AccessKeyId ASIA..., SecretKey, SessionToken
//   note: Credentials expire after 1h by default
//   ```
//
//   ```flow      boxes left to right, one row per line
//   App[app] --invoke--> Lambda[compute] --logs--> CloudWatch[mgmt]
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
// compute, storage, security, mgmt, network, app, data, user, external).
// Everything is escaped here; diagrams carry role="img" with a text
// description, and the steps are repeated as a visually hidden list.

import { renderMarkdown } from "../../js/markdown.js?v=276fa973-th";

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

const KINDS = new Set(["compute", "storage", "security", "mgmt", "network", "app", "data", "user", "external"]);
const parseNode = (raw) => {
  const m = raw.trim().match(/^(.*?)(?:\[([a-z]+)\])?$/);
  const kind = KINDS.has(m[2]) ? m[2] : "external";
  return { name: m[1].trim(), kind };
};

/* ---------- sequence ---------- */
const sequence = (source, id) => {
  const actors = new Map();
  const steps = [];
  const actor = (raw) => {
    const node = parseNode(raw);
    if (!actors.has(node.name)) actors.set(node.name, node);
    else if (raw.includes("[")) actors.get(node.name).kind = node.kind;
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
  const colWidth = Math.max(150, ...list.map((a) => textWidth(a.name, 13) + 40));
  let width = Math.max(560, list.length * colWidth);
  const gap = width / list.length;
  list.forEach((a, i) => { a.x = Math.round(gap * i + gap / 2); });
  // labels can be wider than the columns: grow the canvas (and shift the
  // actors right) until every label fits
  let left = 8, right = width - 8;
  steps.forEach((step, i) => {
    if (step.note) return;
    const label = `${i + 1}. ${step.label}`;
    const w = textWidth(label, 12);
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
  const top = 18, boxH = 38, rowH = 46;
  let y = top + boxH + 34;
  const body = [];
  steps.forEach((step, i) => {
    if (step.note) {
      const w = Math.min(width - 24, textWidth(step.note, 12) + 28);
      body.push(`<rect class="gv-note" x="${(width - w) / 2}" y="${y - 16}" width="${w}" height="26" rx="3"/><text class="gv-note-text" x="${width / 2}" y="${y + 1}" text-anchor="middle">${esc(step.note)}</text>`);
      y += rowH - 8;
      return;
    }
    const n = steps.slice(0, i + 1).filter((s) => !s.note).length;
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
    const w = Math.min(gap - 16, textWidth(a.name, 13) + 28);
    return `<g class="gv-node" data-kind="${a.kind}"><rect x="${a.x - w / 2}" y="${top}" width="${w}" height="${boxH}" rx="4"/><text x="${a.x}" y="${top + 24}" text-anchor="middle">${esc(a.name)}</text></g><line class="gv-life" x1="${a.x}" y1="${top + boxH}" x2="${a.x}" y2="${height - 6}"/>`;
  }).join("");
  const described = steps.map((s, i) => s.note ? `Note: ${s.note}` : `${steps.slice(0, i + 1).filter((t) => !t.note).length}. ${s.from.name} to ${s.to.name}: ${s.label}`);
  return figure(id, "sequence", `<svg class="gv-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Sequence: ${esc(list.map((a) => a.name).join(", "))}</title>${marker(id)}${heads}${body.join("")}</svg>`, described);
};

/* ---------- flow ---------- */
const flow = (source, id) => {
  const rows = source.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s*--(?:(.*?)--)?>\s*/);
    // split keeps the captured labels between the nodes: node, label, node, label, node
    const nodes = [], labels = [];
    parts.forEach((part, i) => (i % 2 === 0 ? nodes.push(parseNode(part)) : labels.push(part || "")));
    return { nodes, labels };
  });
  const arrowW = (label) => Math.max(56, textWidth(label, 12) + 20);
  const boxH = 44, rowGap = 30, pad = 12;
  let width = 0;
  rows.forEach((row) => {
    let x = pad;
    row.nodes.forEach((node, i) => {
      node.w = Math.max(96, textWidth(node.name, 13) + 28);
      node.x = x;
      x += node.w;
      if (i < row.labels.length) x += arrowW(row.labels[i]);
    });
    width = Math.max(width, x + pad);
  });
  const parts = [];
  rows.forEach((row, r) => {
    const y = pad + r * (boxH + rowGap);
    row.nodes.forEach((node, i) => {
      parts.push(`<g class="gv-node" data-kind="${node.kind}"><rect x="${node.x}" y="${y}" width="${node.w}" height="${boxH}" rx="4"/><text x="${node.x + node.w / 2}" y="${y + 27}" text-anchor="middle">${esc(node.name)}</text></g>`);
      if (i < row.labels.length) {
        const x1 = node.x + node.w + 4, x2 = row.nodes[i + 1].x - 6, mid = y + boxH / 2;
        parts.push(`<line class="gv-arrow" x1="${x1}" y1="${mid}" x2="${x2}" y2="${mid}" marker-end="url(#${id}-head)"/>`);
        if (row.labels[i]) parts.push(`<text class="gv-label" x="${(x1 + x2) / 2}" y="${mid - 8}" text-anchor="middle">${esc(row.labels[i])}</text>`);
      }
    });
  });
  const height = pad * 2 + rows.length * boxH + (rows.length - 1) * rowGap;
  const described = rows.map((row) => row.nodes.map((n, i) => `${n.name}${i < row.labels.length ? ` (${row.labels[i] || "to"})` : ""}`).join(" → "));
  return figure(id, "flow", `<svg class="gv-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Flow: ${esc(rows.map((r) => r.nodes.map((n) => n.name).join(" to ")).join("; "))}</title>${marker(id)}${parts.join("")}</svg>`, described);
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

const marker = (id) => `<defs><marker id="${id}-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="gv-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
const figure = (id, type, svg, described) =>
  `<figure class="gv gv-${type}"><div class="gv-scroll" tabindex="0" role="group" aria-label="${type === "sequence" ? "Sequence diagram" : "Flow diagram"}, scrolls sideways">${svg}</div><ul class="visually-hidden">${described.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></figure>`;

const RENDERERS = { sequence, flow, anatomy, terms };

// Swaps every visual fence for a placeholder line before markdown runs, then
// back for the rendered block afterwards (markdown would escape the HTML).
export const extractVisuals = (markdown, prefix) => {
  const blocks = [];
  const text = markdown.replace(/^```(sequence|flow|anatomy|terms)\n([\s\S]*?)^```$/gm, (_, type, body) => {
    const id = `${prefix}-${type}-${blocks.length + 1}`;
    blocks.push(RENDERERS[type](body.replace(/\n$/, ""), id));
    return `GUIDEVISUAL${blocks.length - 1}END`;
  });
  return { text, restore: (html) => html.replace(/<p>GUIDEVISUAL(\d+)END<\/p>/g, (_, i) => blocks[Number(i)]) };
};
