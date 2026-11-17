#!/usr/bin/env python3
"""Draw the emblem for the homepage hero card's hidden signal.

One-off asset generation (Pillow only): run by hand, then commit the output.

Writes src/hero-signal/emblem.svg: an octopus set in characters, as SVG <text>
on a fixed grid, sorted into three groups (rim, body, core) that
js/hero-signal.js inlines into the card and hero-signal.css colours and pulses.
The SVG carries classes, not colours.

With --backdrop, it also writes src/hero-signal/backdrop.webp, the dark sea the
emblem sits on, from a source painting: J. M. W. Turner, "The Fighting
Temeraire" (1839, public domain). The painting is taken down to a deep, cold
blue-black so only the shapes of the ships, the sun and the water survive.
The source is not committed; pass its path. Use a large scan: the
National Gallery's, on Wikimedia Commons ("The Fighting Temeraire, JMW
Turner, National Gallery.jpg", 5684 px wide).

    python scripts/build-hero-signal.py
    python scripts/build-hero-signal.py --backdrop path/to/temeraire.jpg
"""

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "hero-signal" / "emblem.svg"

CELL_W, CELL_H = 1.38, 2.3  # one character, in SVG units
ASCII_COLS, ASCII_ROWS = 50, 30


def text_runs(row, left, baseline):
    """One row of the grid as <text> runs, skipping the blanks between them."""
    out, col = [], 0
    while col < len(row):
        if row[col] == " ":
            col += 1
            continue
        end = col
        while end < len(row) and row[end] != " ":
            end += 1
        run = row[col:end].replace("&", "&amp;")
        x = left + col * CELL_W
        out.append(f'<text x="{x:.1f}" y="{baseline:.2f}" textLength="{(end - col) * CELL_W:.1f}" lengthAdjust="spacingAndGlyphs">{run}</text>')
        col = end
    return out


def emblem_mask(scale=10):
    """Oval head, spread shoulders, seven arms hanging like blades, the middle
    one longest. Drawn on a 100 by 100 design grid at scale px per cell."""
    w, h = ASCII_COLS * scale, ASCII_ROWS * scale
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)

    def pt(x, y):
        return (x / 100.0 * w, y / 100.0 * h)

    def poly(points):
        d.polygon([pt(x, y) for x, y in points], fill=255)

    def both(points):
        poly(points)
        poly([(100 - x, y) for x, y in points])

    # head and neck
    d.ellipse(pt(38, 5) + pt(62, 39), fill=255)
    poly([(44, 34), (56, 34), (58, 44), (42, 44)])
    # shoulders: out and slightly up from the neck, then over and down
    both([(50, 38), (43, 39), (37, 44), (26, 41), (14, 36), (7, 37), (3, 42), (4, 46), (14, 47), (17, 48), (29, 50), (31, 52), (42, 54), (44, 56), (50, 56)])
    # the arms, each a blade from the body to a point
    both([(3, 42), (14, 44), (12, 56), (9, 69), (6, 56)])
    both([(17, 45), (29, 47), (27, 63), (25, 79), (21, 63)])
    both([(31, 49), (42, 51), (40, 67), (38, 84), (34, 67)])
    poly([(44, 52), (56, 52), (52, 77), (50, 100), (48, 77)])
    return m


def emblem():
    scale = 10
    px = emblem_mask(scale).load()
    cover = [[0.0] * ASCII_COLS for _ in range(ASCII_ROWS)]
    for r in range(ASCII_ROWS):
        for col in range(ASCII_COLS):
            total = 0
            for y in range(r * scale, (r + 1) * scale):
                for x in range(col * scale, (col + 1) * scale):
                    total += 1 if px[x, y] else 0
            cover[r][col] = total / float(scale * scale)

    def solid(r, col):
        return 0 <= r < ASCII_ROWS and 0 <= col < ASCII_COLS and cover[r][col] > 0.82

    def depth(r, col):
        """0 rim, 1 body, 2 core: how far a full cell sits from the edge."""
        if not solid(r, col):
            return 0
        ring = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if not all(solid(r + dr, col + dc) for dr, dc in ring):
            return 0
        return 2 if all(solid(r + dr, col + dc) and all(solid(r + dr + er, col + dc + ec) for er, ec in ring) for dr, dc in ring) else 1

    rows = {1: [], 2: [], 3: []}
    for r in range(ASCII_ROWS):
        line = {1: [" "] * ASCII_COLS, 2: [" "] * ASCII_COLS, 3: [" "] * ASCII_COLS}
        for col in range(ASCII_COLS):
            v = cover[r][col]
            if v < 0.12:
                continue
            pick = (col * 7 + r * 13) % 3
            if v <= 0.82:
                line[1][col] = ".:;"[min(2, int(v / 0.3))] if v < 0.6 else "+x*"[pick]
            else:
                d = depth(r, col)
                if d == 0:
                    line[1][col] = "*x+"[pick]
                elif d == 1:
                    line[2][col] = "%#%"[pick]
                else:
                    line[3][col] = "@&@"[pick]
        for k in rows:
            rows[k].append("".join(line[k]))

    # A 320 by 80 box, the emblem centred with its feet near the foot of the
    # card; the card slices the sides off to fit.
    width, height = 320, 80
    left = width / 2 - ASCII_COLS * CELL_W / 2
    top = height - 3 - ASCII_ROWS * CELL_H
    parts = []
    for k in (1, 2, 3):
        texts = []
        for r, row in enumerate(rows[k]):
            texts += text_runs(row, left, top + (r + 1) * CELL_H - 0.35)
        parts.append(f'<g class="a{k}">{"".join(texts)}</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMax slice">{"".join(parts)}</svg>\n'


BACKDROP = ROOT / "src" / "hero-signal" / "backdrop.webp"
BACKDROP_W = 2000
# The two ends of the tint: the darkest shadow and the brightest light the
# painting is allowed. Everything between is mapped along a curve that keeps
# the shadows deep, so the picture reads as a night sea rather than a dim one.
SHADOW = (4, 7, 10)
LIGHT = (70, 92, 104)


def backdrop(source):
    """The source should be a large scan (the National Gallery's, on Wikimedia
    Commons, is 5684 px wide), so the backdrop is scaled down and keeps the
    painting's own detail."""
    im = Image.open(source).convert("RGB")
    w = BACKDROP_W
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    grey = ImageOps.grayscale(im)
    grey = ImageOps.autocontrast(grey, cutoff=1)
    # A gamma above 1 pushes the mid-tones down into the shadows.
    grey = grey.point(lambda v: round(255 * (v / 255) ** 1.9))
    toned = ImageOps.colorize(grey, black=SHADOW, white=LIGHT)
    # A light crisp-up after the resize, for the rigging and the hull lines.
    toned = toned.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=3))
    # A trace of the original warmth where the sun sits, so it reads as a
    # dying light and not a hole in the cloud.
    warm = Image.blend(toned, im.point(lambda v: round(v * 0.32)), 0.16)
    BACKDROP.parent.mkdir(parents=True, exist_ok=True)
    warm.save(BACKDROP, "WEBP", quality=74, method=6)
    print(f"{BACKDROP.name} {warm.size[0]}x{warm.size[1]} {BACKDROP.stat().st_size // 1024} KB")


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    svg = emblem()
    OUT.write_text(svg, encoding="utf-8", newline="\n")
    print(f"{OUT.name} {len(svg)} bytes")
    if "--backdrop" in sys.argv:
        backdrop(Path(sys.argv[sys.argv.index("--backdrop") + 1]))


if __name__ == "__main__":
    main()
