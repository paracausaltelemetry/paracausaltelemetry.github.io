#!/usr/bin/env python3
"""One-off generator for the site's social preview card (src/social-preview.png).

Every page on the site uses this one card for og:image and twitter:image. It is
the homepage hero's hidden signal in dark mode, with no text: the tartan woven
from the page's own colours and the octopus emblem set in type. It is rendered
from the real stylesheets (styles.css for the dark tokens, hero-signal.css for
the overlay) and the real emblem (src/hero-signal/emblem.svg), so it matches
the site exactly.

Run it after changing either stylesheet's signal colours or the emblem, then
commit the PNG. The builders hash the file into the image URL
(scripts/lib/share-image.mjs), so re-run the builders afterwards; the
hand-written pages carry the same hash and are restamped by cache-bust.ps1.

Deps: Playwright with Chromium (pip install playwright; playwright install
chromium). Build-free/one-off:
    python scripts/build-social-card.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "social-preview.png"
W, H = 1200, 630


def page_html():
    emblem = (ROOT / "src" / "hero-signal" / "emblem.svg").read_text(encoding="utf-8")
    styles = (ROOT / "styles.css").as_uri()
    signal = (ROOT / "hero-signal.css").as_uri()
    # The pulse is frozen with each weight of character a little brighter than
    # the one outside it, so the still card keeps the depth of the moving one.
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="{styles}" />
    <link rel="stylesheet" href="{signal}" />
    <style>
      html, body {{ width: {W}px; height: {H}px; margin: 0; overflow: hidden; background: var(--bg); }}
      .hero-signal g {{ animation: none !important; }}
      .hero-signal .a1 {{ opacity: 0.72; }}
      .hero-signal .a2 {{ opacity: 0.9; }}
      .hero-signal .a3 {{ opacity: 1; }}
    </style>
  </head>
  <body>
    <div class="hero-signal"><div class="hero-signal-emblem">{emblem}</div></div>
  </body>
</html>
"""


def main():
    scratch = ROOT / "src" / ".social-card.html"
    scratch.write_text(page_html(), encoding="utf-8")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="dark")
            page.goto(scratch.as_uri())
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            page.screenshot(path=str(OUT), clip={"x": 0, "y": 0, "width": W, "height": H})
            browser.close()
    finally:
        scratch.unlink(missing_ok=True)
    print(f"{OUT.relative_to(ROOT)} {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
