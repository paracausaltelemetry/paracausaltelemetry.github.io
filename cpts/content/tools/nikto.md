---
tool: Nikto
slug: nikto
stages: [pre-compromise]
targets: [windows, linux]
category: Web server vulnerability scan
platforms: [linux, web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [web, enumeration, vulnerabilities, misconfigurations, cgi]
attack: [T1595.002, T1190]
summary: A fast, noisy web server scanner. It checks for dangerous files, outdated software, misconfigurations, default pages and known CGI flaws, and prints the server banner and anything interesting it stumbles on. A good first sweep of a web port before you go hunting by hand.
references:
  - Nikto README | https://github.com/sullo/nikto
  - Nikto wiki | https://github.com/sullo/nikto/wiki
---

## When to reach for it

A web server is open and you want a quick, broad pass for low-hanging fruit — server version, risky default files, leftover admin scripts, known CGI issues — before and alongside content discovery. It is loud, so run it on an authorised target, not stealthily.

## Key flags

- `-h http://HOST`: the target host or URL.
- `-p 8080`: port, if not inferred from the URL.
- `-ssl`: force HTTPS.
- `-Tuning`: limit the check categories (e.g. `-Tuning 1,2,3` for files, misconfig, info).
- `-Display V`: verbose output while it runs.
- `-o out.txt -Format txt`: save the report.
- `-useproxy http://127.0.0.1:8080`: route through Burp to see the requests.

## Commands

Straight scan of an HTTP service:

```bash
nikto -h http://HOST -o nikto-HOST.txt
```

HTTPS on a non-standard port:

```bash
nikto -h HOST -p 8443 -ssl
```

Scoped to files and misconfigurations only (quieter, faster):

```bash
nikto -h http://HOST -Tuning 1,2,3,4
```

## Workflow

1. Run Nikto early on every web port the scan found.
2. Note the server and framework versions it reports; match them to `searchsploit`.
3. Chase any default or backup file it flags (admin consoles, `.git`, test scripts).
4. Follow up with `gobuster`/`feroxbuster` for thorough content discovery.
5. Pivot to the stack-specific tool (`wpscan`, `common-apps`) when it names the app.

## Notes

Nikto's findings are a starting point, not proof — it fingerprints by banner and path, so confirm before you report. It makes thousands of requests and trips every WAF and IDS; keep it to in-scope testing. Pair the version it reports with `searchsploit` to turn an "outdated software" line into an actual exploit.
