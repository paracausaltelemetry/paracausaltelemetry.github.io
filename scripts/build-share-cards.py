#!/usr/bin/env python3
"""Share (Open Graph) cards for each writeup and threat-actor dossier.

1200x630 PNGs (160 colours, ~30-50 KB) in the site's card style (the dither background, hairline
border and fonts of scripts/build-og-card.py): a kicker, the title, a
difficulty pill and the room's artwork. Written next to each page as og.png:

    writeups/<platform>/.../<slug>/og.png   from writeups/index.json
    threat-actors/<slug>/og.png             from threat-actors/index.json
    field-guides/[<slug>/]og.png            from field-guides/content/guides.json

Field guide cards carry the guide's provider theme and signature icons
(vector, including the official vendor icons), so they're drawn as HTML and
screenshotted with Playwright rather than with Pillow; only that option
needs Playwright and Chromium.

The page builders (build-content-index.mjs, build-threat-actors.mjs) point
og:image at the card when it exists and fall back to the section card when
not. Output is deterministic, so re-running only changes cards whose inputs
changed. The content-index workflow runs it with --writeups after fetching
room details.

Deps: Pillow, numpy, fonttools + brotli.
    python scripts/build-share-cards.py [--writeups | --threat-actors | --field-guides]
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


# --- field guides -------------------------------------------------------------

def guide_themes():
    """Accent, header ink and band for each .guide-theme-<name> in field-guides.css."""
    import re
    css = (ROOT / "field-guides" / "field-guides.css").read_text(encoding="utf-8")
    themes = {}
    for name, body in re.findall(r"\.guide-theme-([a-z]+)\s*\{([^}]*)\}", css):
        vals = dict(re.findall(r"--g-(accent|head|band):\s*([^;]+);", body))
        if "accent" in vals and "head" in vals:
            themes[name] = vals
    return themes


def own_icons():
    """The site's 24px line icons, read from scripts/lib/guide-visuals.mjs."""
    import re
    src = (ROOT / "scripts" / "lib" / "guide-visuals.mjs").read_text(encoding="utf-8")
    block = src[src.index("const ICONS = {"):src.index("};", src.index("const ICONS = {"))]
    return dict(re.findall(r"^\s+([a-z-]+): '(.+)',?$", block, re.M))


def guide_card_html(kicker, title, summary, theme, icons, glyphs):
    import html
    tiles = "".join(
        f'<span class="tile"><img src="/field-guides/icons/{name}.svg" alt=""></span>' if "/" in name
        else f'<span class="tile"><svg viewBox="0 0 24 24" fill="none" stroke="{theme["accent"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{glyphs[name]}</svg></span>'
        for name in icons[:6])
    band = theme.get("band", theme["accent"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: SG; src: url(/src/fonts/space-grotesk-var.woff2) format("woff2"); font-weight: 300 700; }}
@font-face {{ font-family: Geist; src: url(/src/fonts/geist-var.woff2) format("woff2"); font-weight: 100 900; }}
html, body {{ margin: 0; width: 1200px; height: 630px; }}
body {{ position: relative; overflow: hidden; color: #fff; font-family: Geist, sans-serif;
  background: linear-gradient(135deg, {theme["head"]} 50%, color-mix(in srgb, {theme["head"]} 72%, {theme["accent"]})); }}
.dots {{ position: absolute; inset: 0 0 0 40%; background-image: radial-gradient(color-mix(in srgb, {theme["accent"]} 60%, transparent) 1.4px, transparent 1.9px);
  background-size: 22px 22px; -webkit-mask-image: linear-gradient(90deg, transparent, #000 70%); opacity: .5; }}
.copy {{ position: absolute; left: 80px; top: 78px; width: 640px; }}
.kicker {{ color: {theme["accent"]}; font: 700 22px/1 Geist; letter-spacing: .16em; text-transform: uppercase; }}
h1 {{ margin: 26px 0 22px; font: 650 68px/1.02 SG; letter-spacing: -.03em; }}
p {{ margin: 0; color: rgba(255,255,255,.78); font-size: 25px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }}
.icons {{ position: absolute; right: 80px; top: 50%; transform: translateY(-50%); display: grid; grid-template-columns: repeat(2, 120px); gap: 22px; }}
.tile {{ display: grid; place-items: center; width: 120px; height: 120px; border-radius: 22px;
  border: 1.5px solid rgba(255,255,255,.16); background: rgba(255,255,255,.07); }}
.tile img, .tile svg {{ width: 68px; height: 68px; }}
.foot {{ position: absolute; left: 80px; bottom: 58px; color: rgba(255,255,255,.62); font: 500 22px/1 Geist; letter-spacing: .02em; }}
.band {{ position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: {band}; }}
</style></head><body><div class="dots"></div><div class="copy"><div class="kicker">{html.escape(kicker)}</div>
<h1>{html.escape(title)}</h1><p>{html.escape(summary)}</p></div><div class="icons">{tiles}</div>
<div class="foot">paracausaltelemetry.com/field-guides</div><div class="band"></div></body></html>"""


def build_field_guides():
    from playwright.sync_api import sync_playwright
    guides = json.loads((ROOT / "field-guides" / "content" / "guides.json").read_text(encoding="utf-8"))
    themes, glyphs = guide_themes(), own_icons()
    cards = [("field-guides", "Field guides", "Tools of the trade",
              "Working references for MSSP tools: query languages, investigation workflows and detections, drawn out.",
              themes["google"], ["gcp/secops", "aws/cloudtrail", "azure/sentinel", "entra/entra-id", "firewall", "satellite"])]
    for g in guides:
        cards.append((f"field-guides/{g['slug']}", f"Field guide · {g['tool']}", g["title"], g["summary"],
                      themes.get(g.get("theme", ""), themes["google"]), g.get("icons", [])))
    written = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H})
        state = {}

        def serve(route):
            path = route.request.url.split("cards.local", 1)[1].split("?")[0]
            if path == "/card":
                return route.fulfill(status=200, content_type="text/html", body=state["html"])
            file = ROOT / path.lstrip("/")
            if not file.is_file() or ROOT not in file.resolve().parents:
                return route.fulfill(status=404, body="")
            types = {".svg": "image/svg+xml", ".woff2": "font/woff2"}
            return route.fulfill(status=200, content_type=types.get(file.suffix, "application/octet-stream"), body=file.read_bytes())

        page.route("http://cards.local/**", serve)
        for folder, kicker, title, summary, theme, icons in cards:
            state["html"] = guide_card_html(kicker, title, summary, theme, icons, glyphs)
            page.goto("http://cards.local/card", wait_until="networkidle")
            page.evaluate("document.fonts.ready")
            import io
            img = Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")
            written += save(img, ROOT / folder / "og.png")
        browser.close()
    print(f"share cards: {len(cards)} field guide pages ({written} changed)")


if __name__ == "__main__":
    args = set(sys.argv[1:])
    if not args or "--writeups" in args:
        build_writeups()
    if not args or "--threat-actors" in args:
        build_threat_actors()
    if "--field-guides" in args:
        build_field_guides()
