const commandItems = [
  { label: "Home", detail: "Writeups, Observer, and threat-actor dossiers", href: "/" },
  { label: "Writeups", detail: "Hack The Box and TryHackMe archive", href: "/writeups/" },
  { label: "Threat Actors", detail: "Source-resolved CTI dossiers, designations, campaigns, TTPs, and indicators", href: "/#threat-actors" },
  { label: "Alchemist", detail: "OT network modelling sandbox", href: "https://alchemist.paracausaltelemetry.com/" },
  { label: "Rotation", detail: "Techno, jungle and electronic tracks and mixes worth keeping", href: "/rotation/" },
  { label: "Observer", detail: "Multi-domain operational lookup for endpoint, identity, network, cloud and DFIR", href: "/observer/" },
  { label: "Windows Event 4672", detail: "Privileged logon: special privileges assigned to new logon", href: "/observer/?id=evt-4672" },
  { label: "Windows Event 4625", detail: "Failed logon: brute force and password spraying signal", href: "/observer/?id=evt-4625" },
  { label: "Brute Force (T1110)", detail: "ATT&CK brute force and sub-techniques in Observer", href: "/observer/?q=brute+force" },
  { label: "Windows Persistence", detail: "Run keys, services, tasks, WMI and start-up references", href: "/observer/?q=persistence" }
];

let dynamicItems = [];
let dynamicItemsPromise = null;

const loadDynamicItems = () => {
  if (!dynamicItemsPromise) {
    const indexes = ["/threat-actors/index.json"];
    dynamicItemsPromise = Promise.all(indexes.map((url) => fetch(url, { cache: "default" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .catch(() => ({ entries: [] }))))
      .then((documents) => {
        dynamicItems = documents.flatMap((doc) => Array.isArray(doc.entries) ? doc.entries : []);
        return dynamicItems;
      })
      .catch(() => []);
  }
  return dynamicItemsPromise;
};

const normalizeQuery = (value) => value.trim().toLowerCase();

const matchesItem = (item, query) => {
  if (!query) return true;
  return `${item.label} ${item.detail} ${(item.terms || []).join(" ")} ${item.type || ""}`.toLowerCase().includes(query);
};

export function initCommandPalette() {
  if (document.getElementById("command-palette")) return;

  const headerActions = document.querySelector(".header-actions");
  const themeToggle = document.getElementById("theme-toggle");

  const trigger = document.createElement("button");
  trigger.className = "command-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", "command-palette");
  trigger.setAttribute("aria-expanded", "false");
  const triggerText = document.createElement("span");
  triggerText.textContent = "Search";
  const triggerKbd = document.createElement("kbd");
  triggerKbd.textContent = "Ctrl K";
  trigger.append(triggerText, triggerKbd);

  if (headerActions instanceof HTMLElement) {
    headerActions.insertBefore(trigger, themeToggle || null);
  }

  const palette = document.createElement("div");
  palette.className = "command-palette";
  palette.id = "command-palette";
  palette.role = "dialog";
  palette.setAttribute("aria-modal", "true");
  palette.setAttribute("aria-label", "Site search");
  palette.hidden = true;

  const panel = document.createElement("div");
  panel.className = "command-panel";

  // ARIA 1.2 combobox: the input owns the listbox and drives the active option
  // via aria-activedescendant (options are not tab stops).
  const input = document.createElement("input");
  input.className = "command-input";
  input.type = "search";
  input.placeholder = "Search pages, guides, and investigations...";
  input.setAttribute("aria-label", "Search site");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "command-results");
  input.autocomplete = "off";

  const list = document.createElement("div");
  list.className = "command-results";
  list.id = "command-results";
  list.role = "listbox";
  list.setAttribute("aria-label", "Search results");

  panel.append(input, list);
  palette.append(panel);
  document.body.append(palette);

  let options = [];
  let activeIndex = -1;

  const setExpanded = (isOpen) => {
    input.setAttribute("aria-expanded", isOpen ? "true" : "false");
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  const close = () => {
    palette.hidden = true;
    document.body.classList.remove("command-open");
    setExpanded(false);
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
    trigger.focus({ preventScroll: true });
  };

  const open = () => {
    palette.hidden = false;
    document.body.classList.add("command-open");
    input.value = "";
    render("");
    window.requestAnimationFrame(() => input.focus());
    // The search indexes (~340K) are only fetched on first open, not at page
    // load — the static commandItems above cover the palette until they land.
    void loadDynamicItems().then(() => {
      if (!palette.hidden) render(normalizeQuery(input.value));
    });
  };

  const activate = (href) => {
    window.location.href = href;
  };

  const setActive = (nextIndex) => {
    if (!options.length) return;
    activeIndex = (nextIndex + options.length) % options.length;
    options.forEach((option, index) => {
      const isActive = index === activeIndex;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    input.setAttribute("aria-activedescendant", options[activeIndex].id);
    options[activeIndex].scrollIntoView({ block: "nearest" });
  };

  const render = (query) => {
    const filtered = [...commandItems, ...dynamicItems].filter((item) => matchesItem(item, query)).slice(0, 10);
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "command-empty";
      empty.textContent = "No matching pages or entries.";
      list.replaceChildren(empty);
      options = [];
      setExpanded(false);
      return;
    }

    options = filtered.map((item, index) => {
      const option = document.createElement("button");
      option.className = "command-item";
      option.type = "button";
      option.id = `command-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      const label = document.createElement("strong");
      label.textContent = item.label;
      const detail = document.createElement("span");
      detail.textContent = item.detail;
      option.append(label, detail);
      option.addEventListener("click", () => activate(item.href));
      return option;
    });

    list.replaceChildren(...options);
    setExpanded(true);
  };

  trigger.addEventListener("click", open);
  input.addEventListener("input", () => render(normalizeQuery(input.value)));

  palette.addEventListener("click", (event) => {
    if (event.target === palette) close();
  });

  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        if (options.length) { event.preventDefault(); setActive(activeIndex + 1); }
        break;
      case "ArrowUp":
        if (options.length) { event.preventDefault(); setActive(activeIndex - 1); }
        break;
      case "Enter":
        if (options.length) {
          event.preventDefault();
          options[activeIndex >= 0 ? activeIndex : 0].click();
        }
        break;
      case "Tab":
        // Focus trap: the input is the only focusable control in the modal
        // (options use aria-activedescendant), so keep focus here.
        event.preventDefault();
        break;
      default:
        break;
    }
  });

  document.addEventListener("keydown", (event) => {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
    if (!isShortcut) return;
    event.preventDefault();
    palette.hidden ? open() : close();
  });

}
