#!/usr/bin/env python3
"""One-off webfont builder for the body face.

Takes the vendor download and produces the latin-subset WOFF2 file the site
actually serves:

  Geist[wght].woff2  ->  src/fonts/geist-var.woff2      (body, variable wght)

Point --source at the directory holding the unpacked vendor files. Geist is
looked up under a Geist/webfonts subdirectory as shipped in the release zip.

Licence: Geist is SIL OFL 1.1 (vercel/geist-font), which permits subsetting
and redistribution.

Deps: fonttools + brotli. Build-free/one-off:
    python scripts/build-webfonts.py --source path/to/unpacked
"""
import argparse
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "src" / "fonts"

# The latin subset the site already standardised on, plus the three symbols the
# interface draws in body text: the CTA arrow, the external-link arrow, and the
# middot used as a separator.
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,"
    "U+2192,U+2197,U+2212,U+2215,U+FEFF,U+FFFD"
)


def build(source: Path, target: Path, unicodes: str) -> None:
    if not source.exists():
        raise SystemExit(f"missing source font: {source}")
    font = TTFont(source)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga"]
    options.desubroutinize = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(unicodes))
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(target)
    print(f"  {target.relative_to(ROOT)}  {target.stat().st_size / 1024:.1f} KB")


def resolve(source_root: Path, *candidates: str) -> Path:
    for candidate in candidates:
        path = source_root / candidate
        if path.exists():
            return path
    return source_root / candidates[0]


parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True, type=Path, help="directory holding the unpacked vendor fonts")
args = parser.parse_args()
source_root = args.source.resolve()

print("Building webfonts:")
build(
    resolve(source_root, "geist-font/Geist/webfonts/Geist[wght].woff2", "Geist[wght].woff2"),
    FONTS / "geist-var.woff2",
    LATIN,
)
