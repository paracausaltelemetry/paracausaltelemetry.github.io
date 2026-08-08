# Scripts

Inventory of every script in this directory: what it does, how it runs, and whether it is safe to re-run. See also the repo-root `CLAUDE.md` for generated-file rules.

## Builders (CI-wired, safe to re-run)

CI runs these with `--check` and fails if committed output is stale. Run them (without `--check`) after editing their source content.

| Script | Purpose |
|---|---|
| `build-threat-actors.mjs` | Threat-actor dossier HTML from `threat-actors/content/*.json`. |
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
| `build-webfonts.py` | Self-hosted subset webfonts (`src/fonts/`, referenced from `styles.css`). |
| `build-observer-wordmark-font.py` | Observer wordmark font (referenced from `observer/observer.css`). |
