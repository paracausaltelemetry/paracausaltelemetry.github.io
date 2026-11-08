---
tool: Web recon and fingerprinting
slug: web-recon
kind: technique
stages: [reconnaissance]
category: Identify the stack before you attack it
platforms: [web, linux]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [web, fingerprinting, whatweb, nikto, nuclei, wafw00f]
attack: [T1595.002, T1592.002]
summary: Before fuzzing or exploiting a web app, learn what it is: server, framework, CMS, versions and any WAF in the way. whatweb and the response headers name the stack, nikto flags the obvious misconfigurations, and nuclei matches it against a library of known issues.
references:
  - The Hacker Recipes: web recon | https://www.thehacker.recipes/web/recon/
  - Nuclei templates | https://github.com/projectdiscovery/nuclei-templates
---

## When to reach for it

Right after a port scan finds a web port, before directory brute-forcing. Fingerprinting steers everything after it: a named CMS sends you to `common-apps`, a framework version sends you to `searchsploit`, a detected WAF changes how you fuzz.

## Fingerprint the stack

```bash
whatweb -a 3 http://TARGET
curl -sI http://TARGET            # Server, X-Powered-By, Set-Cookie
wafw00f http://TARGET
```

`whatweb` names the server, CMS, frameworks and analytics; the headers and cookie names (`PHPSESSID`, `JSESSIONID`, `laravel_session`) confirm the language. `wafw00f` tells you whether a WAF will eat your payloads.

## Scan for known issues

```bash
nikto -h http://TARGET
nuclei -u http://TARGET -severity medium,high,critical
```

`nikto` catches dangerous files, default pages, outdated servers and risky HTTP methods. `nuclei` matches the target against thousands of community templates for CVEs, exposures and misconfigurations, kept to the severities worth acting on.

## Also check by hand

`robots.txt`, `sitemap.xml`, the favicon hash, HTML comments and JS source for endpoints and keys, and `/.git/` or `/.env` exposure. A visible version number plus `searchsploit` is often the whole exploit path.

## Notes

These scanners send many automated requests and can trip WAFs, rate limits or fragile apps, so keep them inside the agreed scope and window and throttle where a target looks delicate. Record the identified stack and versions, they anchor the rest of the findings. In-scope and authorised use only.
