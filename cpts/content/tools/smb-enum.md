---
tool: SMB enumeration
slug: smb-enum
kind: technique
stages: [reconnaissance]
category: Shares, users and RPC on 139/445
platforms: [linux, network]
services: [smb, rpc]
ports: [139, 445]
tags: [smb, enumeration, enum4linux, smbmap, rpcclient, null-session]
attack: [T1135, T1087.002, T1018]
summary: SMB is the richest target on a Windows network. Try a null or guest session first, then list shares, read what is readable, pull the user and group list over RPC and note the password policy. The usual source of the first foothold or the first credential.
references:
  - The Hacker Recipes: SMB | https://www.thehacker.recipes/systems-and-services/initial-access/smb
  - HackTricks pentesting SMB | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-smb/index.html
---

## When to reach for it

Any time 139 or 445 is open. Before credentials, test whether the host allows anonymous access: a null session or a guest login often lists shares and users outright. With a credential, the same tools go deeper. `service-enum` gives the one-liner; this is the fuller sweep.

## Null / guest first

```bash
enum4linux-ng -A TARGET
smbmap -H TARGET -u guest -p ''
smbclient -L //TARGET/ -N
```

`enum4linux-ng` rolls up OS, shares, users, groups and the password policy in one pass.

## Shares: list, then read

```bash
smbmap -H TARGET -u user -p pass            # READ/WRITE per share
smbclient //TARGET/Share -U 'DOMAIN\user'
```

In the `smbclient` prompt: `recurse ON; prompt OFF; mget *` to pull everything, `get file` for one. `smbmap -R Share -H TARGET` lists a share recursively without an interactive session.

## Users, groups and policy over RPC

```bash
rpcclient -U '' -N TARGET          # then: enumdomusers / querydispinfo / getdompwinfo
netexec smb TARGET -u user -p pass --users --shares --pass-pol
```

`rpcclient`'s `enumdomusers` and `lookupnames` turn a null session into a user list; `netexec` does the same with a credential and flags SMB signing for later relay.

## Notes

Reading shares and enumerating users is low-noise but still touches the target, so stay inside scope and record which shares were world-readable or writable for the report, those are findings in their own right. A null session that lists users is itself a finding. In-scope and authorised use only; files and credentials pulled from shares are sensitive loot to handle with the engagement data.
