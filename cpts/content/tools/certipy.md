---
tool: Certipy
slug: certipy
stages: [actions-on-objectives]
category: AD CS enumeration and abuse
platforms: [linux]
services: [ldap, smb, http, https]
ports: [389, 636, 445, 80, 443]
tags: [adcs, certificates, esc, active-directory, privilege-escalation]
attack: [T1649, T1556.004]
summary: Finds and abuses misconfigured Active Directory Certificate Services. Enumerate the CA and its templates, spot the ESC flaws, then request a certificate as another user and turn it into their hash or a Kerberos ticket. The go-to for ADCS paths once you have any domain account.
references:
  - Certipy wiki | https://github.com/ly4k/Certipy/wiki
  - Certified Pre-Owned (SpecterOps) | https://posts.specterops.io/certified-pre-owned-d95910965cd2
---

## When to reach for it

You have one domain account and want a privilege path that does not need an existing admin. AD CS is often the shortest route: a misconfigured certificate template (the ESC1 to ESC8 family) lets a low-privileged user request a certificate that authenticates as someone else, up to Domain Admin. Certipy enumerates the CA, flags the vulnerable templates, requests the certificate and then authenticates with it.

## Key flags

- `find`: enumerate the CA, templates and their permissions; `-vulnerable` narrows to the abusable ones, `-stdout` prints instead of writing files.
- `req`: request a certificate; `-ca` the CA name, `-template` the template, `-upn` the identity to impersonate.
- `auth`: authenticate with a `.pfx` to pull the account's NT hash and a TGT.
- `-dc-ip` wants the DC's IP; `-target` is the CA or enrolment host (a name or an IP).
- `-u user@DOMAIN -p` or `-hashes` for the authenticating account.

## Commands

Enumerate the CA and list only the vulnerable templates:

```bash
certipy find -u jsmith@DOMAIN -p 'Passw0rd!' -dc-ip TARGET -stdout -vulnerable
```

Request a certificate as the domain administrator through an ESC1 template:

```bash
certipy req -u jsmith@DOMAIN -p 'Passw0rd!' -target HOST \
  -ca CORP-CA -template VulnTemplate -upn administrator@DOMAIN
```

Authenticate with the issued certificate to recover the NT hash and a TGT:

```bash
certipy auth -pfx administrator.pfx -dc-ip TARGET
```

## Workflow

1. With any domain account, run `find -vulnerable` and read which ESC applies.
2. Pick the template and the identity to impersonate (often `administrator`).
3. `req` the certificate against the CA, saving the `.pfx`.
4. `auth` with the `.pfx` to get the target's NT hash and a Kerberos TGT.
5. Reuse the hash or ticket to move laterally or reach the domain objective.

## Notes

Issuing a certificate as another principal is high-impact and leaves a record on the CA, so confirm AD CS abuse is in scope and note the CA, template and identity you used for the report. `-dc-ip` needs an IP; the CA `-target` takes a name or an IP, so switch it to whichever resolves. Everything here is in-scope-only, and the recovered hash, ticket and `.pfx` are sensitive loot to handle with the rest of the engagement data.
