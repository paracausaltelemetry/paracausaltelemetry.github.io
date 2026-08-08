export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
};

export const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const escapeAttribute = (value = "") => escapeHtml(value);

export const updateMetric = (label, value) => {
  const metric = document.querySelector(`[data-metric-label="${label}"] dd`);
  if (metric) metric.textContent = value;
};
