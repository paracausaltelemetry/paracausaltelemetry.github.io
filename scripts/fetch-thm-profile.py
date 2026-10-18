#!/usr/bin/env python3
"""Fetch the public TryHackMe profile JSON through a headless browser.

TryHackMe's API sits behind Vercel bot protection, which answers plain HTTP
clients with 429. A real (headless) browser that has loaded the profile page
gets the JSON, so the profiles workflow uses this, then hands the file to
scripts/update-profiles.mjs (--thm-file).

    python scripts/fetch-thm-profile.py ParacausalTelemetry thm.json

Needs Playwright with Chromium (pip install playwright; playwright install chromium).
"""
import json
import sys

from playwright.sync_api import sync_playwright


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    username, out = sys.argv[1], sys.argv[2]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"https://tryhackme.com/p/{username}", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
        status, body = page.evaluate(
            """async (user) => {
                const r = await fetch(`/api/v2/public-profile?username=${encodeURIComponent(user)}`, { headers: { accept: "application/json" } });
                return [r.status, await r.text()];
            }""",
            username,
        )
        browser.close()
    if status != 200:
        sys.exit(f"TryHackMe HTTP {status}")
    data = json.loads(body)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"TryHackMe profile saved to {out}")


if __name__ == "__main__":
    main()
