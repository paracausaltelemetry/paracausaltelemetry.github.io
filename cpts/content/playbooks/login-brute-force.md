---
title: Brute-force a web login
slug: login-brute-force
area: web
module: 16
order: 2
goal: Recover valid credentials for a web login form or HTTP auth when you have no other way in.
summary: How to brute-force a web login — spot the request in a proxy, then attack it with ffuf or hydra, handling POST forms, CSRF tokens and user enumeration via response differences.
prereqs: [A login form or HTTP basic/digest auth, A username (or a user list) and a password wordlist, A proxy to capture the exact request]
seeAlso: [tool:hydra, tool:ffuf, tool:web-proxies, howto:web-recon-and-fuzzing, map:password-cracking]
references:
  - HackTricks: brute force | https://book.hacktricks.wiki/en/generic-methodologies-and-resources/brute-force.html
  - SecLists (passwords) | https://github.com/danielmiessler/SecLists
---

Brute-forcing a web login is about replaying the exact request with many passwords and telling success from failure by the response. Capture the real request in a proxy first — guessing the parameters wastes hours.

## Capture the request

In Burp/caido, submit one login and read the request: method, path, body parameters, and any CSRF/nonce token. Note the failure message (e.g. "Invalid password").

## POST form with ffuf

Match on what failure looks like — filter it out so only a success shows.

```bash
ffuf -w passwords.txt -X POST -d 'username=admin&password=FUZZ' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u http://TARGET/login -fr 'Invalid password'          # -fr: hide the failure regex
```

## POST form with hydra

```bash
hydra -l admin -P passwords.txt TARGET http-post-form \
  '/login:username=^USER^&password=^PASS^:Invalid password'
```

## HTTP basic auth

```bash
hydra -L users.txt -P passwords.txt TARGET http-get /admin
ffuf -w creds.txt -u http://TARGET/admin -H 'Authorization: Basic FUZZ'
```

## User enumeration first

If "user not found" differs from "wrong password", enumerate valid users, then spray.

```bash
ffuf -w users.txt -X POST -d 'username=FUZZ&password=x' -u http://TARGET/login -fr 'user not found'
```

## If it fails

- **Everything looks like success/failure the same**: your matcher is wrong — filter on size/words (`-fs`/`-fw`) or a different string, taken from a real failed response.
- **CSRF token rejected**: the token is per-request — you need a tool that grabs a fresh token each time (Burp Intruder with a recursive grep, or a short script); raw hydra/ffuf won't.
- **Locked out / rate-limited**: switch to spraying (one password across many users), slow the rate, or this path is a dead end.
- **Redirect on success**: match on the 302/`Location` header instead of body text.

## Verify

Log in with the found credential in the browser. Then see what it unlocks — an admin panel, an upload, a different injection surface.
