# CLAUDE.md

Guidance for AI assistants (and humans) working on this repo. Read this before editing anything.

## What this repo is

Static site for paracausaltelemetry.com, deployed via GitHub Pages. **Build-free by design**: no bundler, no framework, native ES modules, hand-written CSS. Do not introduce a build step, npm dependencies for the site runtime, or a framework. One-off asset generation (fonts, OG cards) is done with standalone Python/Pillow scripts, and their committed output is what ships.

Subdomains:
- `paracausaltelemetry.com` — this repo (main site)
- `alchemist.paracausaltelemetry.com` — separate repo (`alchemist-ot-sandbox`), a Vite app

Theme preference carries across subdomains via the `pt_theme` cookie scoped to `.paracausaltelemetry.com`.

## Generated files — never hand-edit these

Parts of the deployed tree are generated from source content by scripts in `scripts/`. Edit the **source content and templates**, then re-run the builder. CI runs the builders in `--check` mode and fails if committed output is stale.

| Generated output | Source | Builder |
|---|---|---|
| `threat-actors/**/index.html` | `threat-actors/content/*.json` + templates | `scripts/build-threat-actors.mjs` |
| `writeups/**/index.html`, `writeups/index.json` | the `CTF-Writeups` GitHub repo | `scripts/build-content-index.mjs` |
| `sitemap.xml`, `feed.xml` | writeups + threat actors | `scripts/build-content-index.mjs` (also runs on a 6h cron) |
| header/footer in hand-written pages | `scripts/lib/site-shell.mjs` | `scripts/sync-public-shell.mjs` |

See `scripts/README.md` for the full script inventory.

## Cache-busting (`?v=` tokens)

- Every stylesheet/module reference carries a `?v=` token. The base token (e.g. `276fa973`) is a git short SHA stamped by `scripts/cache-bust.ps1`.
- **`cache-bust.ps1` is a release-only step.** Never run it mid-change: it rewrites tokens wholesale and corrupts hand-authored non-SHA tokens (e.g. `?v=276fa973-lean`), desyncing generated HTML from builders.
- When you change a CSS/JS file during a feature branch, bump its token **by hand** — for generated pages, bump it in the builder template and regenerate.

## Content Security Policy

- The CSP is served as a real HTTP header by a Cloudflare transform rule — **not** a `<meta>` tag. The inline theme script is allowed via a `sha256-...` hash in `script-src`.
- **If you change the inline theme script in any way, you must recompute its SHA-256 hash** and update the Cloudflare rule's CSP value. A mismatch blocks theming site-wide.
- To add a CSP source (e.g. a new `connect-src` origin), edit the Cloudflare rule, not HTML. See `docs/security-headers.md` for the current hash and the HSTS/`nosniff` companions — the rule has **not** been recreated for this domain yet.

## Identity

This site publishes no personal contact details, email addresses, or public profile links (LinkedIn, GitHub, TryHackMe, Hack The Box). `scripts/build-content-index.mjs` strips profile/badge links out of upstream writeup markdown on the way in. Do not reintroduce them.

## CI (`.github/workflows/quality.yml`)

Jobs on every push/PR: html-validate, site content (`sync-public-shell --check` + Observer tests), threat-actor content staleness + tests, browser and accessibility journeys (Playwright, includes a **24px minimum tap-target rule**), sitemap staleness, link check (lychee, honours `.lycheeignore`), and two **advisory (non-blocking)** jobs — a page-weight budget (`scripts/check-page-weight.mjs`) and a Lighthouse audit of key routes.

- Interactive controls must have ≥24×24px hit areas (draw smaller visuals with pseudo-elements).
- External links that 403/429 to bots go in `.lycheeignore` — verify in a browser first; keep patterns narrow.
- If a `--check` job fails, you edited generated output or forgot to re-run a builder.

## Conventions

- UK English in site copy.
- Accessibility is CI-enforced; keep `aria-*` attributes and skip-links intact when templating.
- Tests live in `tests/`; run the relevant `tests/**/run.mjs` after content changes.
