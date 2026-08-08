# Paracausal Telemetry

Static site for [paracausaltelemetry.com](https://paracausaltelemetry.com) — a security engineering portfolio. Deployed via GitHub Pages.

## What's here

- **Observer** (`observer/`) — searchable evidence/artefact catalogue
- **Threat actor dossiers** (`threat-actors/`) — generated from content JSON
- **Writeups** (`writeups/`) — generated from the `CTF-Writeups` repo
- **Projects, credentials, detection rules** — portfolio content

## Subdomains

| Host | Repo |
|---|---|
| `paracausaltelemetry.com` | this repo |
| `alchemist.paracausaltelemetry.com` | `alchemist-ot-sandbox` (Vite app) |

## Local development

No build step — serve the repo root with any static server:

```bash
python -m http.server 8080
```

## Content builds

Much of the deployed HTML is generated. Edit source content, then regenerate:

```bash
node scripts/build-threat-actors.mjs
node scripts/build-content-index.mjs
```

CI fails if committed output is stale. **Never hand-edit generated files** — see [CLAUDE.md](CLAUDE.md) for the full generated-file map and repo conventions, and [scripts/README.md](scripts/README.md) for the script inventory.
