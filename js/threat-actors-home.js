// "Threat actors" on the homepage: one card per published dossier, read from
// the baked threat-actor index. The dossiers are the product here — there is no
// hub page any more, so these cards are the only route into them. The section
// stays hidden unless the index resolves, so a fetch failure costs nothing.

const createCard = (actor) => {
  const card = document.createElement("a");
  card.className = "actor-card";
  card.href = actor.url || `/threat-actors/${actor.slug}/`;

  const kicker = document.createElement("span");
  kicker.className = "actor-card-kicker";
  kicker.textContent = actor.actorType || "Threat actor";

  const heading = document.createElement("strong");
  heading.textContent = actor.name;

  card.append(kicker, heading);

  if (actor.summary) {
    const summary = document.createElement("p");
    summary.textContent = actor.summary;
    card.append(summary);
  }

  const meta = document.createElement("span");
  meta.className = "actor-card-meta";
  meta.textContent = [actor.state, actor.status].filter(Boolean).join(" · ");
  if (meta.textContent) card.append(meta);

  return card;
};

export async function initThreatActors() {
  const section = document.getElementById("threat-actors");
  const list = document.getElementById("actor-list");
  if (!section || !list) return;

  const index = await fetch("/threat-actors/index.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const actors = (index?.actors || []).filter((actor) => actor?.name && actor?.slug);
  if (!actors.length) return;

  list.replaceChildren(...actors.map(createCard));
  section.hidden = false;
}
