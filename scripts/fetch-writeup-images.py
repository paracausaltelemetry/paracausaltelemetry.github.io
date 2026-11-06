#!/usr/bin/env python3
"""Copy the images writeups embed onto the site as WebP.

Writeups keep their images beside their markdown in the CTF-Writeups repo. The
served CSP only allows same-origin images, so scripts/build-content-index.mjs
points each one at a WebP copy beside the writeup's page (js/writeup-images.js)
and lists them in writeups/meta/writeup-images.json:

    [{"src": "https://raw.githubusercontent.com/...png", "dest": "writeups/htb/.../<page>/<name>.webp"}]

This makes every copy that is missing, at most MAX_WIDTH px wide (a WebP that
already fits is copied byte for byte). Existing files are left alone, so to
replace an image in a writeup, give it a new file name. Never fatal: a failed
download is reported and retried on the next run.

    python scripts/fetch-writeup-images.py

Needs Pillow. Run after build-content-index.mjs (the content-index workflow does).
"""
import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "writeups" / "meta" / "writeup-images.json"
MAX_WIDTH = 1600
QUALITY = 80
MAX_BYTES = 20 * 1024 * 1024
UA = "paracausaltelemetry-site-build"


def main():
    if not MANIFEST.exists():
        sys.exit("writeups/meta/writeup-images.json not found; run node scripts/build-content-index.mjs first")
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
    writeups = (ROOT / "writeups").resolve()
    missing = []
    for entry in entries:
        src, dest = entry.get("src", ""), (ROOT / entry.get("dest", "")).resolve()
        # only GitHub raw files, only into writeups/, only .webp
        if not src.startswith("https://raw.githubusercontent.com/") or writeups not in dest.parents or dest.suffix != ".webp":
            print(f"  WARN skipped {entry}")
            continue
        if not dest.exists():
            missing.append((src, dest))
    print(f"Writeup images: {len(entries)} listed, {len(missing)} to fetch")
    failed = 0
    for src, dest in missing:
        try:
            request = urllib.request.Request(src, headers={"User-Agent": UA})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError("over 20 MB")
            image = Image.open(io.BytesIO(raw))
            dest.parent.mkdir(parents=True, exist_ok=True)
            if image.format == "WEBP" and image.width <= MAX_WIDTH:
                dest.write_bytes(raw)
                continue
            image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
            if image.width > MAX_WIDTH:
                image = image.resize((MAX_WIDTH, round(image.height * MAX_WIDTH / image.width)), Image.LANCZOS)
            dest.parent.mkdir(parents=True, exist_ok=True)
            image.save(dest, "WEBP", quality=QUALITY, method=6)
        except Exception as error:  # noqa: BLE001 - report and carry on
            failed += 1
            print(f"  WARN {src}: {error}")
    print(f"Writeup images: {len(missing) - failed} written, {failed} failed")


if __name__ == "__main__":
    main()
