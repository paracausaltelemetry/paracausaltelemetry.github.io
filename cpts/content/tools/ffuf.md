---
tool: ffuf
slug: ffuf
stages: [reconnaissance]
category: Web fuzzing
platforms: [linux, web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [fuzzing, enumeration, directories, parameters, vhosts, subdomains]
attack: [T1595.003, T1190]
summary: A fast web fuzzer that puts the FUZZ keyword anywhere in a request: paths, parameters, headers, POST bodies and Host for vhosts. The flexible companion to Gobuster when you need recursion, filtering or to fuzz something other than a path.
references:
  - ffuf GitHub | https://github.com/ffuf/ffuf
  - ffuf wiki | https://github.com/ffuf/ffuf/wiki
---

## When to reach for it

Content discovery where you need more than a directory list: fuzzing a GET/POST parameter, a subdomain, a virtual host, or recursing into found directories. Put `FUZZ` where the wordlist should go.

## Key flags

- `-u` — URL, with `FUZZ` as the injection point.
- `-w list.txt` — wordlist (add `:KEYWORD` to name it for multi-fuzz).
- `-H "Header: value"` — add a header (use `FUZZ` here for vhosts).
- `-X POST -d "x=FUZZ"` — method and body data.
- `-recursion -recursion-depth 2` — recurse into discovered directories.
- `-mc 200,301` — match these status codes; `-fc 404` filters them out.
- `-fs 1234` / `-fw` / `-fl` — filter by response size, word or line count (hide a uniform "not found" page).
- `-ac` — auto-calibrate filters from the baseline response.

## Commands

Directory discovery, filtering the 404 size automatically:

```bash
ffuf -u http://TARGET/FUZZ -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -ac
```

Virtual host discovery (filter out the default response size):

```bash
ffuf -u http://TARGET -H "Host: FUZZ.target.com" \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -fs 1234
```

Fuzz a GET parameter value, then a parameter name:

```bash
ffuf -u "http://TARGET/item?id=FUZZ" -w ids.txt -mc 200 -fc 404
ffuf -u "http://TARGET/page?FUZZ=test" -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt -fs 1234
```

## Workflow

1. Get a baseline: browse the app, note the size of a known-missing page.
2. Fuzz directories with `-ac` so the baseline is filtered for you.
3. Recurse into anything interesting (`-recursion`).
4. Move from paths to parameters once you find a dynamic endpoint.
5. Feed found parameters into the exploitation stage (injection, IDOR, LFI).

## Notes

If every line comes back 200 with the same size, the app has a catch-all — filter on size/words (`-fs`/`-fw`) or use `-ac`. Threads default high; drop with `-t` against fragile targets. Wordlist choice matters more than the tool: match it to the stack.
