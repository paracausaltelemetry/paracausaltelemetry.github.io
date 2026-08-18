import os
import re
from playwright.sync_api import sync_playwright, expect


BASE = os.environ.get("THREAT_ACTOR_BASE_URL", "http://127.0.0.1:8765")


def settle(page, path):
    print(f"Checking {path}", flush=True)
    page.goto(f"{BASE}{path}", wait_until="networkidle")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, color_scheme="dark")
    page = context.new_page()
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))

    # There is no hub page: the homepage section is the only route into the
    # dossiers, and it renders one card per published profile.
    settle(page, "/")
    section = page.locator("#threat-actors:not([hidden])")
    section.wait_for(timeout=10_000)
    expect(page.get_by_role("heading", name="Threat actors", exact=True)).to_be_visible()
    expect(page.locator("#actor-list .actor-card")).to_have_count(5)
    expect(page.locator("#actor-list .actor-card", has_text="BAUXITE")).to_have_count(1)
    page.locator("#actor-list .actor-card", has_text="BAUXITE").click()
    expect(page).to_have_url(f"{BASE}/threat-actors/bauxite/")

    # Global search loads the threat-actor index alongside the Blue Team index.
    page.get_by_role("button", name="Search").click()
    command_input = page.locator("#command-palette input")
    command_input.fill("BAUXITE")
    expect(page.get_by_role("option").filter(has_text="BAUXITE")).to_be_visible()
    command_input.press("Escape")

    # Every expansion profile renders its own identity scope and paired Navigator layers.
    profile_expectations = {
        "cyberav3ngers": ("CyberAv3ngers", 4, 3, 6),
        "graphite": ("GRAPHITE", 4, 4, 3),
        "kamacite": ("KAMACITE", 4, 4, 5),
        "sandworm-team": ("Sandworm Team", 5, 9, 11),
    }
    for slug, (name, designations, enterprise_rows, ics_rows) in profile_expectations.items():
        settle(page, f"/threat-actors/{slug}/")
        expect(page.locator("h1", has_text=name)).to_be_visible()
        # One provider line per designation, canonical included.
        expect(page.locator(".actor-resolution-provider")).to_have_count(designations)
        expect(page.locator(".actor-ttp-domain").nth(0).locator(".actor-ttp-card")).to_have_count(enterprise_rows)
        expect(page.locator(".actor-ttp-domain").nth(1).locator(".actor-ttp-card")).to_have_count(ics_rows)
        expect(page.get_by_role("link", name="Download Navigator layer")).to_have_count(2)
        expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", f"https://paracausaltelemetry.com/threat-actors/{slug}/")

    # The BAUXITE dossier preserves identity scopes, evidence, ATT&CK domains, and historical IOC handling.
    settle(page, "/threat-actors/bauxite/")
    expect(page.locator("h1", has_text="BAUXITE")).to_be_visible()
    expect(page.locator(".actor-resolution-provider")).to_have_count(4)
    expect(page.locator(".actor-resolution-primary")).to_contain_text("BAUXITE")
    expect(page.locator(".actor-resolution-overlap").first).to_contain_text("G1027")
    expect(page.get_by_text("not treated as an alias for BAUXITE", exact=False)).to_be_visible()
    expect(page.locator("#ttp-enterprise-title")).to_be_visible()
    expect(page.locator("#ttp-ics-title")).to_be_visible()
    expect(page.locator(".actor-ttp-domain").nth(0).locator(".actor-ttp-card")).to_have_count(3)
    expect(page.locator(".actor-ttp-domain").nth(1).locator(".actor-ttp-card")).to_have_count(6)
    expect(page.locator(".actor-indicator-card")).to_have_count(6)
    expect(page.get_by_text("159[.]100[.]6[.]69", exact=True)).to_be_visible()
    expect(page.get_by_text("159.100.6.69", exact=True)).to_have_count(0)
    expect(page.get_by_role("link", name="Download actor JSON")).to_have_attribute("href", "/threat-actors/data/bauxite.json")
    expect(page.get_by_role("link", name="Download Navigator layer")).to_have_count(2)
    expect(page.locator('link[rel="canonical"]')).to_have_attribute("href", "https://paracausaltelemetry.com/threat-actors/bauxite/")

    # Theme and keyboard-visible controls remain wired through the shared shell.
    page.locator("#theme-toggle").click()
    expect(page.locator("body")).to_have_class(re.compile(r"light-mode"))
    page.locator(".actor-dossier-nav a").first.focus()
    expect(page.locator(".actor-dossier-nav a").first).to_be_focused()

    # Mobile layouts stack the identity resolution chain without creating body-level horizontal overflow.
    mobile = context.new_page()
    mobile.set_viewport_size({"width": 390, "height": 844})
    settle(mobile, "/threat-actors/bauxite/")
    expect(mobile.locator(".actor-resolution-provider")).to_have_count(4)
    assert mobile.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "actor dossier overflows the mobile viewport"
    mobile.close()

    assert not console_errors, f"console errors: {console_errors}"
    context.close()

    reduced = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
    reduced_page = reduced.new_page()
    settle(reduced_page, "/threat-actors/bauxite/")
    expect(reduced_page.locator(".actor-resolution-primary")).to_be_visible()
    reduced.close()
    browser.close()

print("Threat actor browser QA passed")
