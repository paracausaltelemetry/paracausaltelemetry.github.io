#!/usr/bin/env python3
"""Share (Open Graph) cards for each writeup and threat-actor dossier.

1200x630 PNGs (160 colours, ~30-50 KB) in the site's card style (the dither background, hairline
border and fonts of scripts/build-og-card.py): a kicker, the title, a
difficulty pill and the room's artwork. Written next to each page as og.png:

    writeups/<platform>/.../<slug>/og.png   from writeups/index.json
    threat-actors/<slug>/og.png             from threat-actors/index.json

The page builders (build-content-index.mjs, build-threat-actors.mjs) point
og:image at the card when it exists and fall back to the section card when
not. Output is deterministic, so re-running only changes cards whose inputs
changed. The content-index workflow runs it with --writeups after fetching
room details.

Deps: Pillow, numpy, fonttools + brotli.
    python scripts/build-share-cards.py [--writeups | --threat-actors]
"""
import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("og", ROOT / "scripts" / "build-og-card.py")
og = importlib.util.module_from_spec(spec)
spec.loader.exec_module(og)

W, H = og.W, og.H
TEXT, SIGNAL = og.TEXT, og.SIGNAL
MUTED = (0x9B, 0xA3, 0xA8)
DIFFICULTY = {"easy": (0x86, 0xC7, 0x9A), "medium": (0xE0, 0xB2, 0x5A), "hard": (0xE5, 0x79, 0x4D), "insane": (0xE5, 0x48, 0x4D)}
ART = 220  # artwork tile, px
BACKGROUND = og.build_background()  # the same frame for every card


def wrap(draw, text, font, width, max_lines):
    """Greedy word wrap; the last line gets an ellipsis if text is left over."""
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
            continue
        if line:
            lines.append(line)
        line = word
        if len(lines) == max_lines:
            break
    if line and len(lines) < max_lines:
        lines.append(line)
    if len(" ".join(lines).split()) < len(words):
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > width:
            last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
        lines[-1] = last + "…"
    return lines


def fit_title(draw, title, width, room):
    """The largest size (96 down to 52) whose lines (three at most) fit both
    the width and the height left above the pill and the footer."""
    for size in (96, 88, 80, 72, 64, 58, 52):
        font = og.load_font(size)
        lines = wrap(draw, title, font, width, 3)
        height = sum(draw.textbbox((0, 0), ln, font=font)[3] - draw.textbbox((0, 0), ln, font=font)[1] + 18 for ln in lines)
        if not lines[-1].endswith("…") and height <= room:
            return font, lines
    return font, lines


def artwork(path):
    """The artwork as a rounded square tile, preferring a -512 version."""
    big = path.with_name(f"{path.stem}-512{path.suffix}")
    src = Image.open(big if big.exists() else path).convert("RGBA")
    # flatten transparent icons onto the tile colour (a dark card, like the site's)
    img = Image.new("RGB", src.size, (0x12, 0x14, 0x17))
    img.paste(src, (0, 0), src)
    img = ImageOps.fit(img, (ART, ART), Image.LANCZOS)
    mask = Image.new("L", (ART, ART), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, ART - 1, ART - 1], radius=26, fill=255)
    return img, mask


def card(kicker, title, difficulty=None, art=None, footer="paracausaltelemetry.com"):
    img = BACKGROUND.copy()
    draw = ImageDraw.Draw(img)
    x = 96
    text_width = W - x * 2 - (ART + 48 if art else 0)

    kfont = og.load_font(30)
    draw.text((x, 120), " ".join(kicker.upper()), font=kfont, fill=MUTED)

    # room for the title: from below the kicker to above the pill (66px) and
    # the footer line
    y = 182
    tfont, lines = fit_title(draw, title, text_width, (H - 150) - y - 66)
    for line in lines:
        box = draw.textbbox((0, 0), line, font=tfont)
        draw.text((x - box[0], y - box[1]), line, font=tfont, fill=TEXT)
        y += (box[3] - box[1]) + 18

    if difficulty in DIFFICULTY:
        colour = DIFFICULTY[difficulty]
        pfont = og.load_font(28)
        label = " ".join(difficulty.upper())
        lw = draw.textlength(label, font=pfont)
        py = y + 16
        draw.rounded_rectangle([x, py, x + lw + 44, py + 50], radius=25, outline=colour, width=2)
        draw.text((x + 22, py + 9), label, font=pfont, fill=colour)
    else:
        draw.rectangle([x, y + 10, x + 64, y + 16], fill=SIGNAL)

    if art:
        tile, mask = art
        ax, ay = W - 96 - ART, (H - ART) // 2 - 10
        img.paste(tile, (ax, ay), mask)
        edge = DIFFICULTY.get(difficulty, (206, 212, 215))
        draw.rounded_rectangle([ax - 3, ay - 3, ax + ART + 2, ay + ART + 2], radius=29, outline=edge, width=3)

    draw.text((x, H - 96), footer, font=og.load_font(28), fill=MUTED)
    m = 40
    draw.rectangle([m, m, W - m - 1, H - m - 1], outline=(206, 212, 215), width=1)
    return img


def save(img, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    before = target.read_bytes() if target.exists() else None
    # the dither and flat panels need few colours: a 160-colour palette is a
    # fifth of the size of a JPEG and keeps the dots crisp
    img.quantize(colors=160, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(target, "PNG", optimize=True)
    return before != target.read_bytes()


def writeup_kicker(record, folder_label):
    room = record.get("room") or {}
    if room.get("platform") == "event":
        return f"{room.get('event', folder_label)} · {room.get('category', 'Challenge')}"
    if room.get("platform") == "thm":
        return f"TryHackMe · {'Challenge' if room.get('type') == 'challenge' else 'Room'}"
    if room.get("platform") == "htb":
        return f"Hack The Box · {room.get('kind', 'machine').title()}"
    return f"{folder_label} · Writeup"


def build_writeups():
    index = json.loads((ROOT / "writeups" / "index.json").read_text(encoding="utf-8"))
    labels = {f["path"]: f["label"] for f in index.get("foldersMeta", [])}
    written = total = 0
    for folder, records in index.get("folders", {}).items():
        for record in records:
            room = record.get("room") or {}
            src = room.get("iconSrc") or ""
            art_path = ROOT / src.lstrip("/") if src.startswith("/") else None
            art = artwork(art_path) if art_path and art_path.exists() else None
            img = card(writeup_kicker(record, labels.get(folder, folder)), record["title"], record.get("difficulty"), art)
            total += 1
            written += save(img, ROOT / record["url"].strip("/") / "og.png")
    print(f"share cards: {total} writeups ({written} changed)")


def build_threat_actors():
    doc = json.loads((ROOT / "threat-actors" / "index.json").read_text(encoding="utf-8"))
    written = total = 0
    for actor in doc.get("actors", []):
        kicker = f"Threat actor dossier · {actor.get('state') or actor.get('actorType') or 'CTI'}"
        img = card(kicker, actor["name"])
        total += 1
        written += save(img, ROOT / "threat-actors" / actor["slug"] / "og.png")
    print(f"share cards: {total} threat actors ({written} changed)")


if __name__ == "__main__":
    args = set(sys.argv[1:])
    if not args or "--writeups" in args:
        build_writeups()
    if not args or "--threat-actors" in args:
        build_threat_actors()
