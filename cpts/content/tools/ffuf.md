---
tool: ffuf
slug: ffuf
stages: [pre-compromise]
targets: [windows, linux]
category: Web fuzzing
platforms: [linux, web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [fuzzing, enumeration, directories, parameters, vhosts, subdomains, extensions]
attack: [T1595.003, T1190]
summary: A fast web fuzzer that puts the FUZZ keyword anywhere in a request: paths, file extensions, parameters, POST bodies and the Host header for vhosts. The flexible companion to Gobuster when you need recursion, filtering, or to fuzz something other than a path.
references:
  - ffuf GitHub | https://github.com/ffuf/ffuf
  - ffuf wiki | https://github.com/ffuf/ffuf/wiki
  - SecLists | https://github.com/danielmiessler/SecLists
---

## When to reach for it

A site gives you nothing to follow — no links, no sitemap — so you brute-force what exists against a wordlist. ffuf shines where you need more than a directory list: fuzzing a file extension, a GET/POST parameter, a parameter value, a subdomain, or a virtual host, and recursing into what it finds. Put `FUZZ` wherever the wordlist should be substituted, assign it with `-w list:FUZZ` when you fuzz two places at once.

## Key flags

- `-u`: URL, with `FUZZ` as the injection point (e.g. `/FUZZ`, `/indexFUZZ`, `?id=FUZZ`).
- `-w list.txt[:KEYWORD]`: wordlist; name it for multi-position fuzzing (`FUZZ_1.FUZZ_2`).
- `-ic`: ignore the copyright/comment lines at the top of SecLists wordlists.
- `-e .php,.html`: append extensions to each word (pairs well with `-recursion`).
- `-recursion -recursion-depth 1`: queue a new scan under each directory found, capped at a depth.
- `-H "Header: value"`: add a header — use `FUZZ` here for vhosts (`Host: FUZZ.target`).
- `-X POST -d "FUZZ=key"`: method and body data.
- `-mc` / `-ms` / `-mw` / `-ml` / `-mr`: match by status, size, words, lines, regex.
- `-fc` / `-fs` / `-fw` / `-fl` / `-fr`: filter those out (hide a uniform catch-all page).
- `-ac`: auto-calibrate filters from a baseline request.
- `-t 40`: threads (default 40); `-v` prints full URLs; `-c` colours output; `-o` writes results.

## Commands

Directory discovery, skipping wordlist comments:

```bash
ffuf -ic -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-small.txt:FUZZ -u http://HOST/FUZZ
```

Identify the page extension, then fuzz for pages of that type under a directory:

```bash
ffuf -w /usr/share/seclists/Discovery/Web-Content/web-extensions.txt:FUZZ -u http://HOST/blog/indexFUZZ
ffuf -ic -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-small.txt:FUZZ -u http://HOST/blog/FUZZ.php
```

Recurse directories and append `.php` in one pass (verbose, so you see which file is where):

```bash
ffuf -ic -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-small.txt:FUZZ -u http://HOST/FUZZ -recursion -recursion-depth 1 -e .php -v
```

Subdomains (public DNS only) vs virtual hosts on an IP you already have (filter the default size):

```bash
ffuf -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt:FUZZ -u https://FUZZ.target.com/
ffuf -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt:FUZZ -u http://target.htb/ -H "Host: FUZZ.target.htb" -fs 900
```

Fuzz a parameter name (GET then POST), then brute a value with a custom list:

```bash
ffuf -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt:FUZZ -u "http://HOST/admin.php?FUZZ=key" -fs 123
ffuf -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt:FUZZ -u http://HOST/admin.php -X POST -d "FUZZ=key" -H "Content-Type: application/x-www-form-urlencoded" -fs 123
for i in $(seq 1 1000); do echo $i; done > ids.txt
ffuf -w ids.txt:FUZZ -u http://HOST/admin.php -X POST -d "id=FUZZ" -H "Content-Type: application/x-www-form-urlencoded" -fs 123
```

## Workflow

1. Fuzz directories against `directory-list-2.3` (with `-ic`); note the size of a known-missing page as your baseline.
2. Find the extension (`indexFUZZ` + `web-extensions.txt`), then fuzz pages as `FUZZ.<ext>`; add `-recursion -e .<ext>` to cover subdirectories in one pass.
3. If a page hints at another host (a redirect, an "admin moved to…" message), fuzz subdomains, then vhosts on the same IP with `-H "Host: FUZZ.target" -fs <baseline>` for the non-public ones.
4. On a page that needs a key or id, fuzz the parameter name (`burp-parameter-names.txt`, GET and POST), then fuzz its value with a tailored list.
5. Feed found parameters into the exploitation stage (SQLi, IDOR, LFI) — unpublished parameters are often the least tested.

## Notes

Default matching keeps `200,204,301,302,307,401,403` and drops `404`, so when a catch-all returns `200` for everything, filter on size/words (`-fs`/`-fw`) or use `-ac` to learn the baseline automatically. Subdomain fuzzing resolves against public DNS, so it only finds subdomains with a public record; vhost fuzzing (the `Host:` header against a known IP) also surfaces internal ones — add the confirmed vhost to your hosts file to browse it. PHP typically needs `Content-Type: application/x-www-form-urlencoded` on POST data. SecLists lives at `/usr/share/seclists` (or `/opt/useful/seclists`); wordlist choice matters more than the tool, so match it to the stack. Threads default to 40 — raising them (`-t 200`) can tip a fragile target into a denial of service, so drop them, don't push them, when the target wobbles.
