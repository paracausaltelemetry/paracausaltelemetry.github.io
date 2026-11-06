// Images a writeup embeds live beside its markdown in the CTF-Writeups repo,
// but the served CSP only allows same-origin images. So each one is served
// from beside the writeup's own page as WebP (copied there by
// scripts/fetch-writeup-images.py). Shared by the static pages
// (scripts/build-content-index.mjs, which also lists the copies to make) and
// the in-page reader (js/writeups.js), so both point at the same file.

const IMAGE_FILE = /\.(png|jpe?g|gif|webp)$/i;

const fileSlug = (value) =>
  value.toLowerCase().replace(IMAGE_FILE, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";

const repoPathOf = (sourcePath, target) => {
  let decoded = target;
  try { decoded = decodeURIComponent(target); } catch { /* keep as written */ }
  const segments = sourcePath.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
};

/**
 * Points relative image links (outside code fences) at their same-origin copy.
 * @param {string} markdown  Writeup body.
 * @param {{ path: string, url: string }} writeup  repo path and page URL ("/writeups/.../").
 * @returns {{ body: string, images: { path: string, dest: string }[] }}
 */
export const localiseImages = (markdown, { path, url }) => {
  const images = [];
  if (!url) return { body: String(markdown), images };
  let fence = "";
  const body = String(markdown)
    .split("\n")
    .map((line) => {
      const marker = line.match(/^\s*(```|~~~)/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1] === fence) fence = "";
        return line;
      }
      if (fence) return line;
      return line.replace(/!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)\)/g, (whole, alt, raw) => {
        const target = raw.replace(/^<|>$/g, "");
        if (/^(https?:|data:|\/|#)/i.test(target) || !IMAGE_FILE.test(target)) return whole;
        const source = repoPathOf(path, target);
        const dest = `${url}${fileSlug(source.split("/").at(-1))}.webp`;
        images.push({ path: source, dest });
        return `![${alt}](${dest})`;
      });
    })
    .join("\n");
  return { body, images };
};
