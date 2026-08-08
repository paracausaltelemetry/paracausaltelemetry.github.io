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

// Quiet typographic row: name + issuer, one-line summary, verification link.
const createCertification = ({ title, description, issuer, verificationUrl, resourceUrl, resourceLabel, inProgress }) => {
  const item = document.createElement("article");
  item.className = "credential-row";
  const linkUrl = verificationUrl || resourceUrl || "";

  const head = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  head.append(heading);

  if (issuer || inProgress) {
    const meta = document.createElement("span");
    meta.className = "credential-row-issuer";
    meta.textContent = issuer || "";
    if (inProgress) {
      const flag = document.createElement("span");
      flag.className = "progress-flag";
      flag.textContent = "In progress";
      meta.append(" ", flag);
    }
    head.append(meta);
  }
  item.append(head);

  const desc = document.createElement("p");
  desc.className = "credential-row-desc";
  desc.textContent = description || "";
  item.append(desc);

  if (linkUrl) {
    const link = document.createElement("a");
    link.className = "credential-row-link";
    link.href = linkUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = verificationUrl ? "Verify credential" : resourceLabel || "View course";
    item.append(link);
  }

  return item;
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

  // The summary reads as a dictionary entry, so the headword before the colon
  // carries its own weight. Falls back to plain text if there is no colon.
  const heroSummary = document.getElementById("hero-summary");
  if (heroSummary) {
    const summary = portfolio.profile.summary;
    const colon = summary.indexOf(":");
    if (colon === -1) {
      heroSummary.textContent = summary;
    } else {
      const term = document.createElement("span");
      term.className = "hero-term";
      term.textContent = summary.slice(0, colon);
      heroSummary.replaceChildren(term, document.createTextNode(summary.slice(colon)));
    }
  }

  const heroActions = document.getElementById("hero-actions");
  heroActions?.append(
    createAction(portfolio.profile.primaryAction, "primary"),
    createAction(portfolio.profile.secondaryAction, "secondary")
  );

  const certificationGrid = document.getElementById("certification-grid");
  portfolio.certifications
    .filter((cert) => cert.featured)
    .forEach((cert) => certificationGrid?.append(createCertification(cert)));
}
