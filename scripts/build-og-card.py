#!/usr/bin/env python3
"""One-off generator for the social/OG preview card (src/social-preview.png).

Mirrors the site hero: a dark card carrying the blue ordered-dither warp field
(a static frame of js/hero-dither.js) behind the centred "Paracausal Telemetry."
title, with the red signal-stop period. No buttons, no subtitle.

Deps: Pillow, numpy, fonttools + brotli (to read the woff2). Build-free/one-off:
    python scripts/build-og-card.py
"""
import tempfile
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
CELL = 4  # px per dither cell (chunky, like the hero's pixelated buffer)

# Palette, from styles.css tokens.
BG = np.array([0x0a, 0x0b, 0x0c], dtype=float)         # --bg
BLUE = np.array([0x09, 0xba, 0xc9], dtype=float)        # --accent-blue
SIGNAL = (0xe5, 0x48, 0x4d)                             # --signal (period)
TEXT = (0xe9, 0xeb, 0xe8)                               # --text


def fract(x):
    return x - np.floor(x)


def hash2(ix, iy):
    return fract(np.sin(ix * 127.1 + iy * 311.7) * 43758.5453)


def value_noise(px, py):
    ix, iy = np.floor(px), np.floor(py)
    fx, fy = px - ix, py - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    h00 = hash2(ix, iy)
    h10 = hash2(ix + 1, iy)
    h01 = hash2(ix, iy + 1)
    h11 = hash2(ix + 1, iy + 1)
    return (h00 * (1 - ux) + h10 * ux) * (1 - uy) + (h01 * (1 - ux) + h11 * ux) * uy


def fbm(px, py):
    v = np.zeros_like(px)
    amp = 0.5
    for _ in range(4):
        v += amp * value_noise(px, py)
        px, py = px * 2, py * 2
        amp *= 0.5
    return v


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def dither_field():
    """Return a (gh, gw) boolean mask: a static frame of the warp dither."""
    gw, gh = W // CELL, H // CELL
    t = 7.0  # arbitrary start offset, matching hero-dither.js
    xs = np.arange(gw)
    ys = np.arange(gh)
    gx, gy = np.meshgrid(xs, ys)
    uvx = gx / gw * (gw / gh)  # aspect-correct x like the shader
    uvy = gy / gh
    px, py = uvx * 3.0, uvy * 3.0
    wx = fbm(px + t * 0.10, py)
    wy = fbm(px + 5.2 - t * 0.13, py + 1.3)
    f = fbm(px + 2.4 * wx + t * 0.05, py + 2.4 * wy)
    f = smoothstep(0.32, 0.78, f)
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    thresh = bayer[gy % 4, gx % 4]
    return f > thresh


def build_background():
    mask = dither_field()
    gh, gw = mask.shape
    base = np.ones((gh, gw, 3)) * (BG / 255.0)
    src = BLUE / 255.0
    screen = 1 - (1 - base) * (1 - src)
    alpha = 0.3  # element opacity, screen blend
    lit = base * (1 - alpha) + screen * alpha
    field = np.where(mask[..., None], lit, base)

    # Text-protection pool: darken toward the bg near the centre (hero-card::after).
    yy, xx = np.mgrid[0:gh, 0:gw]
    ex = ((xx / gw) - 0.5) / 0.34
    ey = ((yy / gh) - 0.5) / 0.30
    r = np.sqrt(ex * ex + ey * ey)
    pool = np.clip(1 - r, 0, 1) * 0.85
    field = field * (1 - pool[..., None]) + (BG / 255.0) * pool[..., None]

    img = Image.fromarray((field * 255).astype(np.uint8), "RGB")
    return img.resize((W, H), Image.NEAREST)


def load_font(size):
    # Pillow can't read woff2 directly, so decompress to a ttf in the OS temp dir
    # (never inside the repo).
    tmp = Path(tempfile.gettempdir()) / "paracausaltelemetry-space-grotesk.ttf"
    if not tmp.exists():
        f = TTFont(ROOT / "src" / "fonts" / "space-grotesk-var.woff2")
        f.flavor = None
        f.save(tmp)
    font = ImageFont.truetype(str(tmp), size)
    try:
        font.set_variation_by_axes([700])  # bold weight
    except Exception:
        pass
    return font


def draw_title(img):
    draw = ImageDraw.Draw(img)
    font = load_font(150)
    lines = ["Paracausal", "Telemetry."]
    # Line metrics
    sizes = [draw.textbbox((0, 0), ln, font=font) for ln in lines]
    heights = [b[3] - b[1] for b in sizes]
    gap = 18
    total = sum(heights) + gap
    y = (H - total) / 2 - 10
    for ln, box, hh in zip(lines, sizes, heights):
        wln = box[2] - box[0]
        x = (W - wln) / 2 - box[0]
        yy = y - box[1]
        if ln.endswith("."):
            body = ln[:-1]
            bbox = draw.textbbox((0, 0), body, font=font)
            draw.text((x, yy), body, font=font, fill=TEXT)
            draw.text((x + (bbox[2] - bbox[0]), yy), ".", font=font, fill=SIGNAL)
        else:
            draw.text((x, yy), ln, font=font, fill=TEXT)
        y += hh + gap

    # Hairline border, echoing the hero card's edge.
    m = 40
    draw.rectangle([m, m, W - m - 1, H - m - 1], outline=(206, 212, 215), width=1)
    return img


# Per-section cards: same dither background and border, but a left-aligned
# kicker + section title instead of the centred wordmark, so shares of a
# section link read as that section rather than the generic site card.
SECTION_CARDS = {
    "threat-actors": ("Cyber Threat Intelligence", "Source-resolved\nthreat actor dossiers"),
    "observer": ("Operational Lookup", "Observer"),
    "projects": ("Projects", "RFIDemon, Pwn2Play\nand the CTF archive"),
    "writeups": ("CTF Writeups", "Hack The Box and\nTryHackMe archive"),
}


def draw_section(img, kicker, title):
    draw = ImageDraw.Draw(img)
    kfont = load_font(34)
    tfont = load_font(96)
    x = 96
    # Kicker in muted caps.
    ktext = kicker.upper()
    draw.text((x, 132), " ".join(ktext), font=kfont, fill=(0x9b, 0xa3, 0xa8))
    # Title block, wrapped on explicit newlines.
    lines = title.split("\n")
    y = 210
    for ln in lines:
        box = draw.textbbox((0, 0), ln, font=tfont)
        draw.text((x - box[0], y - box[1]), ln, font=tfont, fill=TEXT)
        y += (box[3] - box[1]) + 20
    # Red signal tick under the title, echoing the wordmark's period.
    draw.rectangle([x, y + 6, x + 64, y + 12], fill=SIGNAL)
    # Footer wordmark.
    ffont = load_font(30)
    draw.text((x, H - 96), "paracausaltelemetry.com", font=ffont, fill=(0x9b, 0xa3, 0xa8))
    m = 40
    draw.rectangle([m, m, W - m - 1, H - m - 1], outline=(206, 212, 215), width=1)
    return img


def main():
    img = draw_title(build_background())
    out = ROOT / "src" / "social-preview.png"
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")

    og_dir = ROOT / "src" / "og"
    og_dir.mkdir(exist_ok=True)
    for slug, (kicker, title) in SECTION_CARDS.items():
        card = draw_section(build_background(), kicker, title)
        target = og_dir / f"{slug}.png"
        card.save(target, "PNG", optimize=True)
        print(f"wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
