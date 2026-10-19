// og:image for a page: its own share card (og.png beside the page, made by
// scripts/build-share-cards.py) when one exists, else the section's card.
// The ?v= is a hash of the image, so a changed card gets a new URL and
// platforms that cache previews fetch it again.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SITE = "https://paracausaltelemetry.com";

export const shareImage = (root, pagePath, fallback) => {
  const file = resolve(root, `.${pagePath}`, "og.png");
  if (!existsSync(file)) return fallback;
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
  return `${SITE}${pagePath}og.png?v=${hash}`;
};
