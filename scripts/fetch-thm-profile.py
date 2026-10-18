#!/usr/bin/env python3
"""Fetch the public TryHackMe profile JSON through a headless browser.

TryHackMe's API sits behind Vercel bot protection, which answers plain HTTP
clients with 429. A real (headless) browser that has loaded the profile page
gets the JSON, so the profiles workflow uses this, then hands the file to
scripts/update-profiles.mjs (--thm-file).

It first takes the profile JSON the page itself requests while rendering;
if that never arrives, it waits for the profile to render and asks for the
JSON from inside the page, retrying a few times. On failure it reports what
the browser saw (status, title), so a run log shows whether the page or only
the API was blocked.

    python scripts/fetch-thm-profile.py ParacausalTelemetry thm.json

On GitHub's runners the default headless shell is stopped by Vercel's
Security Checkpoint; the full Chromium build in new headless mode, with the
webdriver flag hidden, gets through. THM_HEADED=1 runs a visible browser
instead (under xvfb-run on CI) if that ever stops working.

Needs Playwright with Chromium (pip install playwright; playwright install chromium).
"""
import json
import os
import sys

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    username, out = sys.argv[1], sys.argv[2]
    captured = {}

    def on_response(response):
        if "/api/v2/public-profile" in response.url and response.status == 200 and "data" not in captured:
            try:
                body = response.json()
                if body.get("data", {}).get("username", "").lower() == username.lower():
                    captured["data"] = body
            except (PlaywrightError, ValueError):
                pass

    with sync_playwright() as p:
        headed = os.environ.get("THM_HEADED") == "1"
        # channel "chromium" is the full browser in new headless mode, which
        # bot checks flag less often than the default headless shell
        browser = p.chromium.launch(channel="chromium", headless=not headed, args=["--disable-blink-features=AutomationControlled"])
        context = browser.new_context(user_agent=UA, locale="en-GB", viewport={"width": 1366, "height": 900})
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })")
        page.on("response", on_response)
        doc = page.goto(f"https://tryhackme.com/p/{username}", wait_until="domcontentloaded", timeout=60000)
        doc_status = doc.status if doc else None
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except PlaywrightError:
            pass
        # Vercel's checkpoint page solves itself and reloads; give it time
        try:
            page.wait_for_function("u => document.body && document.body.innerText.includes(u)", arg=username, timeout=45000)
        except PlaywrightError:
            pass

        status = None
        for attempt in range(4):
            if "data" in captured:
                break
            status, body = page.evaluate(
                """async (user) => {
                    const r = await fetch(`/api/v2/public-profile?username=${encodeURIComponent(user)}`, { headers: { accept: "application/json" } });
                    return [r.status, await r.text()];
                }""",
                username,
            )
            if status == 200:
                captured["data"] = json.loads(body)
                break
            page.wait_for_timeout(5000 * (attempt + 1))

        title = page.title()
        browser.close()

    if "data" not in captured:
        sys.exit(f"TryHackMe API HTTP {status} (profile page HTTP {doc_status}, title {title!r})")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(captured["data"], f)
    print(f"TryHackMe profile saved to {out}")


if __name__ == "__main__":
    main()
