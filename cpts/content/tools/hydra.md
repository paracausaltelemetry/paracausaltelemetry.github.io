---
tool: Hydra
slug: hydra
stages: [exploitation]
category: Credential attacks
platforms: [linux, network]
services: [ssh, ftp, http, https, rdp, smb, mysql, mssql, postgres]
ports: [21, 22, 80, 443, 445, 1433, 3306, 3389, 5432]
tags: [brute-force, password-spray, credentials, authentication]
attack: [T1110.001, T1110.003]
summary: Online password guessing against a live service: SSH, FTP, RDP, web login forms and many more. Use it for a targeted spray with a short, sensible list, not a blind dictionary run.
references:
  - THC-Hydra README | https://github.com/vanhauser-thc/thc-hydra
  - SecLists password lists | https://github.com/danielmiessler/SecLists/tree/master/Passwords
---

## When to reach for it

You have a login-bearing service and either a username, a short user list, or a likely-weak default, and want to test credentials against it. Keep lists small and targeted: online guessing is slow and locks accounts.

## Key flags

- `-l user` / `-L users.txt`: a single username, or a file of them.
- `-p pass` / `-P passwords.txt`: a single password, or a file of them.
- `-s PORT`: non-standard port.
- `-t 4`: parallel tasks (keep low to avoid lockouts and false negatives).
- `-f`: stop after the first valid pair for a host.
- `-V`: verbose: show each attempt.
- `-e nsr`: also try no password (`n`), login as password (`s`), reversed (`r`).

## Commands

SSH with a known user and a password list:

```bash
hydra -l admin -P /usr/share/seclists/Passwords/Common-Credentials/top-100.txt \
  -t 4 -f ssh://TARGET
```

A password spray: one password across many users (quieter, avoids lockouts):

```bash
hydra -L users.txt -p 'Winter2026!' -t 4 ssh://TARGET
```

HTTP POST login form (the `^USER^`/`^PASS^` markers and a failure string):

```bash
hydra -L users.txt -P passwords.txt TARGET \
  http-post-form "/login:username=^USER^&password=^PASS^:Invalid credentials"
```

## Workflow

1. Confirm the service and any lockout policy: a spray that locks every account fails the engagement goal.
2. Build a short, relevant list (defaults, season+year, company name) rather than a giant dictionary.
3. For web forms, log in once with a wrong password to capture the exact request and the failure string.
4. Run with low threads (`-t 4`) and `-f` to stop on success.
5. Record which pair worked and feed it into the next stage.

## Notes

Online brute force is loud and slow, and account lockout is a real risk: prefer a one-password spray over a per-user dictionary. If you already have hashes, move offline (a hash cracker) instead. Always keep attempts within the rules of engagement.
