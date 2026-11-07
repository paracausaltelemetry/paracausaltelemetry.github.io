---
tool: NetExec
slug: netexec
stages: [reconnaissance]
category: Network and AD enumeration
platforms: [linux, network, windows]
services: [smb, winrm, ldap, mssql, rdp, ssh, ftp]
ports: [22, 21, 445, 135, 139, 389, 636, 1433, 3389, 5985, 5986]
tags: [enumeration, smb, active-directory, credential-spray, shares]
attack: [T1087, T1135, T1110.003]
summary: The successor to CrackMapExec. Sweeps a subnet for SMB, WinRM, LDAP, MSSQL and more, checks credentials across hosts, lists shares and users, and flags where a credential is a local admin. The workhorse of internal and Active Directory enumeration.
references:
  - NetExec wiki | https://www.netexec.wiki/
  - NetExec GitHub | https://github.com/Pennyw0rth/NetExec
---

## When to reach for it

You are on an internal network with (or without) a credential and need the lay of the land: which hosts speak SMB, which shares are readable, which accounts are valid, and: the prize: where a credential has local admin. Run it across a range, not one host at a time.

## Key flags

- `smb`, `winrm`, `ldap`, `mssql`, `ssh`: the protocol module to use.
- `-u user` / `-u users.txt`: username or list.
- `-p pass` / `-p passwords.txt`: password or list.
- `-H hash`: authenticate with an NTLM hash (pass-the-hash).
- `--local-auth`: treat credentials as local, not domain.
- `--shares`: list shares and the access the credential has.
- `--users`, `--groups`, `--pass-pol`: enumerate domain users, groups, password policy.
- `--sam`, `--lsa`: dump local secrets (needs admin).
- `-x "cmd"` / `-X "ps"`: run a command (needs admin).

## Commands

Sweep a subnet for SMB and read the host banners (no credential needed):

```bash
netexec smb 10.10.10.0/24
```

Validate a credential across every host; `(Pwn3d!)` marks local admin:

```bash
netexec smb 10.10.10.0/24 -u jsmith -p 'Winter2026!'
```

List shares the credential can reach:

```bash
netexec smb 10.10.10.0/24 -u jsmith -p 'Winter2026!' --shares
```

Pass-the-hash, local admin check:

```bash
netexec smb TARGET -u administrator -H 31d6cfe0d16ae931b73c59d7e0c089c0 --local-auth
```

Enumerate the domain (users, groups, password policy):

```bash
netexec smb DC01 -u jsmith -p 'Winter2026!' --users --groups --pass-pol
```

## Workflow

1. Unauthenticated sweep: find SMB hosts, signing status and the domain/host names.
2. With a credential, spray it across the range to find where it is valid and where it is admin.
3. On hosts you can read, list shares and loot them for config, scripts and credentials.
4. Against a DC, enumerate users, groups and the password policy to plan a safe spray.
5. Record every `(Pwn3d!)`: those are your footholds for the next stage.

## Notes

A credential spray with `-u users.txt -p onepassword` is quiet; `-u user -p passwords.txt` risks lockout: mind the password policy you pulled with `--pass-pol`. SMB signing "False" on the host list is what makes a relay attack possible later. Dumping SAM/LSA and running commands needs admin and is noisy; save it for when you have the access and the authorisation.
