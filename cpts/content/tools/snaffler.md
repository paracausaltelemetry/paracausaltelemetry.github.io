---
tool: Snaffler
slug: snaffler
stages: [post-compromise]
targets: [windows]
category: Hunting secrets across domain shares
platforms: [windows]
services: [smb]
ports: [445]
tags: [credentials, active directory, shares, smb, enumeration, loot]
attack: [T1135, T1552.001, T1083]
summary: Crawls every readable SMB share in a domain and surfaces the files worth reading — configs, scripts, keys, password-looking strings and known-sensitive filenames — ranked by how interesting they are. The scalable way to find the one credential sitting on a file server among thousands of boring files.
references:
  - Snaffler on GitHub | https://github.com/SnaffCon/Snaffler
---

## When to reach for it

You have a domain credential and want the secrets scattered across the organisation's file shares — the passwords in a deploy script, the KeePass database, the `web.config` with a connection string. Snaffler enumerates hosts from the domain, walks their shares and triages findings so you read the promising files first.

## Key flags

- `-s`: print results to stdout as well as the log.
- `-o snaffler.log`: write the full findings to a file.
- `-d corp.local -c DC`: the domain and a domain controller to enumerate from.
- `-i C:\path`: scan a specific path instead of auto-discovering shares.
- `-n`: skip host discovery (use a supplied share list).
- Output is severity-coloured: red/yellow findings first.

## Commands

Auto-discover shares across the domain and log the loot:

```powershell
.\Snaffler.exe -d DOMAIN -s -o snaffler.log
```

Scan one known share path:

```powershell
.\Snaffler.exe -i \\HOST\share -s -o snaffler.log
```

## Workflow

1. Run Snaffler from a domain-joined context (or with runas /netonly creds).
2. Let it enumerate shares and triage; watch the red (high-value) hits.
3. Open the top findings — configs, scripts, `.kdbx`, `.ppk`, `id_rsa`, `unattend.xml`.
4. Extract credentials and feed reused passwords into lateral movement.
5. Send any hashes or protected files (KeePass, etc.) to the cracking note.

## Notes

Snaffler reads a lot of shares quickly and is loud on the network and in share-access logs — scope it and expect to be noticed on a monitored estate. It only sees what your credential can read, so re-run as accounts you escalate to. For a lighter, cross-platform option, NetExec's `--spider_plus` and `MANSPIDER` cover similar ground; Snaffler's edge is its built-in triage of what actually matters.
