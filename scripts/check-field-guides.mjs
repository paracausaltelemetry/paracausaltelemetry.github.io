import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Field guide review: which guides are due a re-check against the vendor's
 * docs, and whether every "references" link in guides.json still resolves.
 * Writes a Markdown report to stdout (or to --out <file>) and exits 0 either
 * way; .github/workflows/field-guide-review.yml turns the report into an
 * issue when something needs attention. Run locally with
 * `node scripts/check-field-guides.mjs`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DUE_DAYS = 180;
const SOON_DAYS = 150;
const outAt = process.argv.indexOf("--out");
const out = outAt > -1 ? process.argv[outAt + 1] : null;

const guides = JSON.parse(readFileSync(resolve(ROOT, "field-guides", "content", "guides.json"), "utf8"));
const age = (iso) => Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86400000);

// Some vendor sites refuse bots (403/429) while the page is fine in a
// browser; those are reported separately rather than as broken.
const check = async (url) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; paracausaltelemetry-link-check)", Accept: "text/html" }
      });
      if (response.ok) return { status: response.status, state: "ok" };
      if ([401, 403, 429].includes(response.status)) return { status: response.status, state: "blocked" };
      if (attempt === 1 || response.status < 500) return { status: response.status, state: "broken" };
    } catch (error) {
      if (attempt === 1) return { status: error.name === "TimeoutError" ? "timeout" : "error", state: "broken" };
    }
  }
  return { status: "error", state: "broken" };
};

const due = guides.filter((g) => age(g.verified) > DUE_DAYS);
const soon = guides.filter((g) => age(g.verified) > SOON_DAYS && age(g.verified) <= DUE_DAYS);
const links = guides.flatMap((g) => (g.references || []).map((ref) => ({ guide: g.slug, ...ref })));
// a few at a time: vendor doc sites drop bursts of parallel connections
const results = [];
const queue = [...links];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const link = queue.shift();
    results.push({ ...link, ...(await check(link.url)) });
  }
}));
const broken = results.filter((r) => r.state === "broken");
const blocked = results.filter((r) => r.state === "blocked");

const lines = ["# Field guide review", ""];
const row = (g) => `| [${g.title}](https://paracausaltelemetry.com/field-guides/${g.slug}/) | ${g.verified} | ${age(g.verified)} days |`;
if (due.length) lines.push(`## Due a re-check (last checked over ${DUE_DAYS} days ago)`, "", "| Guide | Checked | Age |", "| --- | --- | --- |", ...due.map(row), "");
if (soon.length) lines.push("## Due within a month", "", "| Guide | Checked | Age |", "| --- | --- | --- |", ...soon.map(row), "");
if (broken.length) lines.push("## Broken references", "", "| Guide | Reference | Status |", "| --- | --- | --- |", ...broken.map((r) => `| ${r.guide} | [${r.label}](${r.url}) | ${r.status} |`), "");
if (blocked.length) lines.push("## Refused to the checker (check in a browser)", "", "| Guide | Reference | Status |", "| --- | --- | --- |", ...blocked.map((r) => `| ${r.guide} | [${r.label}](${r.url}) | ${r.status} |`), "");
lines.push(`${guides.length} guides, ${links.length} references checked: ${due.length} due, ${soon.length} due soon, ${broken.length} broken, ${blocked.length} refused.`, "");
lines.push("After re-checking a guide against the vendor's docs, set its `verified` date in `field-guides/content/guides.json` and run `node scripts/build-field-guides.mjs`.");

const report = `${lines.join("\n")}\n`;
if (out) writeFileSync(out, report, "utf8");
else process.stdout.write(report);
// for the workflow: whether there is anything to act on
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `attention=${due.length || broken.length ? "true" : "false"}\n`, { flag: "a" });
