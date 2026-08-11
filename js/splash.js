// Entry splash dismissal.
//
// Whether the splash shows at all is decided before first paint by the inline
// script in index.html, which sets .splash-armed on <html> when sessionStorage
// has no record of a visit. This module only handles the way out: unhide the
// dialog, trap focus while it is up, and mark the session as seen on exit.

const SEEN_KEY = "pt_splash";

const markSeen = () => {
  try {
    sessionStorage.setItem(SEEN_KEY, "seen");
  } catch (e) {
    /* private mode: the splash simply shows again next load */
  }
};

export function initSplash() {
  const root = document.documentElement;
  const splash = document.getElementById("splash");
  if (!splash) return;

  // Not armed: the inline script already decided this visitor has seen it.
  if (!root.classList.contains("splash-armed")) {
    splash.remove();
    return;
  }

  // Tells the inline failsafe that this module is alive.
  root.setAttribute("data-splash-ready", "1");
  const enter = splash.querySelector("[data-splash-enter]");
  const lastFocus = document.activeElement;
  enter?.focus({ preventScroll: true });

  const dismiss = () => {
    markSeen();
    splash.classList.add("is-leaving");
    const done = () => {
      splash.remove();
      root.classList.remove("splash-armed");
      root.removeAttribute("data-splash-ready");
      document.removeEventListener("keydown", onKeyDown);
      // Send focus into the page rather than leaving it on a removed node.
      const target = document.getElementById("top");
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      else if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
    };
    splash.addEventListener("animationend", done, { once: true });
    // Belt and braces: reduced-motion shortens the animation to ~0, and a
    // display change can drop the event entirely.
    setTimeout(done, 600);
  };

  // Escape leaves too: a splash that traps you is a splash that annoys you.
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    // Only one focusable control, so Tab always returns to it.
    if (event.key === "Tab") {
      event.preventDefault();
      enter?.focus({ preventScroll: true });
    }
  };

  enter?.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKeyDown);
}
