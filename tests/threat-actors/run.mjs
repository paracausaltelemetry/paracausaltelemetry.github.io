import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const json = (path) => JSON.parse(read(path));
let passed = 0;
const failures = [];

const test = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
};

const source = json("threat-actors/content/bauxite.json");
const schema = json("threat-actors/schema-v1.json");
const actor = json("threat-actors/data/bauxite.json");
const index = json("threat-actors/index.json");
const enterprise = json("threat-actors/data/bauxite-enterprise-navigator.json");
const ics = json("threat-actors/data/bauxite-ics-navigator.json");
const hubHtml = read("threat-actors/index.html");
const actorHtml = read("threat-actors/bauxite/index.html");
const expectedSlugs = ["bauxite", "cyberav3ngers", "graphite", "kamacite", "sandworm-team"];
const actors = expectedSlugs.map((slug) => json(`threat-actors/data/${slug}.json`));

test("directory publishes the five reviewed actor profiles", () => {
  assert.equal(schema.properties.schemaVersion.const, source.schemaVersion);
  assert.deepEqual(schema.$defs.relationship.enum, ["canonical", "overlap", "associated"]);
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.actors.map((entry) => entry.slug).sort(), expectedSlugs);
  assert.equal(index.entries[0].type, "Threat Actor");
  assert.equal(index.entries.length, 5);
});

test("public actor export preserves the authored schema and artifact links", () => {
  assert.equal(actor.schemaVersion, source.schemaVersion);
  assert.equal(actor.name, "BAUXITE");
  assert.equal(actor.sourceFile, undefined);
  assert.equal(actor.url, "/threat-actors/bauxite/");
  assert.equal(actor.artifacts.icsNavigator, "/threat-actors/data/bauxite-ics-navigator.json");
});

test("designation relationships do not flatten overlap into aliases", () => {
  assert.deepEqual(actor.designations.map((entry) => entry.relationship), ["canonical", "overlap", "overlap", "associated"]);
  assert.equal(actor.designations.find((entry) => entry.externalId === "G1027")?.name, "CyberAv3ngers");
  assert(!actor.designations.some((entry) => entry.relationship === "canonical" && entry.name === "CyberAv3ngers"));
});

test("observation dates retain provider scope", () => {
  assert.deepEqual(actor.observedSince.map((entry) => [entry.label, entry.value]), [
    ["BAUXITE activity cluster", "2017"],
    ["CyberAv3ngers persona", "2020"]
  ]);
});

test("every claim source resolves to its actor source register", () => {
  for (const profile of actors) {
    const sourceIds = new Set(profile.sources.map((entry) => entry.id));
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "sourceIds") {
          assert(child.length > 0);
          child.forEach((id) => assert(sourceIds.has(id), `${profile.slug}: unknown source ${id}`));
        } else walk(child);
      }
    };
    walk(profile);
  }
});

test("Navigator layers stay domain-correct and match the profile", () => {
  assert.equal(enterprise.domain, "enterprise-attack");
  assert.equal(ics.domain, "ics-attack");
  assert.deepEqual(enterprise.techniques.map((entry) => entry.techniqueID).sort(), actor.ttps.enterprise.map((entry) => entry.id).sort());
  assert.deepEqual(ics.techniques.map((entry) => entry.techniqueID).sort(), actor.ttps.ics.map((entry) => entry.id).sort());
  assert(enterprise.description.includes("not asserted to be exact aliases"));
  assert(ics.techniques.some((entry) => entry.techniqueID === "T1694.001"));
  for (const profile of actors) {
    for (const [domain, expectedDomain] of [["enterprise", "enterprise-attack"], ["ics", "ics-attack"]]) {
      const layer = json(`threat-actors/data/${profile.slug}-${domain}-navigator.json`);
      assert.equal(layer.domain, expectedDomain);
      assert.deepEqual(layer.techniques.map((entry) => entry.techniqueID).sort(), profile.ttps[domain].map((entry) => entry.id).sort());
      assert(layer.description.includes("not asserted to be exact aliases"));
    }
  }
});

test("historical indicators are typed, dated, and defanged in HTML", () => {
  assert.equal(actor.indicators.length, 6);
  assert(actor.indicators.every((entry) => entry.status === "historical" && /^2024-12-\d{2}$/.test(entry.reported)));
  assert.equal(actor.indicators.find((entry) => entry.type === "sha256")?.value.length, 64);
  assert(actorHtml.includes("159[.]100[.]6[.]69"));
  assert(actorHtml.includes("uuokhhfsdlk[.]tylarion867mino[.]com"));
  assert(!actorHtml.includes(">159.100.6.69<"));
});

test("hub exposes search + state filter chips and no placeholder profiles", () => {
  assert(hubHtml.includes('name="q"'));
  assert(hubHtml.includes('data-filter-state=""'));
  assert(hubHtml.includes('data-filter-state="iran"'));
  assert(hubHtml.includes('data-filter-state="russia"'));
  assert(hubHtml.includes("No actors match these filters."));
  assert(!hubHtml.toLowerCase().includes("coming soon"));
  assert.equal((hubHtml.match(/data-actor-card/g) || []).length, 5);
});

test("directory cards carry the Microsoft family cover", () => {
  assert(hubHtml.includes("actor-family-cover"));
  assert(hubHtml.includes(">Sandstorm<"));
  assert(hubHtml.includes(">Blizzard<"));
  assert(actorHtml.includes(">Microsoft family<"));
});

test("actor page exposes the complete dossier and structured metadata", () => {
  for (const id of ["identity", "assessment", "campaigns", "ttps", "indicators", "sources"]) assert(actorHtml.includes(`id="${id}"`));
  assert(actorHtml.includes('"@type":"TechArticle"'));
  assert(actorHtml.includes("Aliases and related groups"));
  assert(actorHtml.includes("Mapped ATT&amp;CK techniques"));
  assert(actorHtml.includes("Historical, not current infrastructure."));
  for (const profile of actors) {
    const html = read(`threat-actors/${profile.slug}/index.html`);
    assert(html.includes(`https://paracausaltelemetry.com/threat-actors/${profile.slug}/`));
    assert(html.includes('"@type":"TechArticle"'));
    assert(html.includes(`>${profile.name}</h1>`));
    assert(html.includes(`/threat-actors/data/${profile.slug}.json`));
  }
});

test("site integration includes global search and sitemap routes", () => {
  assert(read("js/command-palette.js").includes('"/threat-actors/index.json"'));
  assert(read("scripts/lib/site-shell.mjs").includes('href: "/threat-actors/"'));
  const sitemap = read("sitemap.xml");
  assert(sitemap.includes("https://paracausaltelemetry.com/threat-actors/"));
  expectedSlugs.forEach((slug) => assert(sitemap.includes(`https://paracausaltelemetry.com/threat-actors/${slug}/`)));
});

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  console.error(`\nThreat actor tests: ${passed} passed, ${failures.length} failed`);
  process.exit(1);
}

console.log(`\nThreat actor tests: ${passed} passed, 0 failed`);
