# Writeup markdown format

Writeups live in the **CTF-Writeups** repo and are rendered by this site's
`js/markdown.js`. This is the flavour of Markdown the renderer understands — stick
to it so the reader (and the Box Info panel) render correctly.

## Repo layout

Every top-level folder in the repo becomes a platform section on the site
automatically — **CTF**, **HTB**, **THM** today, but a new folder (`VULNHUB/`,
`PORTSWIGGER/`, whatever) needs no site change: it's picked up on the next
index rebuild, gets a titleized label (`portswigger` → "Portswigger") and a
generic platform mark unless you also add a polished label/logo in
`scripts/build-content-index.mjs`'s `KNOWN_LABELS` and `js/writeups.js`'s
`PLATFORM_LOGOS`/`PLATFORM_LOGO_SRC` (optional — purely cosmetic).
Dot- and underscore-prefixed folders (`.github/`, `_drafts/`) are ignored.
Folders named `hidden` are also ignored, which is useful for active writeups
that should not publish yet.

Inside a folder, any `*.md` file not starting with `.` or `_` is picked up.

## Front-matter

Optional but recommended. A `---` fenced block at the very top. Everything here
feeds the sidebar, sorting, and reading-time estimate:

```
---
title: Confidential
summary: One or two sentences shown in the tree and the RSS feed.
date: 2026-06-30            # ISO YYYY-MM-DD; drives sort order + "Published"
tags: [Forensics, PDF, QR]  # list, or a comma-separated string
difficulty: easy            # easy | medium | hard  -> difficulty chip
os: Linux                   # optional, shown in Box Info
url: https://tryhackme.com/room/... # or `room:` / `link:` -> "Open on ..." button
---
```

Missing `title`/`summary` fall back to the first `#` heading and first paragraph.

## Spoilers (hide flags, passwords, hashes)

Wrap anything sensitive in `||...||`. It renders as a monochrome click-to-reveal
box and works **everywhere**, including inside code fences and tables:

```
The user flag is ||THM{example_flag_here}||.
```

As a safety net, unmarked braced flags (`THM{...}`, `HTB{...}`, `CTF{...}`,
`picoCTF{...}`, and generic `WORD{...}`) are auto-redacted too, and 32-char hex
hashes are redacted when they sit near the word "flag". Prefer explicit `||...||`
— it's unambiguous and covers bare passwords/hashes the auto-detector can't guess.
Inside a GFM table cell, escape a literal double pipe as `\|\|`.

## Blocks

- **Headings** `#`–`####` (deeper levels clamp to `####`). `##` gets a divider rule.
- **Code fences** ` ```lang ` — always tag a language for highlighting + the
  language pill. Supported: `bash`/`sh`, `powershell`, `python`, `javascript`,
  `sql`, `php`, `json`, `yaml`, `http`, `spl`, `kql`, `asm` (see `js/highlight.js`
  for the full alias list).
- **Callouts** — a blockquote whose first line is `**Note:**`, `**Tip:**`, or
  `**Warning:**`:

  ```
  > **Warning:** Don't run this against a box you don't own.
  ```

- **Tables** — standard GFM with `:--`, `:--:`, `--:` alignment.
- **Lists** — ordered, unordered, nested (by indent), and task lists (`- [x]`).
- **Images / links** — relative paths resolve against the writeup's repo folder;
  bare `http(s)://` URLs auto-link.

## Inline

`**bold**`, `*italic*`, `~~strike~~`, `` `inline code` ``, `[text](url)`.

## Keeping the site in sync (one-time setup, already done)

The website repo's `.github/workflows/content-index.yml` rebuilds
`writeups/index.json`, `feed.xml`, and `sitemap.xml` from this repo's contents.
It runs on a 6h cron (safety net) and instantly whenever this repo dispatches a
`writeups-updated` event. That means: **push a writeup here, and it shows up on
the site within about a minute** — no further steps, nothing to touch on the
website side.

The dispatch is a small workflow in *this* repo
(`.github/workflows/notify-site.yml`), roughly:

```yaml
name: Notify site of writeup changes
on:
  push:
    branches: [main]
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.SITE_DISPATCH_TOKEN }}
          repository: paracausaltelemetry/paracausaltelemetry.github.io
          event-type: writeups-updated
```

`SITE_DISPATCH_TOKEN` is a fine-grained PAT scoped to the website repo
(Contents: read and write), stored as a secret in *this* repo. Only needs
touching again if the token is rotated or the website repo is renamed.
