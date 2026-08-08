// Rotating project gallery for the Projects page. A dependency-free, CSP-safe
// port of a React/motion carousel: the cards are static HTML (so the page works
// with no JS — every card is simply visible, stacked), and this module assigns
// each card a position class (is-center / is-left / is-right / is-hidden) that
// CSS animates. Manual navigation only: the arrow buttons, clicking a side card,
// or Left/Right arrow keys while the carousel is focused.

export function initProjectsCarousel() {
  const root = document.querySelector(".projects-carousel");
  if (!root) {
    return;
  }

  const cards = Array.from(root.querySelectorAll(".carousel-card"));
  if (cards.length === 0) {
    return;
  }

  const count = cards.length;
  let index = 0;

  const positionFor = (cardIndex) => {
    const rel = (cardIndex - index + count) % count;
    if (rel === 0) {
      return "center";
    }
    if (rel === count - 1) {
      return "left";
    }
    if (rel === 1) {
      return "right";
    }
    return "hidden";
  };

  const apply = () => {
    cards.forEach((card, cardIndex) => {
      const position = positionFor(cardIndex);
      card.classList.remove("is-center", "is-left", "is-right", "is-hidden");
      card.classList.add(`is-${position}`);
      card.setAttribute("aria-hidden", position === "center" ? "false" : "true");
      // Only the centre card's link is reachable by keyboard.
      card.querySelectorAll("a, button").forEach((el) => {
        el.tabIndex = position === "center" ? 0 : -1;
      });
    });
  };

  const go = (direction) => {
    index = (index + direction + count) % count;
    apply();
  };

  // Deep links: /projects/#alchemist centres the card whose data-project
  // matches. Returns true when a matching card was found and centred.
  const selectByName = (name) => {
    const target = cards.findIndex((card) => card.dataset.project === name);
    if (target < 0) {
      return false;
    }
    index = target;
    apply();
    return true;
  };

  const syncFromHash = () =>
    selectByName(decodeURIComponent(window.location.hash.replace(/^#/, "")));

  root.querySelector("[data-carousel-prev]")?.addEventListener("click", () => go(-1));
  root.querySelector("[data-carousel-next]")?.addEventListener("click", () => go(1));

  cards.forEach((card) => {
    card.addEventListener("click", (event) => {
      if (card.classList.contains("is-left")) {
        event.preventDefault();
        go(-1);
      } else if (card.classList.contains("is-right")) {
        event.preventDefault();
        go(1);
      }
    });
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  });

  // Honour a deep-link hash on load; fall back to the default centre card.
  if (!syncFromHash()) {
    apply();
  }
  window.addEventListener("hashchange", syncFromHash);
}
