---
tool: feroxbuster
slug: feroxbuster
stages: [reconnaissance]
category: Recursive web content discovery
platforms: [linux, web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [enumeration, fuzzing, directories, recursion, content-discovery]
attack: [T1595.003, T1083]
summary: A fast, recursive directory and file brute-forcer. It walks into every directory it finds and keeps scanning, so a single run maps a whole site. Reach for it when a web port is open and gobuster or ffuf is leaving depth unexplored.
references:
  - feroxbuster README | https://github.com/epi052/feroxbuster
  - feroxbuster documentation | https://epi052.github.io/feroxbuster-docs/
  - SecLists wordlists | https://github.com/danielmiessler/SecLists
---

## When to reach for it

A web server is open and you want the full tree, not just the top level. feroxbuster recurses automatically: every directory it discovers becomes a new scan, so nested paths (`/admin/backup/`, `/api/v2/`) surface without a second run. It is the recursive counterpart to gobuster and ffuf.

## Key flags

- `-u`: target URL.
- `-w`: wordlist path.
- `-x php,txt,html`: file extensions to try on each word.
- `-d 2`: maximum recursion depth (default 4; `-d 0` for unlimited).
- `-t 50`: concurrent threads.
- `-r`: follow redirects.
- `-k`: skip TLS certificate verification (self-signed labs).
- `-C 404,403`: filter out these status codes; `-S`, `-W`, `-N` filter by size, words, lines.
- `-s 200,301`: show only these status codes.
- `-o ferox.txt`: write results to a file; `--resume-from` continues a saved state.

## Commands

Recursive discovery with extensions:

```bash
feroxbuster -u http://HOST \
  -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt \
  -x php,txt,html -d 3 -t 50 -o ferox-TARGET.txt
```

Filter out the noise a catch-all app returns (e.g. a 200 of a fixed size):

```bash
feroxbuster -u http://HOST -w wordlist.txt -S 1234 -C 404,403
```

Scan an HTTPS host with a self-signed certificate and follow redirects:

```bash
feroxbuster -u https://HOST -k -r -w wordlist.txt
```

## Workflow

1. From the port scan, note each HTTP/HTTPS port and browse the site to learn the stack.
2. Choose extensions to match the stack (`-x php` for PHP, `asp,aspx` for IIS).
3. Run with recursion; watch for directories worth a deeper, targeted pass.
4. If a soft-404 or catch-all page floods results, filter by size or word count (`-S`/`-W`).
5. Feed login, upload and admin paths into the next tool.

## Notes

Recursion is the strength and the risk: on a large site an unbounded depth can run for a long time and generate a lot of traffic, so cap `-d` and filter early. Save state with `-o` so a long scan can resume. feroxbuster, ffuf and gobuster overlap; keep more than one to hand, since a path one misses another often finds.
