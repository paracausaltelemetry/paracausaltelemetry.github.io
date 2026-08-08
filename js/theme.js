// Theme preference is mirrored to a cookie scoped to the registrable domain
// (.paracausaltelemetry.com) so the choice carries across the site and its
// subdomains (ctf., alchemist.), which don't share localStorage. localStorage
// is kept as a same-origin fallback. On other hosts (localhost, *.github.io)
// the cookie is written host-only so local testing still exercises the path.
const THEME_COOKIE = "pt_theme";

const readThemeCookie = () => {
  const match = document.cookie.match(/(?:^|;\s*)pt_theme=(light|dark)/);
  return match ? match[1] : null;
};

const writeThemeCookie = (theme) => {
  const onSiteDomain = /(^|\.)paracausaltelemetry\.com$/.test(location.hostname);
  const domain = onSiteDomain ? "; domain=.paracausaltelemetry.com" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${domain}`;
};

export function initTheme({ onDesktopViewport } = {}) {
  const compactMobileQuery = window.matchMedia("(max-width: 960px)");
  const siteHeader = document.querySelector(".site-header");
  const primaryNavLinks = Array.from(document.querySelectorAll(".site-nav a[href^='#']"));
  const mobileNavTargetIds = primaryNavLinks
    .map((link) => (link.getAttribute("href") || "").replace("#", ""))
    .filter((sectionId) => sectionId && document.getElementById(sectionId));
  const mobileNavTargets = new Set(mobileNavTargetIds);
  const themeToggle = document.getElementById("theme-toggle");

  const setTheme = (theme) => {
    document.body.classList.toggle("light-mode", theme === "light");
    document.body.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {
      /* private mode / storage disabled — the cookie still carries the choice */
    }
    writeThemeCookie(theme);
    themeToggle?.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  };

  // Cookie wins (it may have been set on another subdomain); localStorage is the
  // same-origin fallback for the very first visit before any cookie exists.
  const savedTheme = readThemeCookie() || localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = savedTheme === "light" ? "light" : savedTheme === "dark" ? "dark" : systemPrefersDark ? "dark" : "light";
  setTheme(resolvedTheme);

  themeToggle?.addEventListener("click", () => {
    setTheme(document.body.classList.contains("light-mode") ? "dark" : "light");
  });

  const setActiveNavLink = (sectionId = "") => {
    primaryNavLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const isActive = mobileNavTargets.has(sectionId) && href === `#${sectionId}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const syncActiveMobileNav = () => {
    if (!compactMobileQuery.matches) return;
    const activationLine = window.innerHeight * 0.42;
    const activeSection = mobileNavTargetIds.find((sectionId) => {
      const section = document.getElementById(sectionId);
      if (!section) return false;
      const rect = section.getBoundingClientRect();
      return rect.top <= activationLine && rect.bottom > activationLine;
    });
    setActiveNavLink(activeSection || "");
  };

  const syncHeaderOffset = () => {
    if (siteHeader instanceof HTMLElement) {
      document.documentElement.style.setProperty("--header-offset", `${siteHeader.offsetHeight}px`);
    }
  };

  const syncViewportMode = () => {
    document.body.classList.toggle("mobile-lite", compactMobileQuery.matches);
    const toolNav = document.getElementById("tool-nav");
    toolNav?.setAttribute("aria-orientation", compactMobileQuery.matches ? "horizontal" : "vertical");
    syncHeaderOffset();
    if (!compactMobileQuery.matches) {
      setActiveNavLink("");
    } else {
      syncActiveMobileNav();
    }
  };

  const handleViewportChange = () => {
    const wasCompact = document.body.classList.contains("mobile-lite");
    syncViewportMode();
    if (wasCompact && !compactMobileQuery.matches) {
      onDesktopViewport?.();
    }
  };

  syncViewportMode();

  if (typeof compactMobileQuery.addEventListener === "function") {
    compactMobileQuery.addEventListener("change", handleViewportChange);
  } else if (typeof compactMobileQuery.addListener === "function") {
    compactMobileQuery.addListener(handleViewportChange);
  }

  window.addEventListener("resize", syncHeaderOffset, { passive: true });

  primaryNavLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const sectionId = (link.getAttribute("href") || "").replace("#", "");
      if (compactMobileQuery.matches) {
        setActiveNavLink(sectionId);
        window.setTimeout(syncActiveMobileNav, 720);
      }
    });
  });

  let mobileNavRaf = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (!compactMobileQuery.matches || mobileNavRaf) return;
      mobileNavRaf = window.requestAnimationFrame(() => {
        mobileNavRaf = 0;
        syncActiveMobileNav();
      });
    },
    { passive: true }
  );

  if ("IntersectionObserver" in window) {
    const mobileNavObserver = new IntersectionObserver(
      () => syncActiveMobileNav(),
      // rootMargin keeps the activation zone centred in the viewport;
      // threshold values fire at 12%, 28%, and 50% intersection
      { rootMargin: "-38% 0px -52% 0px", threshold: [0.12, 0.28, 0.5] }
    );
    mobileNavTargetIds.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) mobileNavObserver.observe(section);
    });
  }

  const revealTargets = document.querySelectorAll("[data-reveal]");
  if (revealTargets.length && "IntersectionObserver" in window) {
    document.body.classList.add("motion-ready");
    const revealAll = () => revealTargets.forEach((target) => target.classList.add("is-visible"));

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((target) => {
      if (target.getBoundingClientRect().top <= window.innerHeight * 0.92) {
        target.classList.add("is-visible");
      }
      revealObserver.observe(target);
    });

    window.setTimeout(revealAll, 1500);
  }

  return { compactMobileQuery };
}
