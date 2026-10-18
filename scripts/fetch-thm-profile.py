#!/usr/bin/env python3
"""Fetch the public TryHackMe profile JSON for the Writeups profile chips.

Plain HTTP is tried first. TryHackMe's bot protection usually answers it with
429 (always from CI runners); then, with --browser, an ordinary headless
browser session is used, which a home connection is let through. No masking
or stealth settings are used, and none should be. Run with --browser locally
to refresh the chip, then:

    python scripts/fetch-thm-profile.py ParacausalTelemetry thm.json --browser
    node scripts/update-profiles.mjs --fetch --thm-file thm.json

Exits non-zero if the profile could not be fetched; the profiles workflow
then keeps the last saved TryHackMe figures.

--browser needs Playwright with Chromium (pip install playwright; playwright install chromium).
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = "paracausaltelemetry-writeup-cards/1.0 (+https://paracausaltelemetry.com/)"


def via_http(username):
    url = f"https://tryhackme.com/api/v2/public-profile?username={urllib.parse.quote(username)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.HTTPError as error:
        return None, f"HTTP {error.code}"


def via_browser(username):
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"https://tryhackme.com/p/{username}", wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except PlaywrightError:
            pass
        status, body = page.evaluate(
            """async (user) => {
                const r = await fetch(`/api/v2/public-profile?username=${encodeURIComponent(user)}`, { headers: { accept: "application/json" } });
                return [r.status, await r.text()];
            }""",
            username,
        )
        browser.close()
    return (json.loads(body), None) if status == 200 else (None, f"HTTP {status} (browser)")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    username, out = args
    data, error = via_http(username)
    if data is None and "--browser" in sys.argv:
        data, error = via_browser(username)
    if data is None:
        sys.exit(f"TryHackMe profile not fetched: {error}")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"TryHackMe profile saved to {out}")


if __name__ == "__main__":
    main()
