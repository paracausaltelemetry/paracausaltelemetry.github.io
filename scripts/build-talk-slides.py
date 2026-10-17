#!/usr/bin/env python3
"""One-off generator for a talk's slide assets (talks/<slug>/).

From the exported PDF deck it writes:
  talks/<slug>/<slug>.pdf          the download, with its slide images
                                   re-encoded at 2560px (text layer kept)
  talks/<slug>/slides/NN.webp      1600px slide, for the viewer
  talks/<slug>/slides/NN-800.webp  800px slide, for phones (srcset)
  talks/<slug>/slides/NN-thumb.webp  320px thumbnail
  talks/<slug>/og.jpg              1200x630 social card from slide 1
  talks/<slug>/slides.json         per-slide title and text

Then run `node scripts/build-talks.mjs` to regenerate the talk page.

Deps: PyMuPDF, Pillow. Build-free/one-off:
    python scripts/build-talk-slides.py "path/to/deck.pdf" fake-people-real-consequences
"""
import io
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SLIDE_W, PHONE_W, THUMB_W, PDF_W = 1600, 800, 320, 2560


def render(page, width):
    """The whole page as a Pillow image at the given pixel width."""
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def title_of(page):
    """Large text in the top part of the slide, in reading order. Bare
    numbers (big statistics) and lone punctuation are skipped."""
    limit = page.rect.height * 0.45
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span["text"].strip()
                if span["size"] < 28 or span["bbox"][1] > limit:
                    continue
                if not re.search(r"[A-Za-z]{2}", text):
                    continue
                spans.append((round(span["bbox"][1]), span["bbox"][0], text))
    spans.sort()
    return re.sub(r"\s+", " ", " ".join(s[2] for s in spans)).strip(" .")


def slim_pdf(source, target):
    """Copy the deck with each slide image downscaled to PDF_W and re-saved
    as JPEG. Pages, text and links are untouched."""
    doc = fitz.open(source)
    seen = set()
    for page in doc:
        for img in page.get_images(full=True):
            xref = img[0]
            if xref in seen:
                continue
            seen.add(xref)
            info = doc.extract_image(xref)
            im = Image.open(io.BytesIO(info["image"])).convert("RGB")
            if im.width > PDF_W:
                im = im.resize((PDF_W, round(im.height * PDF_W / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=86, optimize=True, progressive=True)
            if len(buf.getvalue()) < len(info["image"]):
                page.replace_image(xref, stream=buf.getvalue())
    doc.save(target, garbage=4, deflate=True, clean=True)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    source, slug = Path(sys.argv[1]), sys.argv[2]
    out = ROOT / "talks" / slug
    (out / "slides").mkdir(parents=True, exist_ok=True)

    doc = fitz.open(source)
    slides = []
    for i, page in enumerate(doc, start=1):
        n = f"{i:02d}"
        big = render(page, SLIDE_W)
        big.save(out / "slides" / f"{n}.webp", "WEBP", quality=82, method=6)
        big.resize((PHONE_W, round(big.height * PHONE_W / big.width)), Image.LANCZOS) \
            .save(out / "slides" / f"{n}-800.webp", "WEBP", quality=80, method=6)
        big.resize((THUMB_W, round(big.height * THUMB_W / big.width)), Image.LANCZOS) \
            .save(out / "slides" / f"{n}-thumb.webp", "WEBP", quality=72, method=6)
        if i == 1:
            card = big.resize((1200, 675), Image.LANCZOS).crop((0, 22, 1200, 652))
            card.save(out / "og.jpg", "JPEG", quality=86, optimize=True, progressive=True)
        text = re.sub(r"\s+", " ", page.get_text()).strip()
        slides.append({"n": i, "title": title_of(page), "text": text})

    (out / "slides.json").write_text(json.dumps({"width": SLIDE_W, "height": round(SLIDE_W * 9 / 16), "slides": slides}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    slim_pdf(source, out / f"{slug}.pdf")
    size = (out / f"{slug}.pdf").stat().st_size / 1024 / 1024
    print(f"{len(slides)} slides written to {out.relative_to(ROOT)}; PDF {size:.1f} MB (was {source.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
