---
title: Recon and fuzz a web app
slug: web-recon-and-fuzzing
area: web
module: 15
order: 1
goal: Map a web target's hidden surface — subdomains, virtual hosts, directories, files and parameters — before attacking it.
summary: How to enumerate a web app — fingerprint it, brute-force vhosts and subdomains, fuzz directories/files/extensions and discover parameters with ffuf, gobuster and feroxbuster.
prereqs: [A web port open (80/443/8080…), A wordlist (SecLists), The target's hostname — add it to /etc/hosts for vhost fuzzing]
seeAlso: [tool:ffuf, tool:gobuster, tool:feroxbuster, tool:web-recon, tool:web-proxies, howto:login-brute-force, map:start]
references:
  - HackTricks: web pentesting methodology | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-web/index.html
  - SecLists | https://github.com/danielmiessler/SecLists
---

You can't attack what you can't see. Most web targets hide the interesting bits behind unlinked paths, virtual hosts and parameters. Fingerprint first, then fuzz each layer.

## Fingerprint the target

```bash
whatweb http://TARGET
curl -sI http://TARGET                       # headers: server, framework, redirects
nmap -sV -p80,443 --script http-enum TARGET
```

## Virtual hosts and subdomains

Different sites can live on one IP (vhosts) — fuzz the Host header. Add the base domain to `/etc/hosts` first.

```bash
ffuf -w subdomains.txt -u http://TARGET -H "Host: FUZZ.target.local" -fs 0
gobuster vhost -u http://target.local -w subdomains.txt --append-domain
gobuster dns -d target.local -w subdomains.txt      # public DNS subdomains
```

## Directories, files and extensions

```bash
feroxbuster -u http://TARGET -w raft-medium-directories.txt -x php,txt,bak
ffuf -w raft-medium-files.txt -u http://TARGET/FUZZ -e .php,.bak,.old,.zip
gobuster dir -u http://TARGET -w common.txt -x php,html
```

## Parameters and values

```bash
ffuf -w burp-parameter-names.txt -u 'http://TARGET/page.php?FUZZ=test' -fs 0   # find params
ffuf -w values.txt -u 'http://TARGET/page.php?id=FUZZ' -fc 404                 # fuzz values
```

## If it fails

- **Everything returns 200/the same size**: the app serves a soft-404 — filter it with `-fs <size>`, `-fc <code>` or `-fw <words>` on the baseline response.
- **vhost fuzzing finds nothing**: confirm the base domain resolves (or is in `/etc/hosts`), and that the server actually does name-based hosting.
- **Rate-limited / blocked**: slow down with `-rate`/`-t`, or you've hit a WAF — vary the User-Agent.
- **HTTPS errors**: add `-k` (ffuf) / `--insecure` to ignore the cert.

## Verify

A hit is a path/vhost/param that returns a distinct status or size from the baseline. Open it in a proxy (Burp/caido) and move on to the matching attack — a login (brute force), a parameter (injection), an upload form.
