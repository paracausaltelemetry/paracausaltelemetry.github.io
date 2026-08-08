// Homepage weather panel. The point is the demonstration: this site never asks
// for a location, yet an IP address alone places you well enough to forecast
// your weather. Nothing leaves the browser until the visitor asks for it, and
// the lookup names both third parties before it runs.

const GEO_ENDPOINT = "https://ipwho.is/";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CACHE_KEY = "ws-weather-v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
const HOURS_SHOWN = 6;

/* ---------------------------------------------------------------- detectors */
/* Local, zero-network signals. Carried over from the footprint widget this
   panel replaces: they cost nothing and they make the exposure concrete. */

const detectBrowser = () => {
  const userAgent = navigator.userAgent;
  const matchers = [
    { label: "Edge", pattern: /Edg\/([\d.]+)/ },
    { label: "Opera", pattern: /OPR\/([\d.]+)/ },
    { label: "Chrome", pattern: /Chrome\/([\d.]+)/ },
    { label: "Firefox", pattern: /Firefox\/([\d.]+)/ },
    { label: "Safari", pattern: /Version\/([\d.]+).*Safari/ }
  ];

  for (const matcher of matchers) {
    const match = userAgent.match(matcher.pattern);
    if (match) return `${matcher.label} ${match[1].split(".")[0]}`;
  }

  if (navigator.userAgentData?.brands?.length) {
    return navigator.userAgentData.brands
      .map(({ brand, version }) => `${brand} ${String(version).split(".")[0]}`)
      .join(", ");
  }

  return "Unavailable";
};

const detectOperatingSystem = () => {
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/CrOS/i.test(userAgent)) return "ChromeOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return navigator.userAgentData?.platform || navigator.platform || "Unavailable";
};

const getLanguageInfo = () => {
  const languages = Array.isArray(navigator.languages) ? navigator.languages.filter(Boolean) : [];
  if (languages.length > 1) return languages.slice(0, 2).join(", ");
  return navigator.language || languages[0] || "Unavailable";
};

const getTimeZoneInfo = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Unavailable";
  } catch {
    return "Unavailable";
  }
};

const getScreenInfo = () => {
  const { width, height } = window.screen;
  if (!width || !height) return "Unavailable";
  const ratio = window.devicePixelRatio && window.devicePixelRatio !== 1 ? ` @${window.devicePixelRatio}x` : "";
  return `${width}×${height}${ratio}`;
};

// DNT is deprecated but still widely sent; GPC is its successor. Either one
// counts as the visitor signalling a privacy preference.
const getPrivacySignal = () => {
  const gpc = navigator.globalPrivacyControl === true;
  const dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
  if (gpc && dnt) return "GPC + DNT";
  if (gpc) return "GPC sent";
  if (dnt) return "DNT sent";
  return "None sent";
};

/* -------------------------------------------------------------------- icons */
/* Built as real SVG nodes rather than markup: no remote images, nothing to
   sanitise, and currentColor keeps them theme-aware. */

const SVGNS = "http://www.w3.org/2000/svg";

const svgShape = (tag, attrs) => {
  const node = document.createElementNS(SVGNS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

const CLOUD = ["path", { d: "M17.5 18.5H8a4.5 4.5 0 1 1 1.2-8.84A6 6 0 0 1 20.6 11a3.75 3.75 0 0 1-3.1 7.5Z" }];

const ICONS = {
  sun: [
    ["circle", { cx: 12, cy: 12, r: 4.2 }],
    ["path", { d: "M12 2.6v2.1M12 19.3v2.1M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5" }]
  ],
  partly: [
    ["path", { d: "M8.2 5.1V3.4M4.5 6.6 3.3 5.4M4.1 10.8H2.4M12.6 6.6l1.2-1.2" }],
    ["circle", { cx: 8.2, cy: 10.2, r: 2.6 }],
    CLOUD
  ],
  cloud: [CLOUD],
  fog: [
    ["path", { d: "M4 8.5h16M6 12.5h14M3 16.5h13M8 20.5h11" }]
  ],
  drizzle: [CLOUD, ["path", { d: "M9 20.6v1.3M13 20.6v1.3M17 20.6v1.3" }]],
  rain: [CLOUD, ["path", { d: "M8.8 20.3 8 22.6M12.8 20.3l-.8 2.3M16.8 20.3l-.8 2.3" }]],
  snow: [CLOUD, ["path", { d: "M9 21.2h.01M13 21.2h.01M17 21.2h.01M11 22.8h.01M15 22.8h.01" }]],
  thunder: [CLOUD, ["path", { d: "M13.2 19.6 10.8 22.9h3l-1.4 2.2" }]]
};

// WMO weather interpretation codes, as returned by Open-Meteo.
const WEATHER_CODES = new Map([
  [0, ["Clear sky", "sun"]],
  [1, ["Mainly clear", "partly"]],
  [2, ["Partly cloudy", "partly"]],
  [3, ["Overcast", "cloud"]],
  [45, ["Fog", "fog"]],
  [48, ["Freezing fog", "fog"]],
  [51, ["Light drizzle", "drizzle"]],
  [53, ["Drizzle", "drizzle"]],
  [55, ["Heavy drizzle", "drizzle"]],
  [56, ["Freezing drizzle", "drizzle"]],
  [57, ["Freezing drizzle", "drizzle"]],
  [61, ["Light rain", "rain"]],
  [63, ["Rain", "rain"]],
  [65, ["Heavy rain", "rain"]],
  [66, ["Freezing rain", "rain"]],
  [67, ["Freezing rain", "rain"]],
  [71, ["Light snow", "snow"]],
  [73, ["Snow", "snow"]],
  [75, ["Heavy snow", "snow"]],
  [77, ["Snow grains", "snow"]],
  [80, ["Light showers", "rain"]],
  [81, ["Showers", "rain"]],
  [82, ["Heavy showers", "rain"]],
  [85, ["Snow showers", "snow"]],
  [86, ["Snow showers", "snow"]],
  [95, ["Thunderstorm", "thunder"]],
  [96, ["Thunderstorm, hail", "thunder"]],
  [99, ["Thunderstorm, hail", "thunder"]]
]);

const describeWeather = (code) => WEATHER_CODES.get(Number(code)) ?? ["Unavailable", "cloud"];

const iconNode = (name, label) => {
  const svg = svgShape("svg", {
    class: "weather-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    focusable: "false"
  });

  if (label) {
    svg.setAttribute("role", "img");
    const title = svgShape("title", {});
    title.textContent = label;
    svg.append(title);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  for (const [tag, attrs] of ICONS[name] ?? ICONS.cloud) svg.append(svgShape(tag, attrs));
  return svg;
};

/* --------------------------------------------------------------- networking */
/* Same shape as the widget this replaces: an abort timeout, a throw on a bad
   response, and a bare catch so a failure never escapes to the caller. */

const fetchJson = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const resolveLocation = async () => {
  const payload = await fetchJson(GEO_ENDPOINT, 3500);
  if (!payload || payload.success === false) return null;

  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    ip: typeof payload.ip === "string" ? payload.ip : "",
    city: typeof payload.city === "string" ? payload.city : "",
    region: typeof payload.region === "string" ? payload.region : "",
    country: typeof payload.country === "string" ? payload.country : "",
    isp: payload.connection?.isp || payload.connection?.org || "",
    latitude,
    longitude
  };
};

const resolveForecast = async (latitude, longitude) => {
  const query = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "2"
  });

  const payload = await fetchJson(`${WEATHER_ENDPOINT}?${query}`, 4500);
  return payload?.current ? payload : null;
};

/* ------------------------------------------------------------------ caching */
/* A short session cache so a second click costs nothing. Every storage access
   is guarded: private mode and full quotas must not break the panel. */

const readCache = () => {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // A full or unavailable store just means the next click refetches.
  }
};

/* ---------------------------------------------------------------- rendering */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const roundTemp = (value) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°` : "--");

const formatHour = (isoTime) => {
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return String(isoTime).slice(11, 16);
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

/* Networks arrive as full legal entities ("British Telecommunications Limited"),
   which wrap to three lines in a narrow cell. Fold the best-known carriers down
   to the name people actually use, then strip any trailing legal suffix. The
   untrimmed value stays in the cell's title attribute. */
const NETWORK_ALIASES = [
  [/^british telecommunications/i, "BT"],
  [/^virgin media/i, "Virgin Media"],
  [/^sky (uk|broadband|telecommunications)/i, "Sky"],
  [/^talktalk/i, "TalkTalk"],
  [/^ee\b/i, "EE"],
  [/^vodafone/i, "Vodafone"],
  [/^hyperoptic/i, "Hyperoptic"],
  [/^plusnet/i, "Plusnet"],
  [/^deutsche telekom/i, "Deutsche Telekom"],
  [/^comcast/i, "Comcast"],
  [/^at&t/i, "AT&T"],
  [/^verizon/i, "Verizon"],
  [/^amazon/i, "Amazon"],
  [/^google/i, "Google"],
  [/^microsoft/i, "Microsoft"],
  [/^cloudflare/i, "Cloudflare"]
];

const LEGAL_SUFFIX =
  /[\s,]+\(?(limited|ltd|plc|inc|incorporated|llc|corp|corporation|company|co|gmbh|b\.?v|n\.?v|s\.?a|s\.?a\.?s|sarl|srl|s\.?p\.?a|ab|a\/s|oyj?|pty|pte)\.?\)?$/i;

const shortenNetwork = (raw) => {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  const alias = NETWORK_ALIASES.find(([pattern]) => pattern.test(value));
  if (alias) return alias[1];

  let trimmed = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = trimmed.replace(LEGAL_SUFFIX, "").trim();
    if (!next || next === trimmed) break;
    trimmed = next;
  }

  return trimmed.length > 26 ? `${trimmed.slice(0, 25).trimEnd()}...` : trimmed;
};

const placeLabel = ({ city, region, country }) => {
  const parts = [city, region].filter(Boolean);
  const place = [...new Set(parts)].join(", ");
  return place || country || "your area";
};

const buildNow = (forecast) => {
  const current = forecast.current;
  const [label, icon] = describeWeather(current.weather_code);
  const daily = forecast.daily ?? {};

  const now = el("div", "weather-now");
  now.append(iconNode(icon, label));

  const reading = el("div", "weather-now-reading");
  reading.append(el("p", "weather-now-temp", roundTemp(current.temperature_2m)));
  reading.append(el("p", "weather-now-label", label));
  now.append(reading);

  const meta = el("dl", "weather-now-meta");
  const rows = [
    ["Feels like", roundTemp(current.apparent_temperature)],
    ["Wind", Number.isFinite(Number(current.wind_speed_10m)) ? `${Math.round(Number(current.wind_speed_10m))} mph` : "--"],
    ["Today", `${roundTemp(daily.temperature_2m_max?.[0])} / ${roundTemp(daily.temperature_2m_min?.[0])}`]
  ];
  for (const [term, value] of rows) {
    const row = el("div");
    row.append(el("dt", null, term), el("dd", null, value));
    meta.append(row);
  }

  now.append(meta);
  return now;
};

const buildHours = (forecast) => {
  const hourly = forecast.hourly;
  if (!hourly?.time?.length) return null;

  const found = hourly.time.findIndex((time) => time >= forecast.current.time);
  const startIndex = found < 0 ? 0 : found;
  const list = el("ol", "weather-hours");

  for (let index = startIndex; index < Math.min(startIndex + HOURS_SHOWN, hourly.time.length); index += 1) {
    const [label, icon] = describeWeather(hourly.weather_code?.[index]);
    const item = el("li", "weather-hour");
    item.append(el("span", "weather-hour-time", formatHour(hourly.time[index])));
    item.append(iconNode(icon, label));
    item.append(el("strong", "weather-hour-temp", roundTemp(hourly.temperature_2m?.[index])));

    const chance = Number(hourly.precipitation_probability?.[index]);
    item.append(el("small", "weather-hour-rain", Number.isFinite(chance) ? `${chance}%` : ""));
    list.append(item);
  }

  return list;
};

const buildSignals = (location) => {
  const wrap = el("div", "weather-signals");
  wrap.append(el("p", "weather-signals-title", "How this site placed you"));

  const grid = el("div", "weather-signal-grid");
  const cells = [
    ["Public IP", location.ip || "Unavailable"],
    ["Network", shortenNetwork(location.isp) || "Unavailable", location.isp],
    ["Approx. coordinates", `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`],
    ["Browser", detectBrowser()],
    ["Operating system", detectOperatingSystem()],
    ["Language", getLanguageInfo()],
    ["Time zone", getTimeZoneInfo()],
    ["Screen", getScreenInfo()],
    ["Privacy signal", getPrivacySignal()]
  ];

  for (const [label, value, title] of cells) {
    const cell = el("div", "weather-signal");
    const reading = el("strong", null, value);
    if (title && title !== value) reading.title = title;
    cell.append(el("span", null, label), reading);
    grid.append(cell);
  }

  wrap.append(grid);
  wrap.append(
    el(
      "p",
      "weather-signals-note",
      "Only the first three came from the network. The rest your browser volunteered, and every site you open can read them the same way."
    )
  );
  return wrap;
};

const renderForecast = (target, { location, forecast }) => {
  const fragment = document.createDocumentFragment();

  const place = el("div", "weather-place");
  place.append(el("p", "weather-place-name", placeLabel(location)));
  place.append(
    el(
      "p",
      "weather-place-note",
      location.country ? `${location.country} · located from your IP address` : "Located from your IP address"
    )
  );
  fragment.append(place);

  fragment.append(buildNow(forecast));
  const hours = buildHours(forecast);
  if (hours) fragment.append(hours);
  fragment.append(buildSignals(location));

  target.replaceChildren(fragment);
  target.hidden = false;
};

/* ------------------------------------------------------------------- wiring */

export function initWeather() {
  const action = document.querySelector("[data-weather-action]");
  const result = document.querySelector("[data-weather-result]");
  const status = document.querySelector("[data-weather-status]");
  if (!(action instanceof HTMLButtonElement) || !result) return;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  action.addEventListener("click", async () => {
    action.disabled = true;
    action.textContent = "Looking up...";
    setStatus("Asking ipwho.is which location your IP address points to.");

    const cached = readCache();
    if (cached) {
      renderForecast(result, cached);
      setStatus("Restored from this session, so nothing was requested again.");
      action.textContent = "Refresh forecast";
      action.disabled = false;
      return;
    }

    const location = await resolveLocation();
    if (!location) {
      setStatus("The location lookup was unavailable, so no forecast was requested.");
      action.textContent = "Try again";
      action.disabled = false;
      return;
    }

    setStatus(`Asking open-meteo.com for the forecast near ${placeLabel(location)}.`);
    const forecast = await resolveForecast(location.latitude, location.longitude);
    if (!forecast) {
      setStatus("The forecast service was unavailable. Your location still resolved from your IP address.");
      action.textContent = "Try again";
      action.disabled = false;
      return;
    }

    const payload = { location, forecast };
    writeCache(payload);
    renderForecast(result, payload);
    setStatus("Placed from your IP address alone. You were never asked.");
    action.textContent = "Refresh forecast";
    action.disabled = false;
  });
}
