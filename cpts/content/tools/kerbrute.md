---
tool: Kerbrute
slug: kerbrute
stages: [reconnaissance]
category: Kerberos user enumeration and spraying
platforms: [linux, network]
services: [kerberos]
ports: [88]
tags: [active-directory, kerberos, user-enumeration, password-spray, pre-auth]
attack: [T1087.002, T1110.003]
summary: Validates Active Directory usernames fast and quietly against the KDC (a bad username draws no logon failure), then sprays one password across the accounts that exist. The first move when you have a domain and a user list but no credentials yet.
references:
  - Kerbrute README | https://github.com/ropnop/kerbrute
---

## When to reach for it

You can reach a domain controller on port 88 and have a list of candidate usernames (from OSINT, a naming scheme, or SMB enumeration) but no valid login. Kerbrute asks the KDC whether each name exists without logging a failed logon, so it is a quiet way to turn a guessed list into real accounts, then spray a likely password at them.

## Key flags

- `userenum`: check which usernames exist.
- `passwordspray`: try one password against a list of users.
- `bruteuser`: try a password list against a single user.
- `-d DOMAIN`: the target domain.
- `--dc DC_IP`: the domain controller to ask (otherwise resolved from DNS).
- `-o out.txt`: write results to a file.
- `--safe`: stop a user's spray if it looks close to lockout.

## Commands

Enumerate valid usernames from a candidate list:

```bash
kerbrute userenum -d DOMAIN --dc TARGET users.txt
```

Spray one password across the accounts that exist (check the lockout policy first):

```bash
kerbrute passwordspray -d DOMAIN --dc TARGET valid-users.txt 'Autumn2024!'
```

Try a password list against one known user:

```bash
kerbrute bruteuser -d DOMAIN --dc TARGET passwords.txt jsmith
```

## Workflow

1. Build a username list from the naming scheme and any names from recon.
2. Run `userenum` to keep only the accounts that exist.
3. Read the domain lockout policy (bad guesses count): threshold and reset window.
4. `passwordspray` one safe guess (season, company name, `Welcome1`) across the valid users, then wait out the window before the next.
5. Feed a hit into the next step: a shell, SMB access, or AS-REP/Kerberoast cracking.

## Notes

Spraying is one password across many users, never many passwords against one, or you lock accounts out and tip off the defenders. Always read the lockout policy before you spray and leave a margin (`--safe` helps). User enumeration here is low-noise, but spraying is not. Validated usernames are also the input for AS-REP roasting. Stay inside scope and record every account you touch.
