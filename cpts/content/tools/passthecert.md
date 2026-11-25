---
tool: PassTheCert
slug: passthecert
stages: [post-compromise]
targets: [windows]
category: Certificate auth over LDAPS when PKINIT is unavailable
platforms: [linux]
services: [ldap]
ports: [636]
tags: [active directory, certificates, ldaps, pass-the-certificate, dcsync, acl-abuse]
attack: [T1550.003, T1649, T1098]
summary: The fallback for when you hold a certificate but the KDC will not accept it for PKINIT pre-authentication — often a missing EKU on a domain controller's cert. PassTheCert authenticates to LDAPS with the certificate instead and performs directory attacks directly: grant yourself DCSync, reset a password, or add a computer.
references:
  - PassTheCert on GitHub | https://github.com/AlmondOffSec/PassTheCert
  - Almond — authenticating with certificates when PKINIT is not supported | https://offsec.almond.consulting/authenticating-with-certificates-when-pkinit-is-not-supported.html
---

## When to reach for it

You obtained a certificate but `gettgtpkinit` / `certipy auth` fail because the KDC does not support the required EKU (common with a relayed DC machine-account cert). Rather than a TGT, PassTheCert uses the certificate for client authentication to LDAPS and acts over the directory channel — enough to escalate without ever getting a Kerberos ticket.

## Key flags

- `-crt cert.crt -key cert.key` (or `-pfx file.pfx`): the certificate to authenticate with.
- `-domain DOMAIN -dc-ip TARGET`: the target domain and DC (LDAPS, 636).
- `-action`: the directory operation — `whoami`, `ldap-shell`, `modify_user`, `add_computer`, etc.
- From an `ldap-shell` you can run `add_user_to_group`, `change_password`, and grant DCSync rights.

## Commands

Confirm the certificate authenticates, then drop into an LDAP shell:

```bash
python3 passthecert.py -action ldap-shell -crt cert.crt -key cert.key -domain DOMAIN -dc-ip TARGET
```

Reset a target user's password directly:

```bash
python3 passthecert.py -action modify_user -crt cert.crt -key cert.key -domain DOMAIN -dc-ip TARGET -target victim -new-pass 'NewPass123!'
```

## Workflow

1. Try PKINIT first ([PKINITtools](/cpts/#tool-pkinittools)); fall back here only when the cert is rejected.
2. Split a PFX into `cert.crt` + `cert.key` if needed (`openssl pkcs12 ...`), or pass `-pfx`.
3. Run `whoami`/`ldap-shell` to confirm the identity and access.
4. Perform the directory attack: grant DCSync, reset a password, or add a computer for RBCD.
5. Cash in the new rights — e.g. DCSync with [secretsdump](/cpts/#tool-secretsdump).

## Notes

This is the escape hatch in the [Pass the Certificate](/cpts/#tool-pass-the-certificate) chain: same certificate, different protocol. Directory writes such as granting DCSync or resetting a password are high-impact and logged — in scope only, and documented. LDAPS must be reachable (TCP/636). The classic case is a DC machine-account certificate from an ESC8 relay that the KDC refuses for PKINIT; PassTheCert turns it into domain compromise over LDAP instead.
