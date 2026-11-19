---
tool: smbclient, smbmap & enum4linux
slug: smb-client-tools
kind: tool
stages: [network, windows, active-directory]
category: SMB client tools (connect, list, read)
platforms: [linux, network]
services: [smb, rpc]
ports: [139, 445]
tags: [smb, smbclient, smbmap, enum4linux, smbget, null-session, shares]
attack: [T1135, T1039]
summary: The command-line SMB clients you reach for over 139/445: smbclient for an interactive session, smbmap for a fast read/write permission map, enum4linux-ng for a full rollup, and smbget to pull files. The tools behind the SMB enumeration workflow.
references:
  - HackTricks: pentesting SMB | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-smb/index.html
  - enum4linux-ng | https://github.com/cddmp/enum4linux-ng
---

## When to reach for it

Any time 139 or 445 is open. These are the clients; for the enumeration-to-attack workflow (null session, RID cycling, spray, exec) see the [SMB enumeration](/cpts/#tool-smb-enum) and [attacking services](/cpts/#tool-attacking-services) notes.

## enum4linux-ng (the rollup)

```bash
enum4linux-ng -A TARGET                 # OS, shares, users, groups, password policy in one pass
enum4linux-ng -A -u user -p pass TARGET # authenticated, goes deeper
```

## smbmap (permission map)

```bash
smbmap -H TARGET -u guest -p ''                 # READ/WRITE per share, null/guest
smbmap -H TARGET -u user -p pass                # with a credential
smbmap -H TARGET -u user -p pass -R Share       # recurse a share's contents
smbmap -H TARGET -u user -p pass -x 'whoami'    # command exec where allowed
```

## smbclient (interactive) and smbget

```bash
smbclient -L //TARGET/ -N                       # list shares, no creds
smbclient //TARGET/Share -U 'DOMAIN\user'       # connect; then: recurse ON; prompt OFF; mget *
smbclient //TARGET/Share -N -c 'ls'             # one-shot command, no session
smbget -R smb://TARGET/Share -U user            # pull a share recursively
```

## Notes

Reading shares and listing users is low-noise but still touches the target, so stay in scope and record which shares were world-readable or writable, those are findings. A null session that lists users or shares is itself a finding worth the report. Files pulled from shares are sensitive loot to handle with the engagement data. For the credential and RPC side, pair these with [NetExec](/cpts/#tool-netexec).
