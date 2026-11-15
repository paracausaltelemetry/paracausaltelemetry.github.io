// og:image and twitter:image for every page: the one site-wide social card,
// src/social-preview.png (made by scripts/build-social-card.py). The ?v= is a
// hash of the image, so a changed card gets a new URL and platforms that
// cache previews fetch it again. The hand-written pages carry the same URL;
// scripts/cache-bust.ps1 restamps their hash at release.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = "https://paracausaltelemetry.com";

const card = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "social-preview.png");
const hash = createHash("sha256").update(readFileSync(card)).digest("hex").slice(0, 8);

export const SHARE_IMAGE = `${SITE}/src/social-preview.png?v=${hash}`;
export const SHARE_IMAGE_ALT = "Tartan woven in the site's colours, with an octopus emblem set in type";
