export function initSiteHeader() {
  const header = document.querySelector("[data-site-header], .site-header");
  const menu = header?.querySelector("[data-site-menu], .header-actions");
  if (!(header instanceof HTMLElement) || !(menu instanceof HTMLElement) || header.querySelector(".site-menu-toggle")) return;

  const mobileQuery = window.matchMedia("(max-width: 960px)");
  const toggle = document.createElement("button");
  toggle.className = "site-menu-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-controls", "site-menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open site menu");
  toggle.innerHTML = `<span>Menu</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" /></svg>`;
  menu.id = "site-menu";
  header.insertBefore(toggle, menu);
  document.body.classList.add("site-menu-ready");

  const syncHeaderOffset = () => {
    document.documentElement.style.setProperty("--header-offset", `${header.offsetHeight}px`);
  };

  const setOpen = (open, { restoreFocus = false } = {}) => {
    const mobile = mobileQuery.matches;
    const nextOpen = mobile && open;
    document.body.classList.toggle("site-menu-open", nextOpen);
    toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    toggle.setAttribute("aria-label", nextOpen ? "Close site menu" : "Open site menu");
    menu.toggleAttribute("inert", mobile && !nextOpen);
    menu.setAttribute("aria-hidden", mobile && !nextOpen ? "true" : "false");
    window.requestAnimationFrame(syncHeaderOffset);
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };

  const open = () => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      const current = menu.querySelector('.site-nav a[aria-current="page"]');
      const first = current || menu.querySelector(".site-nav a, .command-trigger, .theme-toggle");
      first?.focus({ preventScroll: true });
    });
  };

  const close = (restoreFocus = false) => setOpen(false, { restoreFocus });

  toggle.addEventListener("click", () => {
    document.body.classList.contains("site-menu-open") ? close(true) : open();
  });

  menu.querySelectorAll(".site-nav a").forEach((link) => {
    link.addEventListener("click", () => close(false));
  });

  menu.querySelector(".command-trigger")?.addEventListener("click", () => close(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("site-menu-open")) {
      event.preventDefault();
      close(true);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (document.body.classList.contains("site-menu-open") && !header.contains(event.target)) close(false);
  });

  const syncViewport = () => {
    setOpen(false);
    toggle.hidden = !mobileQuery.matches;
    syncHeaderOffset();
  };

  if (typeof mobileQuery.addEventListener === "function") mobileQuery.addEventListener("change", syncViewport);
  else mobileQuery.addListener(syncViewport);
  window.addEventListener("resize", syncHeaderOffset, { passive: true });
  syncViewport();
}

