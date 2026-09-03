"""Rotation page: click-to-load players and the genre/format/text filters."""

from __future__ import annotations

import os

from playwright.sync_api import Browser, Page, sync_playwright


BASE_URL = os.environ.get("ROTATION_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
ROUTE = "/rotation/"


def assert_no_overflow(page: Page) -> None:
    assert page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth"
    )


def visible_rows(page: Page) -> int:
    return page.locator(".rotation-row:not([hidden])").count()


def check_players_are_click_to_load(browser: Browser) -> None:
    """The whole point of the page's privacy stance: no frame until asked."""
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()

    soundcloud_requests: list[str] = []
    page.on(
        "request",
        lambda request: soundcloud_requests.append(request.url)
        if "soundcloud.com" in request.url
        else None,
    )

    page.goto(f"{BASE_URL}{ROUTE}", wait_until="networkidle")
    page.locator(".rotation-row").first.wait_for(timeout=10_000)

    # Nothing embedded, and nothing requested from SoundCloud, until a click.
    assert page.locator("iframe").count() == 0
    assert soundcloud_requests == [], f"contacted SoundCloud before any click: {soundcloud_requests}"

    button = page.locator(".rotation-play").first
    assert button.get_attribute("aria-expanded") == "false"
    box = button.bounding_box()
    assert box and box["width"] >= 44 and box["height"] >= 44

    button.click()
    frame = page.locator(".rotation-row").first.locator("iframe")
    frame.wait_for(timeout=5_000)

    assert page.locator("iframe").count() == 1
    src = frame.get_attribute("src")
    assert src.startswith("https://w.soundcloud.com/player/")
    assert "api.soundcloud.com" in src
    assert "auto_play=true" in src
    assert frame.get_attribute("title")
    assert "autoplay" in (frame.get_attribute("allow") or "")
    assert button.get_attribute("aria-expanded") == "true"

    # Pressing the same control again tears the player back down.
    button.click()
    assert page.locator("iframe").count() == 0
    assert button.get_attribute("aria-expanded") == "false"

    context.close()


def check_only_one_player_at_a_time(browser: Browser) -> None:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE_URL}{ROUTE}", wait_until="networkidle")
    page.locator(".rotation-row").first.wait_for(timeout=10_000)

    buttons = page.locator(".rotation-play")
    if buttons.count() < 2:
        # Only meaningful with two or more entries; skip rather than fail on a
        # short rotation.
        context.close()
        return

    buttons.nth(0).click()
    page.locator(".rotation-row").nth(0).locator("iframe").wait_for(timeout=5_000)
    buttons.nth(1).click()
    page.locator(".rotation-row").nth(1).locator("iframe").wait_for(timeout=5_000)

    assert page.locator("iframe").count() == 1, "two players open at once"
    assert buttons.nth(0).get_attribute("aria-expanded") == "false"

    context.close()


def check_filters(browser: Browser) -> None:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE_URL}{ROUTE}", wait_until="networkidle")
    page.locator(".rotation-row").first.wait_for(timeout=10_000)

    total = visible_rows(page)
    assert total >= 1

    query = page.locator("#rotation-query")

    # A query that cannot match anything empties the list and shows the notice.
    query.fill("zzzz-no-such-track-zzzz")
    assert visible_rows(page) == 0
    assert page.locator("#rotation-empty").is_visible()
    assert "q=zzzz" in page.url

    query.fill("")
    assert visible_rows(page) == total
    assert page.locator("#rotation-empty").is_hidden()

    # Genre chips narrow the list, and every surviving row carries that genre.
    chip = page.locator("#rotation-genres .rotation-chip").first
    genre = chip.text_content().strip()
    chip.click()
    assert chip.get_attribute("aria-pressed") == "true"
    assert f"genre={genre}" in page.url
    narrowed = visible_rows(page)
    assert 0 < narrowed <= total
    for row in page.locator(".rotation-row:not([hidden])").all():
        assert genre in (row.get_attribute("data-genres") or "").split()

    # Clicking the active chip clears that axis again.
    chip.click()
    assert chip.get_attribute("aria-pressed") == "false"
    assert visible_rows(page) == total

    # Format behaves the same way.
    fmt_chip = page.locator("#rotation-formats .rotation-chip").first
    fmt = fmt_chip.text_content().strip()
    fmt_chip.click()
    assert f"format={fmt}" in page.url
    for row in page.locator(".rotation-row:not([hidden])").all():
        assert row.get_attribute("data-format") == fmt

    context.close()


def check_filtered_url_restores(browser: Browser) -> None:
    """A filtered view is shareable: the query string rebuilds it on load."""
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto(f"{BASE_URL}{ROUTE}", wait_until="networkidle")
    page.locator(".rotation-row").first.wait_for(timeout=10_000)
    genre = page.locator("#rotation-genres .rotation-chip").first.text_content().strip()

    page.goto(f"{BASE_URL}{ROUTE}?genre={genre}", wait_until="networkidle")
    page.locator(".rotation-row").first.wait_for(timeout=10_000)
    active = page.locator("#rotation-genres .rotation-chip[aria-pressed='true']")
    assert active.count() == 1
    assert active.text_content().strip() == genre

    context.close()


def check_narrow_viewport(browser: Browser) -> None:
    for width, height in ((320, 568), (390, 844)):
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.goto(f"{BASE_URL}{ROUTE}", wait_until="networkidle")
        page.locator(".rotation-row").first.wait_for(timeout=10_000)

        assert_no_overflow(page)
        button = page.locator(".rotation-play").first
        box = button.bounding_box()
        assert box and box["width"] >= 44 and box["height"] >= 44

        # Opening a player must not push the layout sideways either.
        button.click()
        page.locator(".rotation-row").first.locator("iframe").wait_for(timeout=5_000)
        assert_no_overflow(page)
        context.close()


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        check_players_are_click_to_load(browser)
        check_only_one_player_at_a_time(browser)
        check_filters(browser)
        check_filtered_url_restores(browser)
        check_narrow_viewport(browser)
        browser.close()
    print("Rotation browser checks passed.")


if __name__ == "__main__":
    main()
