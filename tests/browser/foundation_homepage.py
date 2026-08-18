"""Shared shell, mobile navigation and curated homepage regression checks."""

from __future__ import annotations

import os

from playwright.sync_api import Browser, Page, sync_playwright


BASE_URL = os.environ.get("FOUNDATION_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
CORE_NAV = ["Home", "Writeups", "Alchemist"]
# A generated writeup article. These pages carry the full shell and now load
# the reader enhancements, so they are the right surface for the menu checks.
ARTICLE = "/writeups/thm/blue/thm-juicydetails/"


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

    # No entry splash: the page is the first thing a visitor sees.
    assert page.locator("#splash").count() == 0

    hero = page.locator("main#top > section.hero.hero-cta")
    assert hero.count() == 1
    card = hero.locator(":scope > .hero-card#hero-card")
    assert card.count() == 1
    assert card.locator(":scope > canvas.hero-dither#hero-dither[aria-hidden='true']").count() == 1
    copy = card.locator(":scope > .hero-copy")
    assert copy.locator(":scope > h1#hero-title").text_content() == "Paracausal Telemetry."
    assert copy.locator(":scope > .hero-actions#hero-actions").count() == 1
    assert copy.locator("#hero-actions > a").all_text_contents() == [
        "Read writeups",
        "Search Observer",
    ]

    card_box = card.bounding_box()
    copy_box = copy.bounding_box()
    canvas_box = card.locator("#hero-dither").bounding_box()
    assert card_box and copy_box and canvas_box
    assert abs(card_box["width"] - canvas_box["width"]) <= 2.1
    assert abs(card_box["height"] - canvas_box["height"]) <= 2.1
    assert copy_box["x"] >= card_box["x"] and copy_box["y"] >= card_box["y"]

    page.locator("#latest:not([hidden])").wait_for(timeout=10_000)
    page.locator("#threat-actors:not([hidden])").wait_for(timeout=10_000)
    section_ids = page.locator("main#top > section.section").evaluate_all(
        "sections => sections.map(section => section.id)"
    )
    assert section_ids == ["latest", "observer", "threat-actors"]

    # Observer is a plain form that hands a query to /observer/: nothing of the
    # catalogue is fetched here, so the homepage stays light.
    launch = page.locator("#observer form.observer-launch")
    assert launch.get_attribute("action") == "/observer/"
    assert launch.get_attribute("method") == "get"
    assert launch.locator("input[name='q']").count() == 1
    assert page.locator("#observer-results, #observer-suggestions").count() == 0

    # Threat actors: one card per published dossier, straight into the dossier.
    cards = page.locator("#actor-list .actor-card")
    assert cards.count() == 5
    hrefs = cards.evaluate_all("cards => cards.map(card => card.getAttribute('href'))")
    assert all(href.startswith("/threat-actors/") and href.endswith("/") for href in hrefs)
    assert "/threat-actors/bauxite/" in hrefs

    # No contact surface and no public profile links anywhere on the page.
    assert page.locator("#contact, #munro").count() == 0
    assert page.locator('a[href^="mailto:"]').count() == 0
    assert page.locator(
        'a[href*="linkedin.com"], a[href*="tryhackme.com"], a[href*="hackthebox.com"], a[href*="credly.com"]'
    ).count() == 0
    # The culled pages leave no links behind.
    assert page.locator(
        'a[href^="/projects/"], a[href^="/design/"], a[href^="/credentials/"]'
    ).count() == 0
    assert page.locator(".tools-teaser-section, .presence-section").count() == 0
    assert_core_navigation(page, "Home")
    assert_no_overflow(page)
    context.close()


def check_navigation_states(browser: Browser) -> None:
    cases = (
        ("/#top", "Home"),
        ("/writeups/", "Writeups"),
        (ARTICLE, "Writeups"),
        ("/observer/", None),
        ("/threat-actors/bauxite/", None),
    )
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    for route, active in cases:
        page.goto(f"{BASE_URL}{route}", wait_until="networkidle")
        assert_core_navigation(page, active)
    context.close()


def check_writeup_article_reading(browser: Browser) -> None:
    """The article pages are the product: readable and enhanced at any width."""
    for width, height in ((320, 568), (390, 844), (1440, 1000)):
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.goto(f"{BASE_URL}{ARTICLE}", wait_until="networkidle")

        body = page.locator(".markdown-body")
        assert body.count() == 1
        # A real gutter on both sides: the prose used to run to the screen edge.
        box = body.bounding_box()
        assert box and box["x"] >= 8
        assert box["x"] + box["width"] <= width - 8

        # Enhancements the static pages previously shipped without.
        assert page.locator(".markdown-body .heading-anchor").count() > 0
        assert page.locator(".markdown-body .writeup-code-block").count() > 0
        assert page.locator(".markdown-body .writeup-code-copy").count() > 0
        # Code scrolls inside its own box rather than widening the page.
        assert page.evaluate(
            "[...document.querySelectorAll('.markdown-body pre')]"
            ".every(pre => getComputedStyle(pre).overflowX !== 'visible')"
        )
        # theme.js is running, so the mobile layer actually applies.
        assert page.evaluate("document.body.classList.contains('mobile-lite')") == (width <= 960)
        assert_no_overflow(page)
        context.close()


def check_writeup_article_theme_toggle(browser: Browser) -> None:
    """The baked header's theme toggle was inert on these pages; it works now."""
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE_URL}{ARTICLE}", wait_until="networkidle")
    before = page.evaluate("document.body.classList.contains('light-mode')")
    page.locator("#theme-toggle").click()
    page.wait_for_timeout(100)
    assert page.evaluate("document.body.classList.contains('light-mode')") is not before
    assert page.evaluate("document.cookie.includes('pt_theme=')")
    context.close()


def check_mobile_menu(browser: Browser) -> None:
    for width, height in ((320, 568), (390, 844), (768, 1024), (844, 390)):
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.goto(f"{BASE_URL}{ARTICLE}", wait_until="networkidle")
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
    page.goto(f"{BASE_URL}{ARTICLE}", wait_until="networkidle")
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

    page.goto(f"{BASE_URL}{ARTICLE}", wait_until="networkidle")
    assert page.locator(".site-menu-toggle").count() == 0
    assert page.locator(".site-header .site-nav").is_visible()
    assert_core_navigation(page, "Writeups")
    # Still readable without scripting: gutters come from CSS, not from JS.
    box = page.locator(".markdown-body").bounding_box()
    assert box and box["x"] >= 8
    assert_no_overflow(page)

    # The Observer form is plain HTML, so it still reaches the results page.
    page.goto(f"{BASE_URL}/#observer", wait_until="networkidle")
    page.locator("#observer-q").fill("4625")
    page.locator("#observer form.observer-launch button[type=submit]").click()
    page.wait_for_url("**/observer/?q=4625")
    context.close()


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        check_protected_home_hero_and_sequence(browser)
        check_navigation_states(browser)
        check_writeup_article_reading(browser)
        check_writeup_article_theme_toggle(browser)
        check_mobile_menu(browser)
        check_no_javascript_navigation(browser)
        browser.close()
    print("Foundation and homepage browser checks passed.")


if __name__ == "__main__":
    main()
