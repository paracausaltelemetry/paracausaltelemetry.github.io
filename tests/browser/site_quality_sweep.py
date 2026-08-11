"""Cross-template browser audit for public Paracausal Telemetry routes."""

from __future__ import annotations

import json
import os
from urllib.parse import urlparse

from playwright.sync_api import Error, sync_playwright


BASE_URL = os.environ.get("SITE_SWEEP_BASE_URL", "http://127.0.0.1:8878").rstrip("/")

ROUTES = (
    "/#top",
    "/credentials/",
    "/design/",
    "/projects/",
    "/projects/pwn2play/",
    "/writeups/",
    "/observer/",
    "/threat-actors/",
)

PRESENTATIONS = (
    ("desktop-dark", {"width": 1440, "height": 1000}, "dark"),
    ("mobile-light", {"width": 390, "height": 844}, "light"),
    ("compact-dark", {"width": 320, "height": 568}, "dark"),
)


def is_same_origin(url: str) -> bool:
    expected = urlparse(BASE_URL)
    actual = urlparse(url)
    return (actual.scheme, actual.netloc) == (expected.scheme, expected.netloc)


def audit_page(page, route: str) -> dict:
    console_errors: list[str] = []
    page_errors: list[str] = []
    failed_requests: list[str] = []

    page.on(
        "console",
        lambda message: console_errors.append(message.text) if message.type == "error" else None,
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "requestfailed",
        lambda request: failed_requests.append(
            f"{request.method} {request.url}: {request.failure}"
        )
        if is_same_origin(request.url)
        else None,
    )

    try:
        response = page.goto(
            f"{BASE_URL}{route}",
            wait_until="commit",
            timeout=15_000,
        )
        page.locator("main").wait_for(state="attached", timeout=10_000)
    except Error as error:
        return {
            "route": route,
            "findings": [f"navigation failed: {error}"],
            "metrics": {},
        }
    page.wait_for_timeout(500)

    metrics = page.evaluate(
        """() => {
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const labelFor = (element) => {
            if (element.getAttribute("aria-label")?.trim()) return true;
            if (element.getAttribute("aria-labelledby")?.trim()) return true;
            if (element.textContent?.trim()) return true;
            if (element instanceof HTMLInputElement && element.value?.trim()) return true;
            if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) return true;
            return Boolean(element.closest("label"));
          };
          const interactive = Array.from(document.querySelectorAll("a[href], button, input, select, textarea"))
            .filter(visible);
          const targetSized = interactive.filter((element) => {
            if (!(element instanceof HTMLAnchorElement)) return true;
            if (element.matches(".heading-anchor, .credential-row-link")) return true;
            if (element.closest("nav, [role='navigation']")) return true;
            return getComputedStyle(element).display !== "inline";
          });
          return {
            lang: document.documentElement.lang,
            title: document.title.trim(),
            description: document.querySelector('meta[name="description"]')?.content.trim() || "",
            mainCount: document.querySelectorAll("main").length,
            visibleH1Count: Array.from(document.querySelectorAll("h1")).filter(visible).length,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            brokenImages: Array.from(document.images)
              .filter((image) => visible(image) && image.complete && image.naturalWidth === 0)
              .map((image) => image.currentSrc || image.src),
            unnamedInteractive: interactive
              .filter((element) => !labelFor(element))
              .map((element) => element.outerHTML.slice(0, 180)),
            emptyLinks: Array.from(document.querySelectorAll('a[href=""], a:not([href])'))
              .filter(visible)
              .map((element) => element.outerHTML.slice(0, 180)),
            tinyTargets: targetSized
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return { element: element.outerHTML.slice(0, 140), width: rect.width, height: rect.height };
              })
              .filter((item) => item.width < 24 || item.height < 24),
            mobileDockHeight: window.innerWidth <= 960
              ? document.querySelector(".header-actions")?.getBoundingClientRect().height || 0
              : 0,
            headerVisible: Boolean(Array.from(document.querySelectorAll("header")).find(visible)),
            footerVisible: Boolean(Array.from(document.querySelectorAll("footer")).find(visible)),
          };
        }"""
    )

    findings: list[str] = []
    if response is None or response.status >= 400:
        findings.append(f"HTTP status {response.status if response else 'unknown'}")
    if metrics["lang"] != "en":
        findings.append(f"document language is {metrics['lang']!r}")
    if not metrics["title"]:
        findings.append("missing document title")
    if not metrics["description"]:
        findings.append("missing meta description")
    if metrics["mainCount"] != 1:
        findings.append(f"expected one main landmark, found {metrics['mainCount']}")
    if metrics["visibleH1Count"] != 1:
        findings.append(f"expected one visible h1, found {metrics['visibleH1Count']}")
    if metrics["horizontalOverflow"] > 1:
        findings.append(f"horizontal overflow of {metrics['horizontalOverflow']}px")
    if metrics["brokenImages"]:
        findings.append(f"broken images: {metrics['brokenImages']}")
    if metrics["unnamedInteractive"]:
        findings.append(f"unnamed controls: {metrics['unnamedInteractive']}")
    if metrics["emptyLinks"]:
        findings.append(f"empty links: {metrics['emptyLinks']}")
    if metrics["tinyTargets"]:
        examples = "; ".join(
            f"{item['width']:.1f}x{item['height']:.1f} {item['element']}"
            for item in metrics["tinyTargets"][:3]
        )
        findings.append(
            f"{len(metrics['tinyTargets'])} targets below 24px ({examples})"
        )
    if metrics["mobileDockHeight"] > 100:
        findings.append(
            f"mobile navigation dock is {metrics['mobileDockHeight']:.1f}px high"
        )
    if console_errors:
        findings.append(f"console errors: {console_errors}")
    if page_errors:
        findings.append(f"page errors: {page_errors}")
    if failed_requests:
        findings.append(f"failed same-origin requests: {failed_requests}")

    return {"route": route, "findings": findings, "metrics": metrics}


def main() -> None:
    results: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for name, viewport, color_scheme in PRESENTATIONS:
            context = browser.new_context(viewport=viewport, color_scheme=color_scheme)
            # The home route would otherwise open behind the entry splash.
            context.add_init_script("try{sessionStorage.setItem('pt_splash','seen')}catch(e){}")
            for route in ROUTES:
                print(f"Auditing {name} {route}", flush=True)
                page = context.new_page()
                result = audit_page(page, route)
                result["presentation"] = name
                results.append(result)
                page.close()
            context.close()
        browser.close()

    failures = [result for result in results if result["findings"]]
    print(
        json.dumps(
            [
                {
                    "presentation": result["presentation"],
                    "route": result["route"],
                    "findings": result["findings"],
                }
                for result in failures
            ],
            indent=2,
        )
    )
    print(f"Audited {len(results)} route presentations; {len(failures)} reported findings.")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
