// The homepage hero card's hidden signal. The card is the ordinary one, but
// every so often it cuts out for a second or two, like a feed being
// overridden, and shows something else: tartan, and an octopus emblem set in
// type. Then it cuts back. Nothing announces it and there is no control for
// it; it is there for whoever happens to be looking.
//
// The signal is an overlay inside the card, so the card's own title, buttons
// and dither field are untouched underneath and come straight back. It is
// decorative: hidden from assistive technology, never focusable, and it lets
// clicks through. It never plays for a visitor who prefers reduced motion, in
// a hidden tab, with the card off screen, or while the buttons are in use.
//
// /hero-signal.css draws it and /src/hero-signal/emblem.svg (written by
// scripts/build-hero-signal.py) is the emblem; both are fetched when the
// browser is idle, well after the page has painted.

const STYLESHEET = "/hero-signal.css?v=signal1";
const EMBLEM = "/src/hero-signal/emblem.svg?v=signal1";

// All in milliseconds. The cut in and the cut out are CSS animations of these
// lengths; the hold between them varies so it never feels like a timer.
const CUT_IN = 460;
const CUT_OUT = 380;
const HOLD = [1500, 2400];
const FIRST_WAIT = [5000, 10000];
const WAIT = [14000, 32000];
const RETRY = 7000;

const between = ([low, high]) => low + Math.random() * (high - low);

const loadStylesheet = () =>
  new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLESHEET;
    link.addEventListener("load", () => resolve(true));
    link.addEventListener("error", () => resolve(false));
    document.head.append(link);
  });

const loadEmblem = () =>
  fetch(EMBLEM)
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "");

export function initHeroSignal() {
  const card = document.getElementById("hero-card");
  if (!card || card.querySelector(".hero-signal")) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) return;

  let signal = null;
  let onScreen = true;
  let playing = false;
  let timer = 0;

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0.35 }
    ).observe(card);
  }

  const inUse = () => card.contains(document.activeElement) || Boolean(card.querySelector(".hero-actions:hover, .hero-exercise:hover"));

  const schedule = (delay) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(play, delay);
  };

  const step = (name, duration) =>
    new Promise((resolve) => {
      signal.dataset.state = name;
      window.setTimeout(resolve, duration);
    });

  async function play() {
    if (playing) return;
    if (!signal || document.hidden || !onScreen || inUse() || reducedMotion.matches) {
      schedule(RETRY);
      return;
    }
    playing = true;
    signal.hidden = false;
    await step("in", CUT_IN);
    await step("on", between(HOLD));
    await step("out", CUT_OUT);
    signal.hidden = true;
    delete signal.dataset.state;
    playing = false;
    schedule(between(WAIT));
  }

  const build = async () => {
    const [styled, svg] = await Promise.all([loadStylesheet(), loadEmblem()]);
    if (!styled || !svg.startsWith("<svg")) return;
    signal = document.createElement("div");
    signal.className = "hero-signal";
    signal.hidden = true;
    signal.setAttribute("aria-hidden", "true");
    // The emblem is a static file from this origin, written by the build script.
    signal.innerHTML = `<div class="hero-signal-emblem">${svg}</div>`;
    card.append(signal);
    schedule(between(FIRST_WAIT));
    // For anyone who goes looking: dispatch this event to see it on demand.
    window.addEventListener("pt:hero-signal", () => {
      window.clearTimeout(timer);
      play();
    });
  };

  if ("requestIdleCallback" in window) window.requestIdleCallback(build, { timeout: 4000 });
  else window.setTimeout(build, 1500);
}
