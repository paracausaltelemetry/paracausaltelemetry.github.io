---
tool: pywhisker
slug: pywhisker
stages: [post-compromise]
targets: [windows]
category: Writing Shadow Credentials from Linux
platforms: [linux]
services: [ldap, kerberos]
ports: [636, 88]
tags: [active directory, shadow-credentials, keycredentiallink, pkinit, acl-abuse]
attack: [T1556, T1098]
summary: The Linux tool for the Shadow Credentials attack. Given write access to a victim's msDS-KeyCredentialLink attribute, pywhisker adds a key credential you control and exports a PFX — which you then exchange for the victim's Kerberos TGT via PKINIT. A quiet, reversible takeover that needs no password reset.
references:
  - pywhisker on GitHub | https://github.com/ShutdownRepo/pywhisker
  - SpecterOps — Shadow Credentials | https://posts.specterops.io/shadow-credentials-abusing-key-trust-account-mapping-for-takeover-8ee1a53566ab
---

## When to reach for it

BloodHound shows an `AddKeyCredentialLink` edge, or you otherwise hold `GenericWrite`/`GenericAll` over a user or computer, and the domain supports PKINIT (a DC certificate or AD CS). pywhisker writes a key credential to the target from your Linux box; you keep the private key and authenticate as them, without touching their password.

## Key flags

- `-d DOMAIN -u you -p 'pass'` (or `-H hash` / `-k`): how you authenticate to LDAP.
- `--target VICTIM`: the account whose `msDS-KeyCredentialLink` you edit.
- `--action add | list | remove | clear`: write, enumerate, delete one, or wipe all entries.
- `--dc-ip TARGET`: the DC to talk to; the PFX path and password are printed on `add`.

## Commands

Add a Shadow Credential and export a PFX:

```bash
pywhisker -d DOMAIN --dc-ip TARGET -u attacker -p 'Password123' --target victim --action add
```

Clean up afterwards (restore the attribute):

```bash
pywhisker -d DOMAIN --dc-ip TARGET -u attacker -p 'Password123' --target victim --action remove
```

## Workflow

1. Confirm the write right over the target (BloodHound `AddKeyCredentialLink`, or generic write).
2. `--action add`; note the PFX file and its password.
3. Turn the PFX into a TGT with [PKINITtools](/cpts/#tool-pkinittools) (`gettgtpkinit`).
4. `export KRB5CCNAME` and act as the victim — shell, DCSync, onward enumeration.
5. `--action remove` to delete your key credential and leave no backdoor.

## Notes

pywhisker is the mechanism; the full attack, prerequisites and cleanup are in the [Shadow Credentials note](/cpts/#tool-shadow-credentials). It needs a 2016+ DC and PKINIT available in the domain. Certipy's `shadow auto` wraps the whole add-authenticate-remove cycle in one command if you would rather not drive the steps by hand. Always remove the entry when done — a lingering key credential is a durable, easily-missed backdoor on the object.
