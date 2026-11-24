---
tool: WPScan
slug: wpscan
stages: [pre-compromise]
targets: [windows, linux]
category: WordPress enumeration and attack
platforms: [linux, web]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [web, wordpress, cms, plugins, themes, users, brute force]
attack: [T1595.002, T1190, T1110.001]
summary: The dedicated WordPress scanner. It fingerprints the core version, enumerates plugins, themes and users, flags known vulnerabilities, and brute-forces logins against the xmlrpc or wp-login endpoint. WordPress is everywhere on internal web ports, and a vulnerable plugin is a common route to code execution.
references:
  - WPScan on GitHub | https://github.com/wpscanteam/wpscan
  - WPScan API (token) | https://wpscan.com/api
---

## When to reach for it

Content discovery or Nikto says the app is WordPress (a `/wp-login.php`, `/wp-content/` or `wp-json` path). WPScan maps the install — version, plugins, themes and users — and tells you which of them have known bugs, then helps you brute-force a login.

## Key flags

- `--url http://HOST`: the WordPress site.
- `-e ap,at,u`: enumerate all plugins, all themes and users.
- `--plugins-detection aggressive`: probe plugin paths directly (slower, thorough).
- `--api-token <token>`: a free WPScan token, needed for the vulnerability data.
- `-U users.txt -P passwords.txt`: wordlists for a login brute force.
- `--password-attack wp-login|xmlrpc`: which endpoint to hammer.
- `--random-user-agent`: rotate the UA to look less like a scanner.

## Commands

Enumerate plugins, themes and users with vulnerability data:

```bash
wpscan --url http://HOST -e ap,at,u \
  --plugins-detection aggressive --api-token <TOKEN>
```

Brute-force a discovered user over xmlrpc (fast, multicall):

```bash
wpscan --url http://HOST --password-attack xmlrpc \
  -U admin -P /usr/share/wordlists/rockyou.txt
```

## Workflow

1. Confirm the app is WordPress, then run `-e ap,at,u` with an API token.
2. Note the core and plugin versions; match the flagged CVEs to a public exploit.
3. Collect valid usernames from the `u` enumeration.
4. If no plugin RCE lands, brute-force a login against xmlrpc with a sensible list.
5. As admin, get code execution via the theme/plugin editor (see Attacking common applications).

## Notes

Without `--api-token` WPScan still enumerates but shows no vulnerability information, which is most of its value — register for the free token. xmlrpc brute forcing is far faster than wp-login because of `system.multicall`, but a hardened site disables xmlrpc. A stale plugin is usually the shortest path: once you have an admin session, the built-in editor runs PHP.
