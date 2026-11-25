---
tool: LaZagne
slug: lazagne
stages: [post-compromise]
targets: [windows, linux]
category: Recovering stored credentials on a host
platforms: [windows, linux]
services: []
ports: []
tags: [credentials, post-exploitation, browsers, passwords, dpapi, wifi]
attack: [T1555, T1555.003, T1552.001]
summary: Pulls saved passwords out of the software already on a compromised host — browsers, mail clients, Wi-Fi, databases, chats, sysadmin tools and the Windows Credential Manager. One command recovers the reused passwords that move you laterally, without touching LSASS or the SAM.
references:
  - LaZagne on GitHub | https://github.com/AlessandroZ/LaZagne
---

## When to reach for it

You have a shell on a host and want the credentials its applications have stored for the user — the ones most likely to be reused elsewhere. LaZagne knows where dozens of programs keep secrets and decrypts them with the current user's context, so run it early in post-exploitation.

## Key flags

- `all`: run every module (the usual choice).
- `browsers` / `mails` / `wifi` / `sysadmin` / `databases`: a single category.
- `-oN` / `-oJ` / `-oA`: write results to a normal, JSON or all-format file.
- `-v`: verbose, to see what each module tried.
- Windows: the packaged `LaZagne.exe`; Linux: `python laZagne.py`.

## Commands

Windows — recover everything:

```powershell
.\LaZagne.exe all
```

Just browser-stored passwords, saved to JSON:

```powershell
.\LaZagne.exe browsers -oJ
```

Linux build:

```bash
python laZagne.py all
```

## Workflow

1. Run `all` as the compromised user to sweep every supported application.
2. Note any password that looks reused (admin, service or domain accounts).
3. Try the recovered credentials against other hosts with NetExec / Evil-WinRM.
4. Feed anything hashed or partial into the credential-hunting and cracking notes.
5. Re-run as other users you pivot to — stored secrets are per-profile.

## Notes

LaZagne decrypts with the running user's keys (including DPAPI on Windows), so it only recovers what that user could already read — run it in each user context you land in. The packaged exe is heavily signatured by AV; build from source or run in memory on a defended host. It complements, not replaces, LSASS/SAM dumping: this finds application secrets, Mimikatz finds OS credential material.
