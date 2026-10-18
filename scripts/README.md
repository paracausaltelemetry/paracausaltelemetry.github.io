# Scripts

Inventory of every script in this directory: what it does, how it runs, and whether it is safe to re-run. See also the repo-root `CLAUDE.md` for generated-file rules.

## Builders (CI-wired, safe to re-run)

CI runs these with `--check` and fails if committed output is stale. Run them (without `--check`) after editing their source content.

| Script | Purpose |
|---|---|
| `build-threat-actors.mjs` | Threat-actor dossier HTML from `threat-actors/content/*.json`. |
| `build-osint.mjs` | OSINT toolkit page (`osint/index.html`) and its Ctrl+K palette entries (`osint/index.json`) from `osint/tools.json`. Validates categories, URLs, access levels and lookup templates. |
| `update-profiles.mjs` | TryHackMe and Hack The Box profile cards in the Writeups hero, from `data/profiles.json`. `--fetch` refreshes the JSON from the public profiles (run daily by `.github/workflows/profiles.yml`); `--check` in CI. |
| `build-talks.mjs` | Talk pages (`talks/<slug>/index.html`) from `talks/content/<slug>.json` and the slide data. Validates that every slide image and the PDF exist. |
| `build-content-index.mjs` | Writeups index, `feed.xml`, `sitemap.xml`. Pulls the writeups themselves from the `CTF-Writeups` repo. Also runs on a 6-hour cron (`content-index.yml`). |
| `sync-public-shell.mjs` | Restamps the shared header/footer across the hand-written public pages. |

## Verifiers (CI-wired, read-only)

| Script | Purpose |
|---|---|
| `check-page-weight.mjs` | Advisory static-payload budgets for key routes (non-blocking CI job). |

## Shared libraries (`lib/`)

`site-shell.mjs` — nav/footer/brand mark markup, imported by the builders. Not run directly.

## Release tooling

| Script | Purpose |
|---|---|
| `cache-bust.ps1` | Stamps `?v=<git short SHA>` tokens across HTML. **Release-only** — running it mid-change corrupts hand-authored non-SHA tokens. See `CLAUDE.md`. |

## One-off asset generators (Python/Pillow, run manually, output committed)

| Script | Output |
|---|---|
| `build-og-card.py` | Social preview OG card (`src/social-preview.png`). |
| `build-heatmap-photos.py` | Operation Heatmap photo pack (`activity/footprint/photos/*.jpg` + zip). Keeps each photo's EXIF byte-for-byte. Needs Windows fonts. |
| `build-webfonts.py` | Self-hosted subset webfonts (`src/fonts/`, referenced from `styles.css`). |
| `build-observer-wordmark-font.py` | Observer wordmark font (referenced from `observer/observer.css`). |
| `fetch-writeup-meta.py` | Room/machine details for writeup info cards (`writeups/meta/`), from each writeup's `url`: TryHackMe via headless Playwright, Hack The Box via its v4 API when `HTB_APP_TOKEN` is set. Refreshes after 7 days; never fatal. Run between two passes of `build-content-index.mjs` (the content-index workflow does). |
| `fetch-thm-profile.py` | Saves the public TryHackMe profile JSON via headless Playwright (its API returns 429 to plain HTTP clients); used by the profiles workflow. |
| `build-talk-slides.py` | A talk's slide images (1600/800/320px WebP), per-slide text (`slides.json`), social card and a lighter download PDF, from the exported deck: `python scripts/build-talk-slides.py deck.pdf <slug>`, then run `build-talks.mjs`. Needs PyMuPDF and Pillow. |
