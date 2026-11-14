#!/usr/bin/env python3
"""Draw the art for the two homepage hero card themes.

One-off asset generation (Pillow only): run by hand after changing an emblem,
then commit the output. Writes src/seasonal/<id>.svg, one per theme. Each is an
emblem set in characters: SVG <text> on a fixed grid, sorted into groups that
js/seasonal.js inlines into the hero card and seasonal.css colours and pulses.
The SVGs carry classes, not colours.

    python scripts/build-seasonal-art.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "seasonal"

CELL_W, CELL_H = 1.38, 2.3  # one character, in SVG units


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


# ── Skyfall: an octopus emblem. Oval head, spread shoulders, seven arms hanging
#    like blades, the middle one longest. Three weights of character (rim, body,
#    core) so the stylesheet can pulse it from the inside out. ─────────────────

ASCII_COLS, ASCII_ROWS = 50, 30


def emblem_mask(scale=10):
    """The emblem on a 100 by 100 design grid, rasterised at scale px per cell."""
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


def skyfall():
    scale = 10
    m = emblem_mask(scale)
    px = m.load()
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


# ── HMS Victory: the White Ensign, flying. St George's cross on white, the
#    Union in the upper hoist, a staff at the hoist. Three groups by colour
#    (white, red, blue) plus the staff, so the stylesheet can colour them and
#    pulse them in turn. ───────────────────────────────────────────────────────

FLAG_COLS, FLAG_ROWS = 84, 26


def ensign(u, v):
    """Which colour the ensign is at (u, v), both 0 to 1 from the upper hoist."""
    if abs(u - 0.5) < 0.042 or abs(v - 0.5) < 0.085:
        return "r"
    if u < 0.458 and v < 0.415:
        cu, cv = u / 0.458, v / 0.415
        if abs(cu - 0.5) < 0.06 or abs(cv - 0.5) < 0.1:
            return "r"
        if abs(cu - 0.5) < 0.11 or abs(cv - 0.5) < 0.19:
            return "w"
        # the saltires; the red is counterchanged, so it sits to one side
        shift = 0.035 if cu < 0.5 else -0.035
        for d in (cv - cu, cv - (1 - cu)):
            if abs(d - shift) < 0.035:
                return "r"
        if abs(cv - cu) < 0.11 or abs(cv - (1 - cu)) < 0.11:
            return "w"
        return "b"
    return "w"


def navy():
    ripple, margin_top, margin_left = 1.1, 3, 4
    total_rows = margin_top + FLAG_ROWS + 11
    total_cols = margin_left + FLAG_COLS + 2
    chars = {"w": "@&@", "r": "#%#", "b": "x+*"}
    lines = {k: [[" "] * total_cols for _ in range(total_rows)] for k in ("w", "r", "b", "p")}
    for col in range(FLAG_COLS):
        # the cloth hangs a little and ripples more the further it is from the staff
        drop = ripple * math.sin(col / 8.5) * min(1.0, col / 12.0) + col * 0.018
        for r in range(-3, FLAG_ROWS + 5):
            v = (r + 0.5 - drop) / FLAG_ROWS
            if not 0 <= v < 1:
                continue
            kind = ensign((col + 0.5) / FLAG_COLS, v)
            row = margin_top + r
            if 0 <= row < total_rows:
                lines[kind][row][margin_left + col] = chars[kind][(col * 7 + r * 13) % 3]
    # the staff, with its truck
    for row in range(margin_top - 1, total_rows):
        lines["p"][row][margin_left - 2] = "|"
        lines["p"][row][margin_left - 1] = "|"
    lines["p"][margin_top - 2][margin_left - 2] = "("
    lines["p"][margin_top - 2][margin_left - 1] = ")"

    width = total_cols * CELL_W + 2
    height = total_rows * CELL_H + 2
    parts = []
    for k in ("p", "w", "r", "b"):
        texts = []
        for r, row in enumerate(lines[k]):
            texts += text_runs("".join(row), 1, 1 + (r + 1) * CELL_H - 0.35)
        parts.append(f'<g class="e{k}">{"".join(texts)}</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.1f} {height:.1f}" preserveAspectRatio="xMidYMid meet">{"".join(parts)}</svg>\n'


SCENES = {"navy": navy, "skyfall": skyfall}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in SCENES.items():
        svg = fn()
        (OUT / f"{name}.svg").write_text(svg, encoding="utf-8", newline="\n")
        print(f"{name}.svg {len(svg)} bytes")


if __name__ == "__main__":
    main()
