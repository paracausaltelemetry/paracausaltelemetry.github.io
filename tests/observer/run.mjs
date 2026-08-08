import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, search, findById } from "../../js/observer/search.js?v=276fa973-1";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = resolve(ROOT, "observer", "data");
const catalogDocument = JSON.parse(readFileSync(resolve(dataRoot, "catalog.json"), "utf8"));
const catalogue = catalogDocument.entries;
const index = buildIndex(catalogue);
const shardFiles = readdirSync(resolve(dataRoot, "shards")).filter((file) => file.endsWith(".json"));
const shardDocuments = shardFiles.map((file) => JSON.parse(readFileSync(resolve(dataRoot, "shards", file), "utf8")));
const full = shardDocuments.flatMap((document) => document.entries);

let passed = 0;
const failures = [];
const test = (name, fn) => { try { fn(); passed += 1; } catch (error) { failures.push({ name, message: error.message }); } };
const assert = (condition, message = "assertion failed") => { if (!condition) throw new Error(message); };
const results = (query, options = {}) => search(index, query, { limit: 12, ...options }).results.map((hit) => hit.entry);
const ids = (query) => results(query).map((entry) => entry.id);

test("catalogue publishes schema v5 with contextual implementations and unchanged record counts", () => {
  assert(catalogDocument.schemaVersion === 5, `expected schema v5, got ${catalogDocument.schemaVersion}`);
  assert(catalogue.length === 574, `expected 574 entries, got ${catalogue.length}`);
  assert(new Set(catalogue.map((entry) => entry.id)).size === catalogue.length, "duplicate catalogue id");
  assert(catalogue.every((entry) => entry.section && Array.isArray(entry.platforms) && entry.identifiers), "structured fields missing");
  const expected = { fundamentals: 63, services: 83, ports: 118, attacks: 125, artefacts: 51, "tool-hunting": 1, operational: 133 };
  for (const [section, count] of Object.entries(expected)) {
    assert(catalogue.filter((entry) => entry.section === section).length === count, `${section} count mismatch`);
  }
});

test("shards resolve every catalogue record exactly once", () => {
  assert(shardDocuments.every((document) => document.schemaVersion === 5), "a shard is not schema v5");
  assert(full.length === catalogue.length, `catalogue ${catalogue.length}, shards ${full.length}`);
  assert(new Set(full.map((entry) => entry.id)).size === full.length, "duplicate shard id");
  for (const meta of catalogue) assert(findById(full, meta.id), `missing ${meta.id}`);
});

const exactFixtures = [
  ["PsExec", "ref-windows-psexec"],
  ["psexce", "ref-windows-psexec"],
  ["Evil Maid attack", "attack-evil-maid"],
  ["NTDS.dit", "artefact-ntds-dit"],
  ["NTTDS.dit", "artefact-ntds-dit"],
  ["/etc/shadow", "artefact-etc-shadow"],
  ["49152-65535", "port-49152-65535"],
  ["BGP", "service-bgp"],
  ["Kerberos", "service-kerberos"],
  ["4625", "evt-4625"],
  ["T1110", "tech-t1110"],
  ["Shadow Credentials", "attack-shadow-credentials"],
  ["Terraform state", "artefact-terraform-state-files"],
  ["AWS IMDS", "service-aws-ec2-instance-metadata-service"],
  ["PST", "artefact-pst-ost-and-mbox-email-stores"],
  ["JWT", "attack-jwt-forgery-and-algorithm-confusion"],
  ["/var/www/html", "service-http"],
  ["Cobalt Strike", "tool-hunt-cobalt-strike"],
  ["CS Beacon", "tool-hunt-cobalt-strike"],
  ["what happens when you type a URL", "fundamentals-browser-request"],
  ["browser request journey", "fundamentals-browser-request"],
  ["URL parsing", "fundamentals-url-navigation"],
  ["DNS resolution in a browser", "fundamentals-browser-dns"],
  ["browser rendering pipeline", "fundamentals-rendering-pipeline"],
  ["DNS header flags", "fundamentals-browser-dns"],
  ["MTU MSS", "fundamentals-local-network"],
  ["TCP state machine", "fundamentals-tcp-quic"],
  ["TLS 1.3 key schedule", "fundamentals-tls"],
  ["HTTP/2 frames", "fundamentals-http"],
  ["certificate chain validation", "fundamentals-tls"],
  ["browser event loop", "fundamentals-rendering-pipeline"],
  ["what happens when I turn on my PC", "fundamentals-power-on-sign-in"],
  ["Winlogon LSASS", "fundamentals-power-on-and-sign-in-lsass-authentication-and-access-token"],
  ["802.1X RADIUS", "fundamentals-wifi-and-vpn-8021x-eap-radius"],
  ["what happens when I send an email", "fundamentals-email-delivery"],
  ["SMTP mail flow", "fundamentals-email-delivery-queues-dns-mx-recipient-routing"],
  ["SMB session setup", "fundamentals-network-file-access-session-setup-spnego-kerberos-ntlm"],
  ["what OSI layer is ARP", "fundamentals-wifi-and-vpn-arp-nd-routing-dns"],
  ["Mimikatz", "attack-lsass-credential-dumping"],
  ["Rubeus", "attack-kerberoasting"],
  ["Impacket psexec", "attack-windows-service-execution"],
  ["Responder", "attack-llmnr-nbt-ns-poisoning"],
  ["sqlmap", "attack-sql-injection"],
  ["Evilginx", "attack-adversary-in-the-middle-phishing-and-cookie-theft"],
  ["Pacu", "attack-cloud-iam-policy-abuse"],
  ["sc.exe", "attack-windows-service-execution"]
];
for (const [query, expected] of exactFixtures) {
  test(`ranking leads with ${expected} for ${query}`, () => assert(ids(query)[0] === expected, `${ids(query)[0]} ranked first`));
}

test("numeric port lookup leads with the port and its service", () => {
  const ranked = ids("22");
  assert(ranked[0] === "port-22", `expected port-22 first, got ${ranked[0]}`);
  assert(ranked[1] === "service-ssh", `expected service-ssh second, got ${ranked[1]}`);
});

test("expanded identifiers lead with the intended paired resources", () => {
  const kafka = ids("9092");
  assert(kafka[0] === "port-9092", "expected port-9092 first, got " + kafka[0]);
  assert(kafka[1] === "service-apache-kafka", "expected Kafka second, got " + kafka[1]);
  const secrets = ids("Kubernetes Secrets");
  assert(secrets[0] === "artefact-kubernetes-secrets-objects", "expected Kubernetes Secrets artefact first, got " + secrets[0]);
  assert(secrets[1] === "attack-kubernetes-secrets-theft", "expected Kubernetes Secrets theft second, got " + secrets[1]);
  const profinet = ids("PROFINET");
  assert(profinet[0] === "service-profinet", "expected PROFINET service first, got " + profinet[0]);
  assert(profinet[1] === "port-34962-34964", "expected PROFINET range second, got " + profinet[1]);
});

test("section and platform projections support Observer filters", () => {
  const services = catalogue.filter((entry) => entry.section === "services");
  const windows = catalogue.filter((entry) => entry.platforms.includes("windows"));
  assert(services.length === 83, "service filter count mismatch");
  assert(windows.length > 30, "Windows platform coverage too small");
  assert(services.some((entry) => entry.id === "service-ssh"), "SSH missing from services");
});

test("typed library relationships resolve", () => {
  const ids = new Set(full.map((entry) => entry.id));
  for (const entry of full) {
    for (const values of Object.values(entry.relationships || {})) {
      for (const related of values) assert(ids.has(related.id), `${entry.id}: broken relationship ${related.id}`);
    }
  }
});

test("no catalogue entry links out to a retired section", () => {
  const serialised = JSON.stringify(catalogDocument) + JSON.stringify(shardDocuments);
  assert(!serialised.includes("/blue-team/"), "a catalogue entry still links into the retired Blue Team tree");
});

test("every library result carries visible location guidance", () => {
  for (const entry of full.filter((item) => ["services", "ports", "attacks", "artefacts"].includes(item.section))) {
    assert(entry.locationGuide?.summary, `${entry.id}: missing location summary`);
    assert(entry.locationGuide?.items?.length, `${entry.id}: missing location items`);
    assert(entry.identifiers?.paths?.length, `${entry.id}: missing searchable location identifiers`);
  }
});

test("Cobalt Strike field guide connects to related evidence", () => {
  const guide = findById(full, "tool-hunt-cobalt-strike");
  assert(guide, "Cobalt Strike field guide missing");
  const related = new Set((guide.relationships?.learn || []).map((entry) => entry.id));
  for (const id of ["attack-c2-beaconing", "attack-process-injection", "service-http", "service-dns"]) {
    assert(related.has(id), `Cobalt Strike missing ${id}`);
  }
});

test("PsExec exposes its related attack articles", () => {
  const psexec = findById(full, "ref-windows-psexec");
  const related = new Set((psexec.relationships?.attacks || []).map((entry) => entry.id));
  for (const id of ["attack-windows-service-execution", "attack-smb-and-admin-share-lateral-movement", "attack-pass-the-hash"]) {
    assert(related.has(id), `PsExec missing ${id}`);
  }
});

console.log(`\nObserver platform tests: ${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.error(`  FAIL ${failure.name}\n       ${failure.message}`);
if (failures.length) process.exit(1);
