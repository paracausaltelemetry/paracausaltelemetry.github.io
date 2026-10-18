#!/usr/bin/env python3
"""Fetch room/machine details for every writeup's roomUrl into writeups/meta/.

Reads writeups/index.json (written by scripts/build-content-index.mjs), works
out which TryHackMe rooms and Hack The Box machines/challenges the writeups
point at, and saves each one's public details plus a small icon:

  writeups/meta/thm/<room-code>.json    + <room-code>.webp
  writeups/meta/htb/machine-<name>.json + machine-<name>.webp
  writeups/meta/htb/challenge-<name>.json

build-content-index.mjs then renders an info card on each writeup page from
these files. Run it again after this script.

TryHackMe: public room API, fetched through a headless browser because its
bot protection answers plain HTTP clients with 429 (see fetch-thm-profile.py).
Hack The Box: the v4 API with a personal App Token in HTB_APP_TOKEN (create one
under Account Settings > App Tokens on app.hackthebox.com). Without the token
Hack The Box links are skipped. The HTB field names are read defensively:
written against the v4 API without a token to test it, so check the first run.

Saved details are refreshed after REFRESH_DAYS; retired HTB machines never.
A source that fails keeps its last saved file. Exits 0 unless nothing could
run at all, so a bad day never blocks the site build.

    python scripts/fetch-writeup-meta.py
    python scripts/fetch-writeup-meta.py --probe machine:Eloquia

--probe fetches one Hack The Box machine or challenge into a temporary folder
and prints what was parsed and which fields the API returned, without
touching writeups/meta/. Used by .github/workflows/htb-probe.yml to check the
token and the field names.

Needs Playwright with Chromium, and Pillow.
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
META = ROOT / "writeups" / "meta"
REFRESH_DAYS = 7
ICON_PX = 96
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
HTB_API = "https://labs.hackthebox.com/api/v4"


# ---------- which rooms the writeups point at ----------
def room_key(url):
    """Mirror of roomKey() in build-content-index.mjs: (platform, kind, id)."""
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None
    host, path = parsed.netloc.lower(), parsed.path
    if host.endswith("tryhackme.com"):
        m = re.match(r"^/(?:room|jr)/([A-Za-z0-9_-]+)", path)
        return ("thm", "room", m.group(1).lower()) if m else None
    if host.endswith("hackthebox.com") and not host.startswith("academy."):
        m = re.match(r"^/(machines|challenges)/([^/?#]+)", path)
        if m:
            kind = "machine" if m.group(1) == "machines" else "challenge"
            return ("htb", kind, urllib.parse.unquote(m.group(2)))
    return None


def meta_path(key):
    platform, kind, ident = key
    slug = re.sub(r"[^a-z0-9]+", "-", ident.lower()).strip("-")
    return META / platform / (f"{slug}.json" if platform == "thm" else f"{kind}-{slug}.json")


def is_fresh(path):
    if not path.exists():
        return False
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return False
    if saved.get("retired"):
        return True
    fetched = saved.get("fetched")
    return bool(fetched) and (date.today() - date.fromisoformat(fetched)).days < REFRESH_DAYS


def save_icon(raw, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    im.thumbnail((ICON_PX, ICON_PX), Image.LANCZOS)
    im.save(target, "WEBP", quality=86, method=6)
    return target.name


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ---------- TryHackMe ----------
def fetch_thm(codes):
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    done = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chromium", headless=True, args=["--disable-blink-features=AutomationControlled"])
        context = browser.new_context(user_agent=UA, locale="en-GB")
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })")
        page.goto(f"https://tryhackme.com/room/{codes[0]}", wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except PlaywrightError:
            pass
        for code in codes:
            path = meta_path(("thm", "room", code))
            try:
                details = page.evaluate(
                    """async (code) => {
                        const get = async (u) => { const r = await fetch(u, { headers: { accept: "application/json" } }); return r.ok ? (await r.json()).data : null; };
                        return { details: await get(`/api/v2/rooms/details?roomCode=${code}`), votes: await get(`/api/v2/rooms/votes?roomCode=${code}`) };
                    }""",
                    code,
                )
                d = details.get("details")
                if not d or not d.get("title"):
                    raise ValueError("no room details (private room or API change?)")
                icon = None
                if d.get("imageURL"):
                    try:
                        r = context.request.get(d["imageURL"], timeout=30000)
                        if r.ok:
                            icon = save_icon(r.body(), path.with_suffix(".webp"))
                    except Exception as error:  # an odd icon format costs the icon only
                        print(f"  WARN thm {code} icon: {error}")
                write_json(path, {
                    "platform": "thm",
                    "code": d.get("code", code),
                    "url": f"https://tryhackme.com/room/{d.get('code', code)}",
                    "title": d.get("title"),
                    "description": d.get("description", ""),
                    "difficulty": d.get("difficulty", ""),
                    "type": d.get("type", ""),
                    "released": (d.get("created") or "")[:10],
                    "minutes": int(d["timeToComplete"]) if str(d.get("timeToComplete", "")).isdigit() else None,
                    "users": d.get("users"),
                    "votes": (details.get("votes") or {}).get("votes"),
                    "free": d.get("freeToUse"),
                    "icon": icon,
                    "fetched": date.today().isoformat(),
                })
                done += 1
                print(f"  thm {code}: ok")
            except Exception as error:  # keep the last good file
                print(f"  WARN thm {code}: {error}")
            time.sleep(0.6)
        browser.close()
    return done


# ---------- Hack The Box ----------
def htb_get(path, token):
    req = urllib.request.Request(f"{HTB_API}{path}", headers={"Authorization": f"Bearer {token}", "User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def htb_bytes(url, token):
    if url.startswith("/"):
        url = f"https://labs.hackthebox.com{url}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def first(obj, *keys):
    """The first present, non-empty value among alternative field names."""
    for key in keys:
        cur = obj
        for part in key.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        if cur not in (None, "", []):
            return cur
    return None


def blood(entry):
    if not isinstance(entry, dict):
        return None
    name = first(entry, "user.name", "name", "username")
    took = first(entry, "blood_difference", "time", "difference")
    return {"user": name, "time": took} if name or took else None


RADAR_KEYS = ["enum", "real", "cve", "custom", "ctf"]


def radar(values):
    """The matrix comes as {enum, real, cve, custom, ctf} (older responses: a
    list in that order). All zeros means nobody has rated it: drop it."""
    if isinstance(values, dict):
        values = [values.get(k) for k in RADAR_KEYS]
    if not isinstance(values, list) or len(values) != 5:
        return None
    values = [round(float(v or 0), 1) for v in values]
    return values if any(values) else None


def clamp(text, limit=280):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    return cut[: cut.rfind(" ")] + "…"


DIFF_BUCKETS = ["counterCake", "counterVeryEasy", "counterEasy", "counterTooEasy", "counterMedium", "counterBitHard", "counterHard", "counterTooHard", "counterExHard", "counterBrainFuck"]


PROBE = {}


def fetch_htb_machine(name, token):
    info = htb_get(f"/machine/profile/{urllib.parse.quote(name)}", token).get("info") or {}
    PROBE["machine fields"] = sorted(info.keys()) if isinstance(info, dict) else type(info).__name__
    if not info.get("name"):
        raise ValueError("no machine info")
    path = meta_path(("htb", "machine", name))
    chart = first(info, "feedbackForChart") or {}
    matrix = {}
    if info.get("id"):
        try:
            matrix = htb_get(f"/machine/graph/matrix/{info['id']}", token).get("info") or {}
            PROBE["matrix fields"] = sorted(matrix.keys()) if isinstance(matrix, dict) else type(matrix).__name__
        except Exception as error:
            print(f"  WARN htb machine {name} matrix: {error}")
    icon = None
    avatar = first(info, "avatar", "avatar_thumb")
    if avatar:
        try:
            icon = save_icon(htb_bytes(avatar, token), path.with_suffix(".webp"))
        except Exception as error:
            print(f"  WARN htb machine {name} avatar: {error}")
    makers = [first(info, "maker.name"), first(info, "maker2.name")]
    retired = first(info, "retired")
    write_json(path, {
        "platform": "htb",
        "kind": "machine",
        "name": info["name"],
        "url": f"https://app.hackthebox.com/machines/{info['name']}",
        "description": clamp(first(info, "synopsis")),
        "os": first(info, "os"),
        "difficulty": first(info, "difficultyText", "difficulty_text"),
        "released": (first(info, "release", "release_date") or "")[:10],
        "retiredOn": (first(info, "retired_date", "retiredDate", "retire_date") or "")[:10] or None,
        "retired": bool(retired) and retired not in (0, "0", False),
        "stars": first(info, "stars", "rating"),
        "makers": [m for m in makers if m],
        "ratedDifficulty": [int(chart.get(k) or 0) for k in DIFF_BUCKETS] if chart else None,
        "userOwns": first(info, "user_owns_count"),
        "rootOwns": first(info, "root_owns_count"),
        "radar": radar(first(matrix, "aggregate")),
        "userBlood": blood(first(info, "userBlood", "firstUserBlood", "user_blood")),
        "rootBlood": blood(first(info, "rootBlood", "firstRootBlood", "root_blood")),
        "icon": icon,
        "fetched": date.today().isoformat(),
    })


def fetch_htb_challenge(name, token):
    data = htb_get(f"/challenge/info/{urllib.parse.quote(name)}", token)
    c = data.get("challenge") or {}
    PROBE["challenge fields"] = sorted(c.keys()) if isinstance(c, dict) else type(c).__name__
    if not c.get("name"):
        raise ValueError("no challenge info")
    path = meta_path(("htb", "challenge", name))
    chart = first(c, "difficulty_chart", "difficultyChart") or {}
    write_json(path, {
        "platform": "htb",
        "kind": "challenge",
        "name": c["name"],
        "url": f"https://app.hackthebox.com/challenges/{urllib.parse.quote(c['name'])}",
        "category": first(c, "category_name", "category"),
        "difficulty": first(c, "difficulty"),
        "released": (first(c, "release_date", "release") or "")[:10],
        "retired": bool(first(c, "retired")),
        "stars": first(c, "stars"),
        "solves": first(c, "solves"),
        "makers": [m for m in [first(c, "creator_name"), first(c, "creator2_name")] if m],
        "ratedDifficulty": [int(chart.get(k) or 0) for k in DIFF_BUCKETS] if chart else None,
        "userBlood": {"user": first(c, "first_blood_user"), "time": first(c, "first_blood_time")} if first(c, "first_blood_user") else None,
        "icon": None,
        "fetched": date.today().isoformat(),
    })


# ---------- main ----------
def probe(target):
    global META
    import tempfile
    kind, _, name = target.partition(":")
    token = os.environ.get("HTB_APP_TOKEN", "").strip()
    if kind not in ("machine", "challenge") or not name:
        sys.exit("--probe takes machine:<Name> or challenge:<name>")
    if not token:
        sys.exit("HTB_APP_TOKEN is not set")
    META = Path(tempfile.mkdtemp())
    try:
        (fetch_htb_machine if kind == "machine" else fetch_htb_challenge)(name, token)
    except urllib.error.HTTPError as error:
        sys.exit(f"Hack The Box API HTTP {error.code} for {kind} {name} (bad or expired token?)")
    for label, fields in PROBE.items():
        print(f"{label}: {fields}")
    saved = meta_path(("htb", kind, name))
    print(f"parsed ({saved.name}):")
    print(saved.read_text(encoding="utf-8"))
    print(f"icon saved: {bool(list(saved.parent.glob('*.webp')))}")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--probe":
        return probe(sys.argv[2])
    index_file = ROOT / "writeups" / "index.json"
    if not index_file.exists():
        sys.exit("writeups/index.json not found; run node scripts/build-content-index.mjs first")
    index = json.loads(index_file.read_text(encoding="utf-8"))
    urls = sorted({r.get("roomUrl") for records in index.get("folders", {}).values() for r in records if r.get("roomUrl")})
    keys = sorted({k for k in (room_key(u) for u in urls) if k})
    stale = [k for k in keys if not is_fresh(meta_path(k))]
    print(f"Writeup rooms: {len(keys)} recognised, {len(stale)} to fetch")

    thm = [k[2] for k in stale if k[0] == "thm"]
    if thm:
        try:
            print(f"TryHackMe: {fetch_thm(thm)} of {len(thm)} rooms saved")
        except Exception as error:
            print(f"  WARN TryHackMe browser session failed: {error}")

    htb = [k for k in stale if k[0] == "htb"]
    token = os.environ.get("HTB_APP_TOKEN", "").strip()
    if htb and not token:
        print(f"Hack The Box: HTB_APP_TOKEN not set; skipping {len(htb)} link(s)")
    elif htb:
        for _, kind, name in htb:
            try:
                (fetch_htb_machine if kind == "machine" else fetch_htb_challenge)(name, token)
                print(f"  htb {kind} {name}: ok")
            except Exception as error:
                print(f"  WARN htb {kind} {name}: {error}")
            time.sleep(1)


if __name__ == "__main__":
    main()
