"""Render the Operation Heatmap photo pack as believable phone photos.

One-off asset generator (like build-og-card.py): run it, commit the output.

    python scripts/build-heatmap-photos.py

The pictures are procedural reconstructions; the EXIF block of each existing
photo (GPS, timestamps, device) IS the exercise, so it is read from the current
file and written back byte-for-byte. selfie_crop.jpg deliberately carries no
EXIF. The zip pack is rebuilt from the new files plus the existing README.

Needs numpy + Pillow and the Windows fonts listed in FONTS (Bahnschrift,
Arial Narrow, Georgia, OCR-A, Segoe Print, Segoe UI).
"""
import io
import os
import sys
import zipfile

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, "activity", "footprint", "photos")
ZIP = os.path.join(ROOT, "activity", "footprint", "jamie-hollis-photos.zip")
FONTS = "C:/Windows/Fonts/"
SS = 2  # supersample factor


# ------------------------------------------------------------------ helpers
def font(name, size, variation=None):
    f = ImageFont.truetype(FONTS + name, int(size))
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f


def smooth_noise(w, h, scale, rng, octaves=4):
    """Fractal value noise in [0,1], built by upscaling random grids."""
    acc = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gw, gh = max(2, int(w / scale) + 2), max(2, int(h / scale) + 2)
        g = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8))
        acc += np.asarray(g.resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
        total += amp
        amp *= 0.5
        scale /= 2
    return acc / total


def coeffs(dst, src):
    """Perspective coefficients mapping output quad dst -> source quad src."""
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(m, np.float64)
    b = np.array(src, np.float64).reshape(8)
    return np.linalg.solve(a, b).tolist()


def warp(layer, size, quad):
    """Place an RGBA layer onto a canvas of `size` so its corners land on quad (tl,tr,br,bl)."""
    w, h = layer.size
    c = coeffs(quad, [(0, 0), (w, 0), (w, h), (0, h)])
    return layer.transform(size, Image.PERSPECTIVE, c, Image.BICUBIC, fillcolor=(0, 0, 0, 0))


def drop_shadow(canvas, layer, offset=(10, 14), blur=18, opacity=0.45):
    a = layer.split()[-1].point(lambda v: int(v * opacity))
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sh.putalpha(a)
    sh = ImageChops.offset(sh, *offset).filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh)


def light(img, cx, cy, radius, strength, colour=(255, 255, 255)):
    """Soft radial light (positive) or falloff (negative strength)."""
    w, h = img.size
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((x - cx) / radius) ** 2 + ((y - cy) / radius) ** 2)
    f = np.clip(1 - d, 0, 1) ** 2 * strength
    arr = np.asarray(img.convert("RGB"), np.float32)
    col = np.array(colour, np.float32)
    if strength >= 0:
        arr = arr + (col - arr) * f[..., None] * 0.6 + arr * f[..., None] * 0.25
    else:
        arr = arr * (1 + f[..., None])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def vignette(img, strength=0.35):
    img = img.convert("RGB")
    w, h = img.size
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / 1.414
    f = 1 - strength * np.clip(d, 0, 1) ** 2.2
    arr = np.asarray(img, np.float32) * f[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def sensor(img, rng, luma=4.0, chroma=2.0):
    arr = np.asarray(img, np.float32)
    h, w, _ = arr.shape
    arr += rng.normal(0, luma, (h, w, 1))
    arr += rng.normal(0, chroma, (h, w, 3))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def grade(img, lift=(0, 0, 0), gain=(1, 1, 1), sat=1.0):
    arr = np.asarray(img.convert("RGB"), np.float32)
    grey = arr.mean(axis=2, keepdims=True)
    arr = grey + (arr - grey) * sat
    arr = arr * np.array(gain, np.float32) + np.array(lift, np.float32)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def watermark(img):
    d = ImageDraw.Draw(img, "RGBA")
    f = font("segoeui.ttf", 15)
    t = "RECONSTRUCTION · TRAINING · NOT A REAL PHOTO"
    w = d.textlength(t, font=f)
    W, H = img.size
    d.rectangle([W - w - 22, H - 30, W - 8, H - 8], fill=(0, 0, 0, 120))
    d.text((W - w - 15, H - 28), t, font=f, fill=(255, 255, 255, 190))
    return img


def finish(img, out, rng, name, luma=3.5, chroma=1.8, vig=0.3, soften=0.6):
    img = img.convert("RGB").resize(out, Image.LANCZOS)
    if soften:
        img = img.filter(ImageFilter.GaussianBlur(soften))
    img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
    img = vignette(img, vig)
    img = sensor(img, rng, luma, chroma)
    img = watermark(img)
    path = os.path.join(PHOTOS, name)
    exif = Image.open(path).info.get("exif") if os.path.exists(path) else None
    buf = io.BytesIO()
    kw = dict(quality=88, subsampling=2, optimize=True)
    if exif:
        kw["exif"] = exif
    img.save(buf, "JPEG", **kw)
    with open(path, "wb") as fh:
        fh.write(buf.getvalue())
    return path, exif


def wood(w, h, rng, base=(176, 132, 88), dark=(118, 80, 48), plank=260):
    """Planked wooden tabletop, planks running horizontally."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    warpn = smooth_noise(w, h, 400, rng, 3) * 40
    grain = np.sin((y + warpn) * 0.11 + smooth_noise(w, h, 120, rng, 3) * 6)
    fine = smooth_noise(w, h // 1, 6, rng, 2)
    t = 0.5 + 0.28 * grain + 0.22 * (fine - 0.5)
    plank_idx = (y // plank).astype(int)
    tone = (np.sin(plank_idx * 12.9898) * 43758.5453) % 1
    t = np.clip(t * (0.85 + 0.3 * tone), 0, 1)
    b, d = np.array(base, np.float32), np.array(dark, np.float32)
    arr = d + (b - d) * t[..., None]
    seam = (np.abs((y % plank) - 0) < 2.2)
    arr[seam] *= 0.55
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")


def paper(w, h, rng, colour=(246, 244, 238)):
    n = smooth_noise(w, h, 30, rng, 3)
    arr = np.ones((h, w, 3), np.float32) * np.array(colour, np.float32)
    arr *= (0.965 + 0.05 * n)[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")


def centred(d, cx, y, text, f, fill):
    w = d.textlength(text, font=f)
    d.text((cx - w / 2, y), text, font=f, fill=fill)


# ------------------------------------------------------------------ scenes
def boarding_pass(rng):
    W, H = 1200 * SS, 900 * SS
    # dark grey cafe table
    n = smooth_noise(W, H, 60, rng, 4)
    base = np.stack([62 + 18 * n, 60 + 18 * n, 58 + 17 * n], -1)
    canvas = Image.fromarray(base.astype(np.uint8)).convert("RGBA")
    canvas = light(canvas, W * 0.3, H * 0.1, W * 0.9, 0.35, (255, 240, 220)).convert("RGBA")

    # coffee cup seen from above, top right, partly out of frame
    d = ImageDraw.Draw(canvas)
    cx, cy, r = W * 0.93, H * 0.12, 250
    d.ellipse([cx - r - 40, cy - r - 40, cx + r + 40, cy + r + 40], fill=(232, 230, 226))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(244, 243, 240))
    d.ellipse([cx - r + 28, cy - r + 28, cx + r - 28, cy + r - 28], fill=(84, 52, 30))
    d.ellipse([cx - r + 70, cy - r + 70, cx + r - 120, cy + r - 140], fill=(150, 104, 66))

    # passport corner, bottom left
    pp = Image.new("RGBA", (900, 1260), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pp)
    pd.rounded_rectangle([0, 0, 899, 1259], 40, fill=(86, 22, 38))
    pd.rounded_rectangle([60, 120, 840, 1140], 20, outline=(170, 130, 70), width=4)
    centred(pd, 450, 220, "PASSPORT", font("georgia.ttf", 64), (190, 150, 82))
    pp = warp(pp, canvas.size, [(-260, H * 0.62), (520, H * 0.57), (640, H * 1.25), (-200, H * 1.32)])
    drop_shadow(canvas, pp, (14, 18), 20, 0.5)
    canvas.alpha_composite(pp)

    # the boarding pass
    pw, ph = 2100, 900
    p = paper(pw, ph, rng)
    pd = ImageDraw.Draw(p)
    navy = (20, 40, 82)
    pd.rectangle([0, 0, pw, 150], fill=navy)
    pd.text((60, 34), "NORDIC WINGS", font=font("bahnschrift.ttf", 80, "Bold Condensed"), fill=(255, 255, 255))
    t = "BOARDING PASS"
    f = font("bahnschrift.ttf", 46, "SemiLight")
    pd.text((pw - 60 - pd.textlength(t, font=f), 58), t, font=f, fill=(190, 210, 240))
    lab, val = font("arial.ttf", 30), font("arialbd.ttf", 60)
    grey, ink = (110, 116, 124), (24, 26, 30)

    def field(x, y, k, v, vf=val):
        pd.text((x, y), k, font=lab, fill=grey)
        pd.text((x, y + 40), v, font=vf, fill=ink)

    field(70, 210, "PASSENGER", "HOLLIS/JAMIE MR")
    field(70, 380, "FROM", "London Luton  LTN", font("arialbd.ttf", 52))
    field(70, 530, "TO", "Tallinn  TLL", font("arialbd.ttf", 52))
    pd.line([(1220, 200), (1220, 820)], fill=(200, 200, 200), width=3)
    for x in range(1220, 1221):
        for yy in range(200, 820, 24):
            pd.line([(x, yy), (x, yy + 12)], fill=(160, 160, 160), width=3)
    field(1290, 210, "FLIGHT", "NW 4471")
    field(1700, 210, "DATE", "29MAY26")
    field(1290, 380, "BOARDING", "07:10")
    field(1700, 380, "GATE", "11")
    field(1290, 550, "SEAT", "14C")
    field(1700, 550, "GROUP", "2")
    pd.text((70, 700), "SEQ 087   PNR K7QX2M   ECONOMY", font=font("OCRAEXT.TTF", 34), fill=(70, 74, 80))
    # 2D barcode
    bx, by, cell = 1300, 720, 9
    for i in range(18):
        for j in range(78):
            if rng.random() < 0.5:
                pd.rectangle([bx + j * cell, by + i * cell, bx + j * cell + cell - 1, by + i * cell + cell - 1], fill=(10, 10, 12))
    # biro note
    pd.text((90, 790), "eFP roto 3 - coach from TLL 11:30", font=font("segoepr.ttf", 44), fill=(28, 52, 140, 230))
    # gentle fold + crease shading
    fold = Image.new("L", (pw, ph), 0)
    fd = ImageDraw.Draw(fold)
    fd.rectangle([0, 0, pw // 2, ph], fill=22)
    fold = fold.filter(ImageFilter.GaussianBlur(120))
    p = Image.composite(Image.new("RGBA", p.size, (0, 0, 0, 255)), p, fold)
    p = warp(p, canvas.size, [(W * 0.08, H * 0.24), (W * 0.86, H * 0.16), (W * 0.93, H * 0.66), (W * 0.12, H * 0.78)])
    drop_shadow(canvas, p, (16, 22), 24, 0.55)
    canvas.alpha_composite(p)
    canvas = light(canvas, W * 0.85, H * 0.95, W * 0.6, -0.25)
    return grade(canvas, (6, 4, 0), (1.02, 1.0, 0.96), 0.95)


def bloom(img, threshold=180, radius=40, amount=0.7):
    arr = np.asarray(img.convert("RGB"), np.float32)
    bright = np.clip(arr - threshold, 0, 255) * (255 / (255 - threshold))
    glow = Image.fromarray(bright.astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    out = arr + np.asarray(glow, np.float32) * amount
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert("RGBA")


def lightmap(w, h, lights, ambient):
    """Multiplicative light: list of (cx, cy, radius, intensity, (r,g,b))."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    acc = np.ones((h, w, 3), np.float32) * np.array(ambient, np.float32)
    for cx, cy, r, k, col in lights:
        d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
        acc += (k / (1 + d2 * 4))[..., None] * (np.array(col, np.float32) / 255)
    return acc


def pub_night(rng):
    W, H = 1200 * SS, 900 * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    sky = np.stack([8 + 10 * y / H, 11 + 12 * y / H, 24 + 16 * y / H], -1)
    canvas = Image.fromarray(sky.astype(np.uint8)).convert("RGBA")

    # random-coursed sandstone facade (albedo)
    face = np.zeros((H, W, 3), np.float32) + np.array([120, 112, 98], np.float32)  # mortar
    grainn = smooth_noise(W, H, 10, rng, 3)
    row = 0
    while row < H:
        ch = int(rng.integers(70, 120))
        col = -int(rng.integers(0, 200))
        while col < W:
            cw = int(rng.integers(130, 300))
            tone = np.array([150, 130, 104], np.float32) * (0.7 + 0.45 * rng.random())
            y0, y1, x0, x1 = row + 5, row + ch - 4, max(col + 5, 0), min(col + cw - 4, W)
            if x1 > x0 and y1 > y0:
                face[y0:y1, x0:x1] = tone
                face[y0:y0 + 6, x0:x1] *= 1.08
                face[y1 - 6:y1, x0:x1] *= 0.82
            col += cw
        row += ch
    face *= (0.82 + 0.3 * grainn)[..., None]
    face *= (0.85 + 0.25 * smooth_noise(W, H, 200, rng, 3))[..., None]
    win_boxes = [(0.1, 0.36), (0.52, 0.78)]
    lights = [(W * 0.9, H * 0.33, W * 0.18, 2.2, (255, 190, 120))]
    for x0, x1 in win_boxes:
        lights.append(((x0 + x1) / 2 * W, H * 0.66, W * 0.22, 1.5, (255, 180, 100)))
    lm = lightmap(W, H, lights, (0.10, 0.10, 0.14))
    lit = np.clip(face * lm, 0, 255)
    face_img = Image.fromarray(lit.astype(np.uint8)).convert("RGBA")
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(0, H * 0.16), (W, H * 0.08), (W, H), (0, H)], fill=255)
    canvas.paste(face_img, (0, 0), mask)
    # roof edge / gutter
    ImageDraw.Draw(canvas).line([(0, H * 0.16), (W, H * 0.08)], fill=(18, 18, 20), width=22)

    def lit_layer(layer, quad, k):
        warped = warp(layer, canvas.size, quad)
        arr = np.asarray(warped, np.float32)
        arr[..., :3] = np.clip(arr[..., :3] * lightmap(W, H, lights, (k, k, k * 1.1)), 0, 255)
        return Image.fromarray(arr.astype(np.uint8))

    # fascia board
    fas = Image.new("RGBA", (2000, 300), (24, 46, 34, 255))
    fd = ImageDraw.Draw(fas)
    fd.rectangle([10, 10, 1989, 289], outline=(196, 160, 82), width=8)
    centred(fd, 1000, 52, "THE DROVERS ARMS", font("georgiab.ttf", 150), (232, 220, 186))
    canvas.alpha_composite(lit_layer(fas, [(W * 0.06, H * 0.27), (W * 0.9, H * 0.2), (W * 0.9, H * 0.36), (W * 0.06, H * 0.42)], 0.25))
    # lit windows: warm interior, people, bar back, glazing bars
    for x0, x1 in win_boxes:
        win = Image.new("RGBA", (800, 600), (255, 186, 104, 255))
        wd = ImageDraw.Draw(win)
        wd.rectangle([0, 0, 800, 210], fill=(214, 140, 72))
        for bx in range(30, 800, 46):
            wd.rounded_rectangle([bx, 120 + (bx * 7) % 40, bx + 22, 210], 6, fill=(120 + (bx % 90), 70, 40))
        for (cx, cy, sc) in ((190, 420, 1.0), (430, 450, 0.85), (650, 410, 1.1)):
            wd.ellipse([cx - 52 * sc, cy - 130 * sc, cx + 52 * sc, cy - 20 * sc], fill=(70, 40, 24))
            wd.rounded_rectangle([cx - 120 * sc, cy - 30 * sc, cx + 120 * sc, cy + 220 * sc], int(70 * sc), fill=(70, 40, 24))
        win = win.filter(ImageFilter.GaussianBlur(9))
        wd = ImageDraw.Draw(win)
        for gx in (266, 533):
            wd.rectangle([gx - 9, 0, gx + 9, 600], fill=(30, 20, 12))
        wd.rectangle([0, 291, 800, 309], fill=(30, 20, 12))
        wd.rectangle([0, 0, 799, 599], outline=(36, 26, 16), width=22)
        canvas.alpha_composite(warp(win, canvas.size, [(W * x0, H * 0.5), (W * x1, H * 0.485), (W * x1, H * 0.82), (W * x0, H * 0.835)]))
    # hanging sign on bracket, lit by its lamp
    d = ImageDraw.Draw(canvas)
    d.line([(W * 0.83, H * 0.42), (W * 0.985, H * 0.41)], fill=(16, 16, 16), width=14)
    d.line([(W * 0.86, H * 0.42), (W * 0.86, H * 0.44)], fill=(16, 16, 16), width=6)
    d.line([(W * 0.96, H * 0.415), (W * 0.96, H * 0.437)], fill=(16, 16, 16), width=6)
    d.ellipse([W * 0.885, H * 0.31, W * 0.915, H * 0.35], fill=(255, 236, 190))
    sign = Image.new("RGBA", (520, 640), (26, 50, 36, 255))
    sd = ImageDraw.Draw(sign)
    sd.rectangle([0, 0, 519, 639], outline=(196, 160, 82), width=14)
    centred(sd, 260, 60, "THE", font("georgiab.ttf", 70), (232, 220, 186))
    centred(sd, 260, 150, "DROVERS", font("georgiab.ttf", 92), (232, 220, 186))
    centred(sd, 260, 260, "ARMS", font("georgiab.ttf", 92), (232, 220, 186))
    sd.polygon([(150, 520), (260, 400), (370, 520)], fill=(196, 160, 82))
    centred(sd, 260, 545, "EST. 1823", font("georgia.ttf", 40), (196, 160, 82))
    canvas.alpha_composite(lit_layer(sign, [(W * 0.855, H * 0.44), (W * 0.965, H * 0.435), (W * 0.965, H * 0.62), (W * 0.855, H * 0.63)], 0.3))
    # street name plate
    plate = Image.new("RGBA", (900, 300), (245, 245, 240, 255))
    pdd = ImageDraw.Draw(plate)
    pdd.rectangle([8, 8, 891, 291], outline=(20, 20, 20), width=10)
    centred(pdd, 450, 40, "MARKET PLACE", font("ARIALNB.TTF", 120), (16, 16, 16))
    centred(pdd, 450, 190, "Richmond  DL10", font("arialbd.ttf", 54), (16, 16, 16))
    canvas.alpha_composite(lit_layer(plate, [(W * 0.39, H * 0.6), (W * 0.5, H * 0.598), (W * 0.5, H * 0.665), (W * 0.39, H * 0.668)], 0.2))
    # wet cobbled pavement with window reflections
    pn = smooth_noise(W, H, 12, rng, 3)
    pave = np.stack([30 + 24 * pn, 28 + 22 * pn, 28 + 22 * pn], -1)
    pave = np.clip(pave * lightmap(W, H, [(W * 0.23, H * 0.92, W * 0.2, 2.0, (255, 170, 90)), (W * 0.65, H * 0.9, W * 0.2, 2.0, (255, 170, 90))], (0.5, 0.5, 0.6)), 0, 255)
    pv = Image.fromarray(pave.astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(0, H * 0.86), (W, H * 0.82), (W, H), (0, H)], fill=255)
    canvas.paste(pv, (0, 0), m)
    canvas = bloom(canvas, 170, 36, 0.8)
    canvas = canvas.filter(ImageFilter.GaussianBlur(1.4))
    return grade(canvas, (3, 2, 6), (1.04, 0.98, 0.9), 0.92)


def race_kit(rng):
    W, H = 1200 * SS, 900 * SS
    canvas = wood(W, H, rng, base=(196, 156, 108), dark=(140, 98, 62), plank=330)
    canvas = light(canvas, W * 0.1, H * 0.0, W * 1.1, 0.45, (255, 250, 240)).convert("RGBA")
    # bib
    bw, bh = 1200, 1000
    bib = paper(bw, bh, rng, (250, 250, 248))
    bd = ImageDraw.Draw(bib)
    bd.rectangle([0, 0, bw, 190], fill=(16, 110, 92))
    centred(bd, bw / 2, 30, "SWALEDALE STRIDERS", font("bahnschrift.ttf", 76, "Bold Condensed"), (255, 255, 255))
    centred(bd, bw / 2, 112, "RICHMOND 10K  ·  17 MAY 2026", font("bahnschrift.ttf", 50, "SemiBold Condensed"), (220, 240, 234))
    centred(bd, bw / 2, 250, "417", font("bahnschrift.ttf", 440, "Bold Condensed"), (196, 50, 30))
    bd.rectangle([0, bh - 130, bw, bh], fill=(16, 110, 92))
    centred(bd, bw / 2, bh - 108, "chip timed  ·  wear on front", font("bahnschrift.ttf", 46, "SemiLight"), (220, 240, 234))
    for (px, py) in ((60, 220), (bw - 90, 220), (60, bh - 180), (bw - 90, bh - 180)):
        bd.ellipse([px, py, px + 30, py + 30], fill=(170, 170, 176))
        bd.arc([px - 4, py - 50, px + 44, py + 40], 200, 340, fill=(190, 190, 196), width=6)
    crumple = smooth_noise(bw, bh, 140, rng, 3)
    arr = np.asarray(bib, np.float32)
    arr[..., :3] *= (0.86 + 0.2 * crumple)[..., None]
    bib = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    bib = warp(bib, canvas.size, [(W * 0.06, H * 0.14), (W * 0.55, H * 0.1), (W * 0.6, H * 0.8), (W * 0.1, H * 0.86)])
    drop_shadow(canvas, bib, (12, 16), 16, 0.4)
    canvas.alpha_composite(bib)
    # medal + ribbon
    rib = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rib)
    rd.polygon([(W * 0.74, -20), (W * 0.84, -20), (W * 0.8, H * 0.46), (W * 0.7, H * 0.44)], fill=(120, 20, 30, 255))
    rd.polygon([(W * 0.765, -20), (W * 0.795, -20), (W * 0.765, H * 0.45), (W * 0.735, H * 0.445)], fill=(16, 110, 92, 255))
    drop_shadow(canvas, rib, (10, 12), 12, 0.35)
    canvas.alpha_composite(rib)
    med = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    md = ImageDraw.Draw(med)
    md.ellipse([0, 0, 599, 599], fill=(176, 138, 48))
    md.ellipse([24, 24, 575, 575], fill=(214, 178, 82))
    md.ellipse([60, 60, 539, 539], outline=(170, 132, 44), width=8)
    centred(md, 300, 150, "10K", font("bahnschrift.ttf", 200, "Bold Condensed"), (140, 104, 30))
    centred(md, 300, 380, "RICHMOND 2026", font("bahnschrift.ttf", 54, "SemiBold Condensed"), (140, 104, 30))
    sheen = Image.new("L", (600, 600), 0)
    ImageDraw.Draw(sheen).ellipse([60, 20, 330, 260], fill=90)
    sheen = sheen.filter(ImageFilter.GaussianBlur(50))
    med = Image.composite(Image.new("RGBA", (600, 600), (255, 246, 210, 255)), med, sheen)
    a = Image.new("L", (600, 600), 0)
    ImageDraw.Draw(a).ellipse([0, 0, 599, 599], fill=255)
    med.putalpha(a)
    med = warp(med, canvas.size, [(W * 0.6, H * 0.4), (W * 0.9, H * 0.39), (W * 0.91, H * 0.8), (W * 0.61, H * 0.81)])
    drop_shadow(canvas, med, (14, 18), 16, 0.5)
    canvas.alpha_composite(med)
    # watch, bottom right
    wt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wt)
    wd.rounded_rectangle([W * 0.86, H * 0.78, W * 0.95, H * 1.05], 40, fill=(26, 28, 30, 255))
    wd.ellipse([W * 0.82, H * 0.82, W * 0.99, H * 1.0], fill=(34, 36, 40, 255))
    wd.ellipse([W * 0.835, H * 0.835, W * 0.975, H * 0.985], fill=(10, 12, 14, 255))
    wd.text((W * 0.858, H * 0.88), "40:52", font=font("bahnschrift.ttf", 70, "Bold"), fill=(230, 240, 240, 255))
    drop_shadow(canvas, wt, (10, 12), 14, 0.5)
    canvas.alpha_composite(wt)
    return grade(canvas, (4, 2, 0), (1.03, 1.0, 0.95), 0.95)


def garrison_sign(rng):
    W, H = 1200 * SS, 900 * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    cloud = smooth_noise(W, H, 500, rng, 5)
    sky = np.stack([168 + 40 * cloud, 176 + 38 * cloud, 182 + 36 * cloud], -1) - (y / H * 30)[..., None]
    canvas = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(canvas)
    # distant tree line
    tn = smooth_noise(W, 1, 90, rng, 4)[0]
    for xi in range(0, W, 2):
        top = H * 0.46 - tn[xi] * 140
        d.line([(xi, top), (xi, H * 0.6)], fill=(58, 68, 56), width=2)
    # palisade fence
    for xi in range(0, W, 46):
        d.line([(xi, H * 0.44), (xi, H * 0.64)], fill=(44, 52, 50), width=8)
        d.polygon([(xi - 8, H * 0.44), (xi, H * 0.42), (xi + 8, H * 0.44)], fill=(44, 52, 50))
    d.line([(0, H * 0.48), (W, H * 0.48)], fill=(44, 52, 50), width=8)
    d.line([(0, H * 0.6), (W, H * 0.6)], fill=(44, 52, 50), width=8)
    # verge and road
    gn = smooth_noise(W, H, 20, rng, 3)
    grass = np.stack([70 + 30 * gn, 92 + 34 * gn, 52 + 20 * gn], -1)
    g = Image.fromarray(np.clip(grass, 0, 255).astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(0, H * 0.62), (W, H * 0.6), (W, H * 0.78), (0, H * 0.86)], fill=255)
    canvas.paste(g, (0, 0), m)
    rn = smooth_noise(W, H, 8, rng, 2)
    road = Image.fromarray(np.clip(np.stack([66 + 22 * rn] * 3, -1), 0, 255).astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(0, H * 0.86), (W, H * 0.78), (W, H), (0, H)], fill=255)
    canvas.paste(road, (0, 0), m)
    d.line([(0, H * 0.93), (W, H * 0.85)], fill=(210, 206, 190), width=10)
    # posts
    for px in (0.2, 0.74):
        d.rectangle([W * px, H * 0.3, W * px + 34, H * 0.83], fill=(48, 50, 52))
    # sign face
    sw, sh = 2000, 1100
    s = Image.new("RGBA", (sw, sh), (240, 242, 238, 255))
    sd = ImageDraw.Draw(s)
    sd.rectangle([0, 0, sw, 230], fill=(18, 64, 46))
    sd.text((60, 40), "CATTERICK GARRISON", font=font("bahnschrift.ttf", 150, "Bold Condensed"), fill=(255, 255, 255))
    sd.text((60, 290), "MARNE LINES", font=font("bahnschrift.ttf", 140, "Bold Condensed"), fill=(20, 22, 24))
    sd.text((60, 470), "3rd Battalion  The Dales Regiment", font=font("bahnschrift.ttf", 78, "SemiBold"), fill=(20, 22, 24))
    sd.text((60, 580), "HQ Company  ·  B Company", font=font("bahnschrift.ttf", 70, "Regular"), fill=(60, 64, 68))
    sd.rectangle([0, sh - 220, sw, sh], fill=(196, 28, 36))
    sd.text((60, sh - 190), "MOD PROPERTY", font=font("bahnschrift.ttf", 80, "Bold"), fill=(255, 255, 255))
    sd.text((60, sh - 98), "Passes must be shown on request", font=font("bahnschrift.ttf", 56, "Regular"), fill=(255, 235, 235))
    grime = smooth_noise(sw, sh, 160, rng, 4)
    arr = np.asarray(s, np.float32)
    arr[..., :3] *= (0.86 + 0.16 * grime)[..., None]
    s = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    s = warp(s, canvas.size, [(W * 0.16, H * 0.2), (W * 0.8, H * 0.24), (W * 0.8, H * 0.63), (W * 0.16, H * 0.62)])
    drop_shadow(canvas, s, (6, 10), 10, 0.35)
    canvas.alpha_composite(s)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.8))
    return grade(canvas, (6, 8, 10), (0.96, 0.99, 1.04), 0.85)


def tapa_sign(rng):
    W, H = 1200 * SS, 900 * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    hz = H * 0.6
    cloud = smooth_noise(W, H, 520, rng, 6)
    cl = np.clip((cloud - 0.42) * 2.4, 0, 1) * np.clip(1.2 - y / hz, 0, 1)
    skyb = np.stack([112 + 70 * y / hz, 156 + 56 * y / hz, 214 + 26 * y / hz], -1)
    shade = 0.82 + 0.18 * smooth_noise(W, H, 160, rng, 3)
    sky = skyb + (np.array([246, 248, 250]) * shade[..., None] - skyb) * cl[..., None]
    canvas = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)).convert("RGBA")

    def treeline(base_y, height, colour, density, haze):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        xi = -40
        while xi < W + 40:
            h = height * (0.55 + 0.6 * rng.random())
            w = h * (0.22 + 0.12 * rng.random())
            if rng.random() < 0.7:  # spruce
                tiers = 6
                for t in range(tiers):
                    ty = base_y - h + h * t / tiers
                    tw = w * (t + 1) / tiers
                    ld.polygon([(xi, ty), (xi - tw, ty + h / tiers * 1.6), (xi + tw, ty + h / tiers * 1.6)], fill=colour)
            else:  # birch: rounded crown, pale trunk
                ld.ellipse([xi - w * 1.1, base_y - h, xi + w * 1.1, base_y - h * 0.35], fill=tuple(int(c * 1.15) for c in colour))
                ld.line([(xi, base_y - h * 0.4), (xi, base_y)], fill=(200, 200, 190), width=4)
            ld.rectangle([xi - 3, base_y - 8, xi + 3, base_y + 2], fill=colour)
            xi += int(density * (0.4 + rng.random()))
        hz_col = np.array([190, 205, 214], np.float32)
        arr = np.asarray(layer, np.float32).copy()
        arr[..., :3] = arr[..., :3] * (1 - haze) + hz_col * haze
        return Image.fromarray(arr.astype(np.uint8))

    canvas.alpha_composite(treeline(hz + 4, 150, (40, 62, 44), 26, 0.45))
    canvas.alpha_composite(treeline(hz + 8, 230, (30, 52, 34), 40, 0.15).filter(ImageFilter.GaussianBlur(1)))
    # fields with perspective streaks
    fy = np.clip((y - hz) / (H - hz), 0, 1)
    streak = smooth_noise(W, H, 40, rng, 3)
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((W // 6, H)).resize((W, H)), np.float32) / 255
    field = np.stack([104 + 40 * streak, 132 + 42 * streak, 62 + 22 * streak], -1) * (0.85 + 0.25 * fy)[..., None]
    f = Image.fromarray(np.clip(field, 0, 255).astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rectangle([0, hz, W, H], fill=255)
    canvas.paste(f, (0, 0), m)
    # straight road with gravel shoulders
    vx = W * 0.62
    rn = smooth_noise(W, H, 5, rng, 2)
    road = Image.fromarray(np.clip(np.stack([78 + 26 * rn, 80 + 26 * rn, 84 + 26 * rn], -1), 0, 255).astype(np.uint8)).convert("RGBA")
    gravel = Image.fromarray(np.clip(np.stack([150 + 50 * rn, 140 + 46 * rn, 120 + 40 * rn], -1), 0, 255).astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(vx - 14, hz), (vx + 14, hz), (W * 1.3, H), (-W * 0.15, H)], fill=255)
    canvas.paste(gravel, (0, 0), m)
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(vx - 8, hz), (vx + 8, hz), (W * 1.18, H), (-W * 0.02, H)], fill=255)
    canvas.paste(road, (0, 0), m)
    d = ImageDraw.Draw(canvas)
    for i in range(18):
        t0, t1 = (i / 18) ** 2.2, ((i + 0.4) / 18) ** 2.2
        y0, y1 = hz + (H - hz) * t0, hz + (H - hz) * t1
        xa, xb = vx + (W * 0.58 - vx) * t0, vx + (W * 0.58 - vx) * t1
        d.line([(xa, y0), (xb, y1)], fill=(232, 232, 222), width=max(2, int(16 * t1)))
    # telegraph poles receding
    for i in range(1, 7):
        t = (i / 7) ** 1.6
        px = vx + (W * 1.05 - vx) * t
        top, bot = hz - 200 * t - 20, hz + (H - hz) * t * 0.45
        d.line([(px, top), (px, bot)], fill=(70, 60, 50), width=max(2, int(12 * t)))
    # sign on post
    post_x = W * 0.27
    d.rectangle([post_x, H * 0.38, post_x + 26, H * 0.92], fill=(150, 154, 158))
    d.rectangle([post_x + 18, H * 0.38, post_x + 26, H * 0.92], fill=(110, 114, 118))
    s = Image.new("RGBA", (1100, 420), (255, 255, 255, 255))
    sd = ImageDraw.Draw(s)
    sd.rounded_rectangle([14, 14, 1085, 405], 30, fill=(18, 64, 140))
    sd.rounded_rectangle([34, 34, 1065, 385], 22, outline=(255, 255, 255), width=10)
    centred(sd, 550, 70, "Tapa", font("arialbd.ttf", 230), (255, 255, 255))
    grime = smooth_noise(1100, 420, 90, rng, 3)
    arr = np.asarray(s, np.float32).copy()
    arr[..., :3] *= (0.88 + 0.14 * grime)[..., None]
    s = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    s = warp(s, canvas.size, [(W * 0.13, H * 0.3), (W * 0.42, H * 0.325), (W * 0.42, H * 0.465), (W * 0.13, H * 0.45)])
    drop_shadow(canvas, s, (4, 6), 6, 0.3)
    canvas.alpha_composite(s)
    canvas = light(canvas, W * 0.9, -H * 0.1, W * 0.9, 0.25, (255, 250, 230))
    return grade(canvas, (2, 2, 4), (1.0, 1.0, 1.02), 1.0)


def selfie_crop(rng):
    W, H = 1000 * SS, 1000 * SS
    # MTP-style camouflage fabric
    base = np.ones((H, W, 3), np.float32) * np.array([164, 148, 110], np.float32)
    layers = [((116, 120, 76), 0.52, 150), ((86, 90, 60), 0.6, 120), ((98, 76, 52), 0.66, 100), ((48, 44, 34), 0.74, 80)]
    for colour, thr, scale in layers:
        nmap = smooth_noise(W, H, scale, rng, 3)
        base[nmap > thr] = colour
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    weave = (np.sin(xx * 1.9) * np.sin(yy * 1.9)) * 7 + np.sin(xx * 0.9 + yy * 0.9) * 3
    base += weave[..., None]
    folds = smooth_noise(W, H, 380, rng, 2)
    base *= (0.75 + 0.45 * folds)[..., None]
    canvas = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA").filter(ImageFilter.GaussianBlur(1.1))

    def patch(layer, quad):
        w = warp(layer, canvas.size, quad)
        drop_shadow(canvas, w, (6, 9), 9, 0.55)
        edge = w.split()[-1].filter(ImageFilter.MaxFilter(9))
        ring = ImageChops.subtract(edge, w.split()[-1])
        fz = Image.new("RGBA", canvas.size, (92, 86, 64, 255))
        fz.putalpha(ring.point(lambda v: int(v * 0.85)))
        canvas.alpha_composite(fz)
        canvas.alpha_composite(w)

    # MOLLE webbing
    web = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(web)
    for r in range(1260, H + 60, 150):
        wd.rectangle([0, r, W, r + 54], fill=(126, 114, 84, 255))
        wd.line([(0, r + 4), (W, r + 4)], fill=(146, 134, 100, 255), width=3)
        for c in range(40, W, 160):
            wd.rectangle([c, r, c + 10, r + 54], fill=(96, 86, 62, 255))
    drop_shadow(canvas, web, (0, 10), 6, 0.5)
    canvas.alpha_composite(web)
    # name tape
    tape = Image.new("RGBA", (1000, 200), (172, 158, 118, 255))
    td = ImageDraw.Draw(tape)
    td.rectangle([0, 0, 999, 199], outline=(110, 98, 70), width=10)
    centred(td, 500, 26, "HOLLIS", font("bahnschrift.ttf", 150, "Bold"), (34, 34, 28))
    tape = tape.filter(ImageFilter.GaussianBlur(0.8))
    patch(tape, [(W * 0.08, H * 0.2), (W * 0.52, H * 0.17), (W * 0.53, H * 0.27), (W * 0.09, H * 0.3)])
    # TRF patch (green / maroon / green)
    trf = Image.new("RGBA", (600, 380), (20, 20, 18, 255))
    trd = ImageDraw.Draw(trf)
    trd.rectangle([12, 12, 210, 367], fill=(26, 74, 50))
    trd.rectangle([210, 12, 390, 367], fill=(118, 22, 34))
    trd.rectangle([390, 12, 587, 367], fill=(26, 74, 50))
    tw = smooth_noise(600, 380, 3, rng, 1)
    arr = np.asarray(trf, np.float32).copy()
    arr[..., :3] *= (0.85 + 0.25 * tw)[..., None]
    trf = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    patch(trf, [(W * 0.6, H * 0.15), (W * 0.9, H * 0.13), (W * 0.91, H * 0.33), (W * 0.61, H * 0.35)])
    # battalion patch
    bp = Image.new("RGBA", (420, 420), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bp)
    bd.ellipse([0, 0, 419, 419], fill=(72, 68, 52))
    bd.ellipse([24, 24, 395, 395], outline=(196, 166, 92), width=12)
    centred(bd, 210, 70, "3", font("bahnschrift.ttf", 230, "Bold"), (196, 166, 92))
    patch(bp, [(W * 0.62, H * 0.45), (W * 0.84, H * 0.44), (W * 0.85, H * 0.66), (W * 0.63, H * 0.67)])
    canvas = light(canvas, W * 0.15, H * 0.05, W * 1.0, 0.28, (255, 244, 225))
    canvas = light(canvas, W * 0.95, H * 1.0, W * 0.7, -0.35)
    return grade(canvas, (2, 2, 0), (1.0, 1.0, 0.95), 0.92)


SCENES = [
    ("IMG_20260529_064112.jpg", boarding_pass, (1200, 900), dict(vig=0.32)),
    ("IMG_20260523_214706.jpg", pub_night, (1200, 900), dict(luma=7.5, chroma=4.5, vig=0.45, soften=0.9)),
    ("IMG_20260524_101533.jpg", race_kit, (1200, 900), dict(vig=0.28)),
    ("IMG_20260512_063355.jpg", garrison_sign, (1200, 900), dict(luma=4.5, vig=0.25)),
    ("IMG_20260606_083210.jpg", tapa_sign, (1200, 900), dict(vig=0.22)),
    ("selfie_crop.jpg", selfie_crop, (1000, 1000), dict(vig=0.3, soften=0.8)),
]


def main():
    only = set(sys.argv[1:])
    for i, (name, fn, size, opts) in enumerate(SCENES):
        if only and name not in only:
            continue
        rng = np.random.default_rng(20260500 + i)
        img = fn(rng)
        path, exif = finish(img, size, rng, name, **opts)
        print(f"{name}: {os.path.getsize(path) // 1024} KB, exif {'kept' if exif else 'none'}")
    with zipfile.ZipFile(ZIP) as z:
        readme = z.read("photos/README.txt")
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for name, *_ in SCENES:
            z.write(os.path.join(PHOTOS, name), "photos/" + name)
        z.writestr("photos/README.txt", readme)
    print("zip rebuilt:", os.path.getsize(ZIP) // 1024, "KB")


if __name__ == "__main__":
    main()
