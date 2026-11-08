---
tool: Gobuster
slug: gobuster
stages: [reconnaissance]
category: Web content discovery
platforms: [linux, web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [enumeration, fuzzing, directories, subdomains, vhosts]
attack: [T1595.003, T1083]
summary: Brute-forces hidden web content: directories and files, DNS subdomains, and virtual hosts. Run it against any HTTP or HTTPS service once a port scan finds one.
references:
  - Gobuster README | https://github.com/OJ/gobuster
  - SecLists wordlists | https://github.com/danielmiessler/SecLists
---

## When to reach for it

A web server is open (port 80, 443 or similar) and you need to find what is not linked from the homepage: admin panels, backup files, API paths, other virtual hosts. Point it at the service with a wordlist.

## Key flags

- `dir` / `dns` / `vhost`: the mode: directory brute force, DNS subdomains, or virtual hosts.
- `-u`: target URL (dir/vhost mode).
- `-d`: target domain (dns mode).
- `-w`: wordlist path.
- `-x php,html,txt`: file extensions to append to each word.
- `-t 50`: number of concurrent threads.
- `-k`: skip TLS certificate verification (self-signed labs).
- `-b 404,403`: blacklist these status codes (hide noise).
- `-o out.txt`: write results to a file.

## Commands

Directory and file discovery:

```bash
gobuster dir -u http://HOST \
  -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt \
  -x php,txt,html -t 50 -o gobuster-dir.txt
```

DNS subdomain discovery (needs a resolvable domain):

```bash
gobuster dns -d TARGET.com \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  -t 50
```

Virtual host discovery (same IP, different `Host:` header):

```bash
gobuster vhost -u http://TARGET.com --append-domain \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
```

## Workflow

1. From the port scan, note every HTTP/HTTPS port and the server banner.
2. Browse the site first; note the tech stack to choose extensions (`-x`).
3. Run `dir` mode with a medium wordlist.
4. If the host serves by name, run `vhost` to find other sites on the same IP.
5. Feed interesting paths (login, upload, admin) into the next tool.

## Notes

Pick the wordlist to fit the stack: a PHP app wants `-x php`, an IIS box wants `asp,aspx`. `ffuf` and `feroxbuster` cover the same ground with recursion and more filtering; keep one as a backup when results look thin.
