#!/usr/bin/env python3
"""One-off subsetter for the Observer wordmark font (src/fonts/cormorant-observer.woff2).

Cuts the 209 KB Cormorant Garamond variable file down to the glyphs the Observer
wordmark actually draws, pinned to a single weight. The wordmark renders the
radar glyph in place of the capital O, so only "bserver" is strictly needed, but
the capital is kept for the .visually-hidden accessible name and for any fallback
render before the SVG paints.

Deps: fonttools + brotli. Build-free/one-off:
    python scripts/build-observer-wordmark-font.py
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "fonts" / "cormorant-garamond-var.woff2"
TARGET = ROOT / "src" / "fonts" / "cormorant-observer.woff2"
TEXT = "Observer"
WEIGHT = 500

font = TTFont(SOURCE)
font = instantiateVariableFont(font, {"wght": WEIGHT}, inplace=True, updateFontNames=False)

options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["kern", "liga"]
options.desubroutinize = True
options.name_IDs = ["*"]
options.notdef_outline = False

subsetter = subset.Subsetter(options=options)
subsetter.populate(text=TEXT)
subsetter.subset(font)
font.flavor = "woff2"
font.save(TARGET)

kept = sorted(set(TEXT))
print(f"{TARGET.relative_to(ROOT)}: {TARGET.stat().st_size / 1024:.1f} KB, glyphs {''.join(kept)} at wght {WEIGHT}")
