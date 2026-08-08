/* Live readouts for /design/. The page documents the design system, so it
   reads the system rather than restating it: every colour ratio, type size and
   column count printed on that page is measured from the live computed styles
   at the current viewport and theme. If a token changes and stops clearing
   WCAG AA, the page says so on sight instead of going quietly wrong. */

const AA_TEXT = 4.5;
const AA_LARGE = 3;
const AAA_TEXT = 7;

/* sRGB channel to linear light, per WCAG 2.x relative luminance. */
const toLinear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* Resolve any CSS colour — token, hex, rgb() — to [r, g, b] by letting the
   browser do it. Colours with alpha are composited over the page background
   first, because that is what the eye actually compares against. */
const probe = document.createElement("span");
probe.setAttribute("aria-hidden", "true");
probe.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none";

const parseColor = (value, over) => {
  probe.style.color = "";
  probe.style.color = value;
  if (!probe.style.color) return null;
  document.body.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const parts = computed.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  const rgb = parts.slice(0, 3).map(Number);
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  if (alpha >= 1 || !over) return rgb;
  return rgb.map((channel, index) => Math.round(channel * alpha + over[index] * (1 - alpha)));
};

const toHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/* Tokens are read off <body>, not <html>: the light theme overrides the same
   token names on body.light-mode, so the root element still reports the dark
   values while the page is showing light ones. */
const pageBackground = () => {
  const page = getComputedStyle(document.body);
  return parseColor(page.getPropertyValue("--bg").trim()) || [0, 0, 0];
};

/* One swatch row: resolved value, measured ratio against the page, and the
   highest WCAG grade it earns at the size it is actually used. */
const renderSwatches = () => {
  const background = pageBackground();
  document.querySelectorAll("[data-token]").forEach((element) => {
    const token = element.dataset.token;
    const against = element.dataset.against
      ? parseColor(
          getComputedStyle(document.body).getPropertyValue(element.dataset.against).trim(),
        ) || background
      : background;
    const raw = getComputedStyle(document.body).getPropertyValue(token).trim();
    const rgb = parseColor(raw, against);
    if (!rgb) return;

    const ratio = contrastRatio(rgb, against);
    const large = element.dataset.size === "large";
    const floor = large ? AA_LARGE : AA_TEXT;
    let grade = "fails AA";
    if (ratio >= AAA_TEXT && !large) grade = "AAA";
    else if (ratio >= floor) grade = "AA";

    const valueSlot = element.querySelector("[data-token-value]");
    const ratioSlot = element.querySelector("[data-token-ratio]");
    const gradeSlot = element.querySelector("[data-token-grade]");
    if (valueSlot) valueSlot.textContent = toHex(rgb);
    if (ratioSlot) ratioSlot.textContent = `${ratio.toFixed(2)}:1`;
    if (gradeSlot) {
      gradeSlot.textContent = grade;
      gradeSlot.classList.toggle("is-failing", grade === "fails AA");
    }
  });
};

/* Type ladder: the sizes are clamps, so the only honest way to state them is
   to measure the rendered sample at this viewport. Rows measure a real element
   playing that role — the page's own h1 for the hero step, the section
   headings for the rest — so the ladder cannot drift from the stylesheet. */
const renderTypeMetrics = () => {
  document.querySelectorAll("[data-measure]").forEach((element) => {
    const sample = element.dataset.measureTarget
      ? document.querySelector(element.dataset.measureTarget)
      : element.querySelector("[data-measure-sample]");
    const slot = element.querySelector("[data-measure-out]");
    if (!sample || !slot) return;
    const style = getComputedStyle(sample);
    const size = Math.round(Number.parseFloat(style.fontSize));
    const leading = Math.round(Number.parseFloat(style.lineHeight));
    slot.textContent = Number.isFinite(leading)
      ? `${size}px / ${leading}px · ${style.fontWeight}`
      : `${size}px · ${style.fontWeight}`;
  });
};

/* Column count and section rhythm both come from tokens that change at the
   breakpoints, so they are read live too. */
const renderLayoutMetrics = () => {
  const page = getComputedStyle(document.body);
  const columns = Number.parseInt(page.getPropertyValue("--grid-cols"), 10) || 1;
  const grid = document.querySelector("[data-grid-demo]");
  if (grid && grid.childElementCount !== columns) {
    grid.replaceChildren(
      ...Array.from({ length: columns }, () => {
        const cell = document.createElement("span");
        cell.className = "design-grid-cell";
        return cell;
      }),
    );
  }
  if (grid) {
    grid.setAttribute("role", "img");
    grid.setAttribute("aria-label", `Column model at this viewport: ${columns} columns`);
  }
  document.querySelectorAll("[data-grid-count]").forEach((slot) => {
    slot.textContent = String(columns);
  });
  document.querySelectorAll("[data-layout-token]").forEach((element) => {
    const token = element.dataset.layoutToken;
    const probeEl = document.createElement("div");
    probeEl.style.cssText = `position:absolute;visibility:hidden;height:var(${token})`;
    document.body.append(probeEl);
    const px = Math.round(probeEl.getBoundingClientRect().height);
    probeEl.remove();
    const slot = element.querySelector("[data-layout-out]");
    const bar = element.querySelector("[data-layout-bar]");
    if (slot) slot.textContent = `${px}px`;
    if (bar) bar.style.height = `${px}px`;
  });
};

const renderAll = () => {
  renderSwatches();
  renderTypeMetrics();
  renderLayoutMetrics();
};

export function initDesignReadouts() {
  if (!document.querySelector("[data-token], [data-measure], [data-grid-demo]")) return;

  renderAll();

  /* theme.js toggles .light-mode on <body>; re-measure when it does. */
  new MutationObserver(renderAll).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  let frame = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderAll);
  });

  /* Webfonts land after first paint and change the measured metrics. */
  if (document.fonts?.ready) document.fonts.ready.then(renderAll);
}
