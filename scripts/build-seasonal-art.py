#!/usr/bin/env python3
"""Draw the pixel-art scenes for the seasonal hero cards.

One-off asset generation (Pillow only): run by hand after changing a scene,
then commit the output. Writes src/seasonal/<id>.svg, one per dress, each a
320 by 80 cell scene in four tones, plus three fixed flag colours. The SVGs carry classes (s1 to s4), not
colours: js/seasonal.js inlines the file into the hero card and seasonal.css
gives the tones their colour for the dark and the light side of each dress.

    python scripts/build-seasonal-art.py            # write the scenes
    python scripts/build-seasonal-art.py --preview out.png
    python scripts/build-seasonal-art.py --emblems  # print the 32px selector emblems
"""

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 320, 80
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "seasonal"


class Canvas:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.cells = [[0] * w for _ in range(h)]

    def set(self, x, y, tone):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.cells[y][x] = tone

    def get(self, x, y):
        return self.cells[y][x] if 0 <= x < self.w and 0 <= y < self.h else 0

    def mask(self):
        return Image.new("L", (self.w, self.h), 0)

    def stamp(self, mask, tone, dither=None, only=None):
        """Paint tone wherever mask is set. dither: (period, phase) checker."""
        px = mask.load()
        for y in range(self.h):
            for x in range(self.w):
                if not px[x, y]:
                    continue
                if dither and (x + y * dither[1]) % dither[0]:
                    continue
                if only is not None and self.cells[y][x] not in only:
                    continue
                self.cells[y][x] = tone

    def shape(self, tone, fn, **kw):
        m = self.mask()
        fn(ImageDraw.Draw(m))
        self.stamp(m, tone, **kw)

    def rect(self, x0, y0, x1, y1, tone, **kw):
        self.shape(tone, lambda d: d.rectangle((x0, y0, x1, y1), fill=255), **kw)

    def poly(self, pts, tone, **kw):
        self.shape(tone, lambda d: d.polygon(pts, fill=255), **kw)

    def line(self, pts, tone, width=1, **kw):
        self.shape(tone, lambda d: d.line(pts, fill=255, width=width), **kw)

    def ellipse(self, box, tone, **kw):
        self.shape(tone, lambda d: d.ellipse(box, fill=255), **kw)

    def ridge(self, fn, tone, **kw):
        """Fill from y = fn(x) down to the bottom edge."""
        m = self.mask()
        px = m.load()
        for x in range(self.w):
            for y in range(max(0, int(round(fn(x)))), self.h):
                px[x, y] = 255
        self.stamp(m, tone, **kw)

    def sprite(self, rows, ox, oy, tones, flip=False):
        for y, row in enumerate(rows):
            row = row[::-1] if flip else row
            for x, ch in enumerate(row):
                if ch in tones:
                    self.set(ox + x, oy + y, tones[ch])


# ── Flags: drawn flat in their own colours (tones 5 red, 6 blue, 7 white), then
#    hung from the hoist with a ripple so they read as flying ─────────────────

def white_ensign(x, y, w, h):
    """White Ensign: St George's cross on white, the Union in the upper hoist."""
    cx, cy = w // 2, h // 2
    if cx - 1 <= x <= cx + 1 or cy - 1 <= y <= cy:
        return 5
    if x < cx - 1 and y < cy - 1:
        cw, ch = cx - 1, cy - 1
        mx, my = (cw - 1) / 2.0, (ch - 1) / 2.0
        if abs(x - mx) < 1 or abs(y - my) < 1:
            return 5
        if abs(x - mx) < 2 or abs(y - my) < 2:
            return 7
        d1 = abs(y - x * ch / float(cw))
        d2 = abs(y - (ch - 1 - x * ch / float(cw)))
        return 7 if min(d1, d2) < 0.8 else 6
    return 7


def fly(c, hoist_x, top_y, w, h, design, direction=1, ripple=1.6):
    """Hang a flag from (hoist_x, top_y). direction 1 flies right, -1 left."""
    for i in range(w):
        drop = int(round(ripple * math.sin(i / 4.2) * min(1.0, i / 6.0) + i * 0.06))
        for j in range(h):
            tone = design(i, j, w, h)
            if tone:
                c.set(hoist_x + direction * (i + 1), top_y + j + drop, tone)
        # a shadow in each trough gives the cloth some body
        if math.cos(i / 4.2) < -0.75:
            c.set(hoist_x + direction * (i + 1), top_y + h + drop, 1)



# ── Royal Navy: a first-rate under full sail, the Nelson chequer on her side ──

def navy():
    c = Canvas()
    rnd = random.Random(1805)
    for _ in range(46):
        x, y = rnd.randrange(0, 320), rnd.randrange(0, 46)
        c.set(x, y, 4 if rnd.random() < 0.5 else 3)
    # moon, half of it dithered away
    c.ellipse((58, 8, 76, 26), 2)
    c.ellipse((63, 6, 81, 24), 0)
    c.ellipse((58, 8, 76, 26), 2, dither=(2, 1), only={0})

    # two sail of the line, hull down on the horizon
    for ox, s in ((34, 1.0), (112, 0.7)):
        base = 66
        c.rect(ox, base - 2, ox + int(16 * s), base, 3)
        for i, (mx, mh) in enumerate(((3, 12), (8, 15), (13, 11))):
            mx, mh = ox + int(mx * s), int(mh * s)
            c.rect(mx, base - 2 - mh, mx, base - 2, 3)
            c.rect(mx - 2, base - mh, mx + 2, base - mh + int(mh * 0.4), 3)
            c.rect(mx - 1, base - mh + int(mh * 0.5), mx + 2, base - 4, 3)

    water = 67
    # standing rigging first, so the sails sit over it
    for a, b in (((254, 3), (316, 40)), ((278, 8), (316, 40)), ((254, 3), (210, 46)), ((232, 12), (210, 46))):
        c.line([a, b], 1)
    # bowsprit and jibs
    c.line([(292, 51), (317, 39)], 1, width=2)
    c.poly([(298, 47), (313, 40), (281, 15)], 4)
    c.poly([(294, 49), (304, 44), (280, 26)], 4)
    c.line([(298, 47), (281, 15)], 3)
    # masts: (x, top, [(yard y, sail bottom, half width top, half width bottom)])
    masts = (
        (232, 12, [(14, 23, 6, 8), (25, 35, 8, 10)]),
        (254, 3, [(6, 15, 7, 9), (17, 31, 10, 13), (33, 49, 14, 16)]),
        (278, 8, [(11, 19, 6, 8), (21, 33, 9, 11), (35, 49, 12, 14)]),
    )
    for mx, top, sails in masts:
        c.rect(mx, top, mx + 1, 54, 1)
        for yard, foot, wt, wb in sails:
            c.poly([(mx - wt, yard + 1), (mx + 1 + wt, yard + 1), (mx + 1 + wb, foot), (mx - wb, foot)], 4)
            # shade the weather side and belly the foot
            c.poly([(mx - wt, yard + 1), (mx - wt + 3, yard + 1), (mx - wb + 4, foot), (mx - wb, foot)], 3, dither=(2, 1))
            c.line([(mx - wb + 2, foot), (mx + wb - 1, foot)], 3)
            c.rect(mx - wt - 1, yard, mx + 2 + wt, yard, 1)
        c.set(mx, top - 1, 1)
    # spanker on the mizzen
    c.poly([(231, 37), (214, 33), (211, 50), (231, 50)], 4)
    c.line([(231, 37), (213, 32)], 1)
    c.line([(231, 50), (209, 50)], 1)
    # pennant and ensign
    c.line([(254, 2), (242, 1)], 2)
    c.line([(255, 3), (247, 3)], 2)
    # the White Ensign at the stern, streaming aft
    c.line([(211, 46), (205, 25)], 1)
    fly(c, 205, 25, 30, 17, white_ensign, direction=-1)

    # hull
    hull = [(210, 45), (224, 45), (225, 52), (288, 52), (294, 49), (298, 49), (290, water + 2), (216, water + 2), (211, 58)]
    c.poly(hull, 1)
    m = c.mask()
    ImageDraw.Draw(m).polygon(hull, fill=255)
    inside = m.load()
    for y in (55, 56, 59, 60, 63, 64):
        for x in range(212, 296):
            if inside[x, y] and inside[x - 1, y] and inside[x + 1, y]:
                port = (x - 214) % 6 < 2 and y in (55, 59, 63)
                c.set(x, y, 1 if port else 2)
    for x in (213, 216, 219, 222):
        c.set(x, 48, 2)
        c.set(x, 50, 2)
    c.rect(210, 44, 225, 44, 2)
    c.rect(225, 51, 289, 51, 2)

    # sea: a stepped swell, then broken crests
    def swell(x):
        return water + 1.5 * math.sin(x / 9.0) + 1.0 * math.sin(x / 23.0 + 1)

    c.ridge(swell, 3)
    for x in range(W):
        c.set(x, int(round(swell(x))), 4 if (x // 3) % 3 == 0 else 3)
    for y, off in ((72, 0), (75, 9), (78, 4)):
        for x in range(W):
            if (x + off) % 18 < 7:
                c.set(x, y + (1 if (x + off) % 18 in (0, 6) else 0), 1)
    # bow wave and wake
    for x, y in ((291, 66), (292, 66), (293, 67), (294, 67), (295, 68), (289, 68), (215, 68), (212, 69), (208, 69), (204, 70), (199, 70)):
        c.set(x, y, 4)
        c.set(x + 1, y, 4)
    return c


# ── Skyfall: no scene at all. The tartan carries the card, and in the middle of
#    it an octopus emblem set in type: oval head, spread shoulders, seven arms
#    hanging like blades, the middle one longest. Three weights of character
#    (rim, body, core) so the stylesheet can pulse it from the inside out. ─────

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
        wide = ring + [(-1, -1), (-1, 1), (1, -1), (1, 1), (0, -2), (0, 2)]
        return 2 if all(solid(r + dr, col + dc) and all(solid(r + dr + er, col + dc + ec) for er, ec in ring) for dr, dc in wide[:4]) else 1

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

    # Lay the grid into the usual 320 by 80 box, centred, feet near the foot of the card.
    cell_h = 2.3
    cell_w = 1.38
    left = 160 - ASCII_COLS * cell_w / 2
    top = 80 - 3 - ASCII_ROWS * cell_h
    parts = []
    for k in (1, 2, 3):
        texts = []
        for r, row in enumerate(rows[k]):
            col = 0
            while col < ASCII_COLS:
                if row[col] == " ":
                    col += 1
                    continue
                end = col
                while end < ASCII_COLS and row[end] != " ":
                    end += 1
                run = row[col:end].replace("&", "&amp;")
                x = left + col * cell_w
                y = top + (r + 1) * cell_h - 0.35
                texts.append(f'<text x="{x:.1f}" y="{y:.2f}" textLength="{(end - col) * cell_w:.1f}" lengthAdjust="spacingAndGlyphs">{run}</text>')
                col = end
        parts.append(f'<g class="a{k}">{"".join(texts)}</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">{"".join(parts)}</svg>\n'


SCENES = {"navy": navy, "skyfall": skyfall}


# ── Selector emblems: 32 by 32, three tones, pasted into js/seasonal.js ───────

def outline_fill(c, mask, fill=3, edge=1):
    eroded = mask.filter(ImageFilter.MinFilter(3)).load()
    px = mask.load()
    for y in range(c.h):
        for x in range(c.w):
            if px[x, y]:
                c.cells[y][x] = fill if eroded[x, y] else edge


def emblem_stag():
    c = Canvas(32, 32)
    m = c.mask()
    d = ImageDraw.Draw(m)
    d.polygon([(11, 15), (20, 15), (21, 20), (18, 30), (13, 30), (10, 20)], fill=255)
    d.polygon([(11, 16), (5, 13), (4, 16), (10, 20)], fill=255)
    d.polygon([(20, 16), (26, 13), (27, 16), (21, 20)], fill=255)
    outline_fill(c, m)
    for side in (1, -1):
        def X(x):
            return x if side == 1 else 31 - x
        for a, b in (((12, 15), (9, 9)), ((9, 9), (4, 3)), ((9, 9), (11, 3)), ((7, 6), (2, 7)), ((5, 4), (7, 0)), ((11, 12), (6, 11))):
            c.line([(X(a[0]), a[1]), (X(b[0]), b[1])], 2, width=2)
    for x, y in ((13, 21), (18, 21)):
        c.set(x, y, 1)
    c.rect(14, 27, 17, 29, 1)
    return c


def emblems():
    for name, c in (("stag", emblem_stag()),):
        print(name)
        for row in c.cells:
            print('      "' + "".join(".#o+"[v] for v in row) + '",')


# ── Output ───────────────────────────────────────────────────────────────────

def runs(c, tone):
    """Greedy rectangles for one tone, as one compact path."""
    seen = [[False] * c.w for _ in range(c.h)]
    out = []
    for y in range(c.h):
        x = 0
        while x < c.w:
            if c.cells[y][x] != tone or seen[y][x]:
                x += 1
                continue
            end = x
            while end < c.w and c.cells[y][end] == tone and not seen[y][end]:
                end += 1
            bottom = y + 1
            while bottom < c.h and all(c.cells[bottom][i] == tone and not seen[bottom][i] for i in range(x, end)):
                bottom += 1
            for yy in range(y, bottom):
                for i in range(x, end):
                    seen[yy][i] = True
            out.append(f"M{x} {y}h{end - x}v{bottom - y}h-{end - x}z")
            x = end
    return "".join(out)


ALIGN = {}


def to_svg(c, align="xMaxYMax"):
    paths = "".join(f'<path class="s{t}" d="{runs(c, t)}"/>' for t in (3, 4, 1, 2, 7, 6, 5))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {c.w} {c.h}" preserveAspectRatio="{align} slice" shape-rendering="crispEdges">{paths}</svg>\n'


def preview(path):
    palette = {
        "navy": [(8, 18, 38), (3, 7, 15), (217, 180, 95), (29, 49, 87), (233, 226, 207), (200, 16, 46), (1, 33, 105), (255, 255, 255)],
        "skyfall": [(16, 21, 26), (7, 10, 12), (224, 168, 90), (43, 58, 68), (207, 214, 216), (200, 16, 46), (1, 33, 105), (255, 255, 255)],
    }
    scale = 4
    im = Image.new("RGB", (W * scale, (H + 4) * scale * len(SCENES)))
    px = im.load()
    for i, (name, fn) in enumerate(SCENES.items()):
        c = fn()
        if isinstance(c, str):
            continue
        for y in range(H + 4):
            for x in range(W):
                col = palette[name][c.cells[y][x] if y < H else 0]
                for dy in range(scale):
                    for dx in range(scale):
                        px[x * scale + dx, (i * (H + 4) + y) * scale + dy] = col
    im.save(path)


def main():
    if "--emblems" in sys.argv:
        return emblems()
    if "--preview" in sys.argv:
        return preview(sys.argv[sys.argv.index("--preview") + 1])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in SCENES.items():
        drawn = fn()
        svg = drawn if isinstance(drawn, str) else to_svg(drawn, ALIGN.get(name, "xMaxYMax"))
        (OUT / f"{name}.svg").write_text(svg, encoding="utf-8", newline="\n")
        print(f"{name}.svg {len(svg)} bytes")


if __name__ == "__main__":
    main()
