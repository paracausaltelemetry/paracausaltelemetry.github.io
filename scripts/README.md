# Scripts

Inventory of every script in this directory: what it does, how it runs, and whether it is safe to re-run. See also the repo-root `CLAUDE.md` for generated-file rules.

## Builders (CI-wired, safe to re-run)

CI runs these with `--check` and fails if committed output is stale. Run them (without `--check`) after editing their source content.

| Script | Purpose |
|---|---|
| `build-threat-actors.mjs` | Threat-actor dossier HTML from `threat-actors/content/*.json`. |
| `build-osint.mjs` | OSINT toolkit page (`osint/index.html`) and its Ctrl+K palette entries (`osint/index.json`) from `osint/tools.json`. Validates categories, URLs, access levels and lookup templates. |
| `update-profiles.mjs` | TryHackMe and Hack The Box profile cards in the Writeups hero, from `data/profiles.json`. `--fetch` refreshes the JSON from the public profiles (run daily by `.github/workflows/profiles.yml`); `--check` in CI. |
| `build-field-guides.mjs` | Field guides hub (`field-guides/index.html`), one page per guide, the Ctrl+K entries (`field-guides/index.json`, one per guide and per section) and the homepage cards between the `field-guides:` markers, from `field-guides/content/guides.json` and `<slug>.md`. Checks that in-page links match a heading. Visual blocks (`sequence`, `flow`, `layers` architecture maps, `bars` charts, `decide` decision flows, `figure` official vendor diagrams from `field-guides/media/` (credited, licences in that folder's README), `anatomy` and `terms` fences, drawn by `lib/guide-visuals.mjs`, with an icon set for diagram boxes, plus official vendor architecture icons from `field-guides/icons/` as `{aws/lambda}`; sources and terms in that folder's README). Per-guide `icons` and `references` in `guides.json` drive the card and header icon strips and the Official references panel and per-guide provider themes (`theme` in `guides.json`, colours in `field-guides/field-guides.css`). |
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
| `build-og-card.py` | Social preview OG card (`src/social-preview.png`) and the section cards in `src/og/`. |
| `build-share-cards.py` | Per-page share cards: `og.png` beside each writeup and threat-actor page (`--writeups` / `--threat-actors`). The content-index workflow runs it for writeups; builders point `og:image` at the card when it exists. |
| `build-heatmap-photos.py` | Operation Heatmap photo pack (`activity/footprint/photos/*.jpg` + zip). Keeps each photo's EXIF byte-for-byte. Needs Windows fonts. |
| `build-webfonts.py` | Self-hosted subset webfonts (`src/fonts/`, referenced from `styles.css`). |
| `build-observer-wordmark-font.py` | Observer wordmark font (referenced from `observer/observer.css`). |
| `fetch-writeup-meta.py` | Room/machine details for writeup info cards (`writeups/meta/`), from each writeup's `url`: Hack The Box via its v4 API (`HTB_APP_TOKEN`); TryHackMe over plain HTTP, which its bot protection usually refuses from CI, so refresh TryHackMe locally with `--browser` (an ordinary headless browser session, no masking) and commit. Refreshes after 7 days; never fatal. `--probe machine:<Name>` prints one HTB parse without saving (the *Check Hack The Box token* workflow runs it). Run between two passes of `build-content-index.mjs` (the content-index workflow does). |
| `fetch-thm-profile.py` | Saves the public TryHackMe profile JSON for the profile chips: plain HTTP, or `--browser` locally (ordinary session, no masking). Then `node scripts/update-profiles.mjs --fetch --thm-file <file>` and commit. |
| `build-talk-slides.py` | A talk's slide images (1600/800/320px WebP), per-slide text (`slides.json`), social card and a lighter download PDF, from the exported deck: `python scripts/build-talk-slides.py deck.pdf <slug>`, then run `build-talks.mjs`. Needs PyMuPDF and Pillow. |
