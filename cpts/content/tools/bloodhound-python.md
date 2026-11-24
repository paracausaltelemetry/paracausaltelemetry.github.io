---
tool: bloodhound-python
slug: bloodhound-python
stages: [pre-compromise]
targets: [windows]
category: Collecting BloodHound data from Linux
platforms: [linux, network]
services: [ldap, smb, kerberos]
ports: [389, 445, 88]
tags: [active directory, bloodhound, enumeration, collector, ldap]
attack: [T1087.002, T1069.002, T1482]
summary: The Python BloodHound collector. From Linux, with any domain credential, it gathers users, groups, ACLs, sessions and trusts over LDAP and SMB and writes the JSON zip you load into BloodHound. The way to map a domain's attack paths when you have no Windows foothold to run SharpHound on.
references:
  - BloodHound.py on GitHub | https://github.com/dirkjanm/BloodHound.py
  - BloodHound docs | https://bloodhound.readthedocs.io/
---

## When to reach for it

You have a domain credential and a Linux attack box, and you want the BloodHound graph without landing on a domain-joined Windows host first. bloodhound-python queries the DC directly and produces the same JSON SharpHound would, ready to import.

## Key flags

- `-u user -p 'Password'`: the domain credential (or `--hashes` for pass-the-hash).
- `-d DOMAIN`: the target domain (FQDN).
- `-ns HOST`: the DNS server to use — usually the domain controller.
- `-c All`: collection methods (`All`, `DCOnly`, `Group`, `Session`, `ACL`).
- `--zip`: bundle the JSON into one zip for import.
- `-k` / `--use-kerberos`: authenticate with a ticket instead of a password.

## Commands

Full collection, zipped for import:

```bash
bloodhound-python -u user -p 'Password' -d DOMAIN -ns TARGET -c All --zip
```

Quiet, LDAP-only pass (no host sessions, less noise):

```bash
bloodhound-python -u user -p 'Password' -d DOMAIN -ns TARGET -c DCOnly --zip
```

Pass-the-hash instead of a password:

```bash
bloodhound-python -u user --hashes :NTLMHASH -d DOMAIN -ns TARGET -c All --zip
```

## Workflow

1. Point `-ns` at the domain controller so name resolution works.
2. Run `-c All` for the richest graph, or `-c DCOnly` when you need to stay quiet.
3. Import the zip into the BloodHound UI.
4. Run the built-in queries: shortest paths to Domain Admin, Kerberoastable, owned-user paths.
5. Spend the ACL edges it finds with the ACL abuse and Kerberos notes.

## Notes

`DCOnly` pulls everything from the DC alone and skips per-host session/loggedon collection, so it is quieter and faster but misses live session data. Time must be in sync with the DC for Kerberos. SharpHound (inside the BloodHound note) is the Windows collector and gathers richer session data from a foothold; bloodhound-python is the Linux-first equivalent and the usual choice from an attack box.
