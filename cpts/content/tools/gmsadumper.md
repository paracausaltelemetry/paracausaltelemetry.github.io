---
tool: gMSADumper
slug: gmsadumper
stages: [post-compromise]
targets: [windows]
category: Reading gMSA managed passwords
platforms: [linux]
services: [ldap]
ports: [389, 636]
tags: [active directory, credentials, gmsa, delegation, ldap]
attack: [T1555, T1078.002]
summary: Reads the managed password of a Group Managed Service Account over LDAP, when your principal is allowed to retrieve it. gMSA passwords are long and auto-rotated, so nobody types them — but the accounts often have strong rights, and the NTLM hash it returns is immediately usable for Pass-the-Hash and onward escalation.
references:
  - gMSADumper on GitHub | https://github.com/micahvandeusen/gMSADumper
  - The Hacker Recipes — gMSA | https://www.thehacker.recipes/ad/movement/dacl/readgmsapassword
---

## When to reach for it

BloodHound or an ACL review shows your user or group has `ReadGMSAPassword` over a gMSA (the `msDS-GroupMSAMembership` / PrincipalsAllowedToRetrieveManagedPassword attribute). gMSADumper fetches that blob over LDAP and derives the NTLM hash, handing you a usually-privileged service account without cracking anything.

## Key flags

- `-u user -p 'Password'`: the credential allowed to read the gMSA.
- `-d DOMAIN`: the target domain.
- `-l HOST`: the LDAP server (domain controller) to query.
- `--hashes LM:NT`: authenticate with a hash instead of a password.
- Output includes the gMSA's NTLM hash (and sometimes the AES keys).

## Commands

Dump every gMSA your account can read:

```bash
python3 gMSADumper.py -u user -p 'Password' -d DOMAIN -l HOST
```

Authenticate with a hash:

```bash
python3 gMSADumper.py -u user -d DOMAIN -l HOST --hashes :NTLMHASH
```

## Workflow

1. Identify a gMSA you can read (BloodHound's "ReadGMSAPassword" edge, or an ACL check).
2. Run gMSADumper with a credential that holds that right.
3. Take the returned NTLM hash of the gMSA.
4. Pass-the-Hash with it (NetExec, Evil-WinRM, Impacket) to act as the service account.
5. Enumerate the account's rights — gMSAs frequently have delegation or admin access.

## Notes

The value is that the password is unknowable by design (120+ random bytes, rotated every 30 days) yet fully recoverable if you hold the read right — and you never need to crack it. The hash works immediately for Pass-the-Hash. If you have a Windows foothold instead, `GetADServiceAccount`/the AD module or Rubeus can do the same on-host. Pair with the ACL abuse note, which shows how to *grant* yourself the read right when you can edit the gMSA's DACL.
