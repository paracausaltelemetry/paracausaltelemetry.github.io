import { setText } from "./utils.js?v=276fa973";

const SITE_URL = "https://paracausaltelemetry.com/";

const syncRuntimeMetadata = () => {
  const socialImageUrl = new URL("./src/social-preview.png?v=pt", SITE_URL).href;
  document.title = "Paracausal Telemetry | Portfolio";
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", SITE_URL);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", SITE_URL);
  document.querySelector('meta[property="og:image"]')?.setAttribute("content", socialImageUrl);
  document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", socialImageUrl);
  document.querySelectorAll("[data-site-link]").forEach((link) => link.setAttribute("href", SITE_URL));
};

const createAction = ({ label, href }, variant) => {
  const link = document.createElement("a");
  link.className = `action ${variant}`;
  link.href = href;
  link.textContent = label;
  if (/^(https?:|mailto:)/i.test(href)) {
    link.target = "_blank";
    link.rel = "noreferrer";
  }
  return link;
};

export function initPlatform(portfolio) {
  syncRuntimeMetadata();

  setText("brand-name", portfolio.profile.name);
  setText("brand-role", portfolio.profile.role);

  // Headline with the closing full stop in the signal colour.
  const heroTitle = document.getElementById("hero-title");
  if (heroTitle) {
    const headline = portfolio.profile.headline;
    const endsWithStop = headline.endsWith(".");
    heroTitle.replaceChildren(document.createTextNode(endsWithStop ? headline.slice(0, -1) : headline));
    if (endsWithStop) {
      const stop = document.createElement("span");
      stop.className = "signal-stop";
      stop.textContent = ".";
      heroTitle.append(stop);
    }
  }

  const heroActions = document.getElementById("hero-actions");
  heroActions?.append(
    createAction(portfolio.profile.primaryAction, "primary"),
    createAction(portfolio.profile.secondaryAction, "secondary")
  );
}
