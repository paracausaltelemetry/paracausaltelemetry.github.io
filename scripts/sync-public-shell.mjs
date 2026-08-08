import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFooter, renderHeader } from "./lib/site-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const pages = [
  ["index.html", "Projects and Writeups", "home"],
  ["404.html", "Page not found", ""],
  ["credentials/index.html", "Credentials", ""],
  ["design/index.html", "Design", ""],
  ["projects/index.html", "Projects", "projects"],
  ["projects/pwn2play/index.html", "Pwn2Play", "projects"],
  ["writeups/index.html", "Writeups", "writeups"],
  ["observer/index.html", "Observer", "observer"]
];

const headerPattern = /<header class="site-header"[^>]*>[\s\S]*?<\/header>/;
const footerPattern = /<footer class="site-footer(?: site-footer-unified)?">[\s\S]*?<\/footer>/;
const stale = [];

for (const [relativePath, label, current] of pages) {
  const file = resolve(ROOT, relativePath);
  if (!existsSync(file)) throw new Error(`${relativePath}: file does not exist`);
  const before = readFileSync(file, "utf8");
  if (!headerPattern.test(before) || !footerPattern.test(before)) throw new Error(`${relativePath}: shared shell could not be located`);
  const after = before
    .replace(headerPattern, renderHeader({ label, current }))
    .replace(footerPattern, renderFooter());
  if (before === after) continue;
  if (CHECK) stale.push(relativePath);
  else writeFileSync(file, after, "utf8");
}

if (stale.length) {
  console.error(`Public shell is stale:\n${stale.join("\n")}`);
  process.exit(1);
}

console.log(`${pages.length} public shell page${pages.length === 1 ? "" : "s"} ${CHECK ? "checked" : "updated"}.`);
