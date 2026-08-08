"""Shared shell, mobile navigation and curated homepage regression checks."""

from __future__ import annotations

import os

from playwright.sync_api import Browser, Page, sync_playwright


BASE_URL = os.environ.get("FOUNDATION_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
CORE_NAV = ["Home", "Projects", "Writeups", "Alchemist", "Observer", "Threat Actors"]


def assert_no_overflow(page: Page) -> None:
    assert page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth"
    )


def assert_core_navigation(page: Page, active: str | None) -> None:
    nav = page.locator(".site-header .site-nav")
    assert nav.locator(":scope > a").all_text_contents() == CORE_NAV
    assert nav.locator(":scope > a", has_text="Alchemist").get_attribute("href") == (
        "https://alchemist.paracausaltelemetry.com/"
    )
    assert page.locator(".site-header .brand-mark svg").count() == 1
    current = nav.locator('[aria-current="page"]')
    if active is None:
        assert current.count() == 0
    else:
        assert current.count() == 1
        assert current.text_content() == active


def check_protected_home_hero_and_sequence(browser: Browser) -> None:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE_URL}/#top", wait_until="networkidle")

    hero = page.locator("main#top > section.hero.hero-cta")
    assert hero.count() == 1
    card = hero.locator(":scope > .hero-card#hero-card")
    assert card.count() == 1
    assert card.locator(":scope > canvas.hero-dither#hero-dither[aria-hidden='true']").count() == 1
    copy = card.locator(":scope > .hero-copy")
    assert copy.locator(":scope > h1#hero-title").text_content() == "Paracausal Telemetry."
    assert copy.locator(":scope > p.hero-summary#hero-summary").count() == 1
    assert copy.locator(":scope > .hero-actions#hero-actions").count() == 1
    assert copy.locator("#hero-actions > a").all_text_contents() == ["View projects", "Read writeups"]

    card_box = card.bounding_box()
    copy_box = copy.bounding_box()
    canvas_box = card.locator("#hero-dither").bounding_box()
    assert card_box and copy_box and canvas_box
    assert abs(card_box["width"] - canvas_box["width"]) <= 2.1
    assert abs(card_box["height"] - canvas_box["height"]) <= 2.1
    assert copy_box["x"] >= card_box["x"] and copy_box["y"] >= card_box["y"]

    page.locator("#latest:not([hidden])").wait_for(timeout=10_000)
    section_ids = page.locator("main#top > section.section").evaluate_all(
        "sections => sections.map(section => section.id)"
    )
    assert section_ids == [
        "weather",
        "latest",
        "projects",
        "certifications",
    ]
    # The forecast is click-gated: nothing is fetched or rendered on load, so
    # the panel must ship idle with its button and no result.
    weather = page.locator("#weather")
    assert weather.locator("[data-weather-action]").is_visible()
    assert weather.locator("[data-weather-result]").count() == 1
    assert weather.locator("[data-weather-result]:not([hidden])").count() == 0
    # No contact surface and no public profile links anywhere on the page.
    assert page.locator("#contact, #munro").count() == 0
    assert page.locator('a[href^="mailto:"]').count() == 0
    assert page.locator(
        'a[href*="linkedin.com"], a[href*="tryhackme.com"], a[href*="hackthebox.com"], a[href*="credly.com"]'
    ).count() == 0
    assert page.get_by_text("Explore the site", exact=True).count() == 0
    assert page.get_by_role(
        "heading", name="Choose the route that fits the question."
    ).count() == 0
    assert page.locator(".tools-teaser-section, .presence-section").count() == 0
    assert page.locator("#projects .project-card strong").all_text_contents() == [
        "RFIDemon",
        "Pwn2Play CTF",
        "Alchemist",
    ]
    assert page.locator("#certification-grid .credential-row h3").all_text_contents() == [
        "SC-200: Microsoft Security Operations Analyst",
        "BSc (Hons) Cyber Security - 1:1",
        "ICS-300",
        "Blue Team Level 1 (BTL1)",
    ]
    assert_core_navigation(page, "Home")
    assert_no_overflow(page)
    context.close()


def check_navigation_states(browser: Browser) -> None:
    cases = (
        ("/#top", "Home"),
        ("/projects/", "Projects"),
        ("/projects/pwn2play/", "Projects"),
        ("/writeups/", "Writeups"),
        ("/observer/", "Observer"),
        ("/threat-actors/", None),
    )
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    for route, active in cases:
        page.goto(f"{BASE_URL}{route}", wait_until="networkidle")
        assert_core_navigation(page, active)
    context.close()


def check_pwn2play_reface(browser: Browser) -> None:
    for width, height in ((390, 844), (1440, 1000)):
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.goto(f"{BASE_URL}/projects/pwn2play/", wait_until="networkidle")

        hero = page.locator("main#top > .p2p-hero")
        assert hero.count() == 1
        assert hero.get_by_role("heading", name="Pwn2Play").count() == 1
        assert hero.locator(".p2p-logotype img[alt*='Pwn2Play 2026']").count() == 1

        # The CTF archive subdomain is retired: no links into it remain.
        assert page.locator('a[href*="ctf.paracausaltelemetry.com"]').count() == 0
        assert page.locator(".p2p-section").count() == 4
        assert page.locator(".p2p-role-card").first.evaluate(
            "element => getComputedStyle(element).borderRadius"
        ) == "0px"
        assert page.locator(".p2p-challenge-card").first.evaluate(
            "element => getComputedStyle(element).borderRadius"
        ) == "0px"
        assert_core_navigation(page, "Projects")
        assert_no_overflow(page)
        context.close()


def check_mobile_menu(browser: Browser) -> None:
    for width, height in ((320, 568), (390, 844), (768, 1024), (844, 390)):
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.goto(f"{BASE_URL}/credentials/", wait_until="networkidle")
        toggle = page.locator(".site-menu-toggle")
        assert toggle.is_visible()
        assert toggle.get_attribute("aria-label") == "Open site menu"
        assert toggle.bounding_box()["height"] >= 44
        assert page.locator("#site-menu").get_attribute("inert") == ""

        toggle.focus()
        page.keyboard.press("Enter")
        assert toggle.get_attribute("aria-expanded") == "true"
        assert page.locator("#site-menu").get_attribute("inert") is None
        assert page.get_by_role("button", name="Search").is_visible()
        assert page.locator("#theme-toggle").is_visible()
        page.locator(".site-nav a:focus").wait_for(state="visible")
        assert page.evaluate("document.activeElement?.closest('.site-nav') !== null")
        assert_no_overflow(page)

        page.keyboard.press("Escape")
        assert toggle.get_attribute("aria-expanded") == "false"
        assert toggle.evaluate("element => document.activeElement === element")

        toggle.click()
        page.locator("main").click(position={"x": 2, "y": 2})
        assert toggle.get_attribute("aria-expanded") == "false"
        context.close()

    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.goto(f"{BASE_URL}/credentials/", wait_until="networkidle")
    toggle = page.locator(".site-menu-toggle")
    toggle.click()
    page.set_viewport_size({"width": 1200, "height": 800})
    page.wait_for_timeout(100)
    assert toggle.is_hidden()
    assert page.locator("#site-menu").get_attribute("inert") is None
    assert page.locator("#site-menu").get_attribute("aria-hidden") == "false"
    context.close()


def check_no_javascript_navigation(browser: Browser) -> None:
    context = browser.new_context(
        java_script_enabled=False, viewport={"width": 390, "height": 844}
    )
    page = context.new_page()
    page.goto(f"{BASE_URL}/credentials/", wait_until="networkidle")
    assert page.locator(".site-menu-toggle").count() == 0
    assert page.locator(".site-header .site-nav").is_visible()
    assert_core_navigation(page, None)
    assert_no_overflow(page)
    context.close()


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        check_protected_home_hero_and_sequence(browser)
        check_navigation_states(browser)
        check_pwn2play_reface(browser)
        check_mobile_menu(browser)
        check_no_javascript_navigation(browser)
        browser.close()
    print("Foundation and homepage browser checks passed.")


if __name__ == "__main__":
    main()
