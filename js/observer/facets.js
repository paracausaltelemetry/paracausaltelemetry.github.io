/* Faceted filter chips for Observer. Each group owns its own state and renders
   live counts taken from the current candidate set, so a chip that would empty
   the results is disabled rather than silently returning nothing. */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createFacets({ groups, onChange }) {
  const state = new Map(groups.map((group) => [group.key, ""]));

  const values = () => Object.fromEntries(state);

  const matchesGroup = (group, entry, value) => !value || group.match(entry, value);

  const matchesExcept = (entry, skipKey) => groups.every((group) => group.key === skipKey || matchesGroup(group, entry, state.get(group.key)));

  const countsFor = (group, candidates) => {
    const counts = new Map();
    for (const entry of candidates) {
      if (!matchesExcept(entry, group.key)) continue;
      for (const option of group.options) {
        if (group.match(entry, option.value)) counts.set(option.value, (counts.get(option.value) || 0) + 1);
      }
    }
    return counts;
  };

  const renderGroup = (group, candidates) => {
    const counts = countsFor(group, candidates);
    const active = state.get(group.key);
    const total = candidates.filter((entry) => matchesExcept(entry, group.key)).length;
    const row = el("div", "observer-facet-row");
    row.append(el("span", "observer-facet-label", group.label));
    const chips = el("div", "observer-facet-chips");

    const options = [{ value: "", label: group.allLabel, count: total }, ...group.options.map((option) => ({ ...option, count: counts.get(option.value) || 0 }))];
    for (const option of options) {
      const chip = el("button", "observer-facet-chip");
      chip.type = "button";
      chip.dataset.facet = group.key;
      chip.dataset.value = option.value;
      chip.setAttribute("aria-pressed", option.value === active ? "true" : "false");
      chip.classList.toggle("is-active", option.value === active);
      chip.append(el("span", "observer-facet-chip-label", option.label), el("span", "observer-facet-chip-count", String(option.count)));
      if (option.value && !option.count) chip.disabled = true;
      chip.addEventListener("click", () => {
        state.set(group.key, option.value === active ? "" : option.value);
        onChange();
      });
      chips.append(chip);
    }
    row.append(chips);
    return row;
  };

  return {
    values,
    get: (key) => state.get(key) || "",
    set(key, value) { if (state.has(key)) state.set(key, value || ""); },
    active: () => groups.some((group) => state.get(group.key)),
    clear() { for (const group of groups) state.set(group.key, ""); },
    matches(entry) {
      return groups.every((group) => matchesGroup(group, entry, state.get(group.key)));
    },
    /* candidates: the result set *before* this bar's own filtering, so counts
       describe what each chip would actually return. */
    render(mount, candidates) {
      const fragment = document.createDocumentFragment();
      for (const group of groups) fragment.append(renderGroup(group, candidates));
      if (groups.some((group) => state.get(group.key))) {
        const clear = el("button", "observer-facet-clear", "Clear filters");
        clear.type = "button";
        clear.addEventListener("click", () => { this.clear(); onChange(); });
        fragment.append(clear);
      }
      mount.replaceChildren(fragment);
    }
  };
}
