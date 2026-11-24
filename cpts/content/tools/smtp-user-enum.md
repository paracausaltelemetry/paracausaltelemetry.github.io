---
tool: smtp-user-enum
slug: smtp-user-enum
stages: [pre-compromise]
targets: [windows, linux]
category: Validating usernames over SMTP
platforms: [linux, network]
services: [smtp]
ports: [25, 587]
tags: [enumeration, smtp, mail, users, footprinting]
attack: [T1087, T1589.002]
summary: Asks a mail server whether a username exists using the SMTP verbs VRFY, EXPN and RCPT TO. A server that answers differently for valid and invalid users hands you a verified account list to spray or feed into other services — a quiet win from an open port 25.
references:
  - smtp-user-enum | https://github.com/pentestmonkey/smtp-user-enum
  - RFC 5321 (SMTP) | https://www.rfc-editor.org/rfc/rfc5321
---

## When to reach for it

Port 25 (or 587) is open and you need valid usernames — for spraying, for matching to other services, or just to confirm a naming convention. smtp-user-enum automates the VRFY/EXPN/RCPT probes that leak which accounts the server knows.

## Key flags

- `-M VRFY|EXPN|RCPT`: the method to use (try VRFY first, then RCPT).
- `-U users.txt`: the username wordlist.
- `-u user`: test a single username.
- `-t HOST`: the target mail server.
- `-D domain.com`: append this domain to each name (RCPT mode often needs it).
- `-p 25`: port, if not the default.

## Commands

VRFY-based enumeration against a user list:

```bash
smtp-user-enum -M VRFY -U /usr/share/seclists/Usernames/Names/names.txt -t HOST
```

RCPT TO with a domain (when VRFY is disabled):

```bash
smtp-user-enum -M RCPT -U users.txt -D DOMAIN -t HOST
```

Manual check with netcat (confirm the behaviour by hand):

```bash
nc -nv HOST 25
VRFY root
VRFY nonexistentuser
```

## Workflow

1. Banner-grab port 25 to see the mail software and whether it is worth probing.
2. Try `-M VRFY`; if the server rejects VRFY, fall back to `-M RCPT` with `-D`.
3. Collect the usernames that come back "valid" and note the naming convention.
4. Feed the list into password spraying (Hydra, NetExec) and Kerbrute.
5. Cross-reference the names against any other service for reuse.

## Notes

Many hardened servers disable VRFY/EXPN and return the same response for every address, which defeats this — RCPT TO sometimes still leaks via timing or error codes. It is fast and low-risk but does generate mail-server logs. The names it confirms are most useful as spray fodder and for guessing AD `sAMAccountName`s when the email convention matches the domain one.
