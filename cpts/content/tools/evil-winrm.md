---
tool: Evil-WinRM
slug: evil-winrm
stages: [actions-on-objectives]
category: Remote access (WinRM)
platforms: [linux, windows]
services: [winrm]
ports: [5985, 5986]
tags: [lateral-movement, remote-shell, pass-the-hash, winrm]
attack: [T1021.006, T1550.002]
summary: A clean interactive shell over WinRM (Windows Remote Management). Give it a password or an NTLM hash and, if the account is in Remote Management Users, you get a PowerShell session with handy upload, download and in-memory script loading built in.
references:
  - Evil-WinRM GitHub | https://github.com/Hackplayers/evil-winrm
---

## When to reach for it

You have a credential or hash for an account that can use WinRM on a host (port 5985/5986 open; member of Remote Management Users or admin). Evil-WinRM turns that into a usable PowerShell session — the common way to "log in" to a Windows box from Linux after you crack or dump a credential.

## Key flags

- `-i HOST` — target.
- `-u user` — username.
- `-p pass` — password, **or** `-H hash` — NTLM hash (pass-the-hash).
- `-s /path/scripts` — a local folder of PowerShell scripts to load into memory with `Bypass-4MSI`.
- `-e /path/exes` — a local folder of executables for the `Invoke-Binary` helper.
- `-S` — use HTTPS (port 5986).

Inside the session: `upload local remote`, `download remote local`, `menu` (list the extra commands).

## Commands

Connect with a password:

```bash
evil-winrm -i 10.10.10.5 -u jsmith -p 'Winter2026!'
```

Pass-the-hash (no password needed):

```bash
evil-winrm -i 10.10.10.5 -u administrator -H 31d6cfe0d16ae931b73c59d7e0c089c0
```

Upload a file from the session:

```text
*Evil-WinRM* PS C:\> upload /home/kali/winPEASx64.exe C:\Windows\Temp\wp.exe
```

## Workflow

1. Confirm WinRM is open (NetExec `winrm` module) and the credential works there.
2. Connect with the password or hash.
3. Enumerate as the user (`whoami /all`, groups); upload your privesc tooling if needed.
4. Escalate, then reconnect as the higher-privileged account.
5. Keep a note of the credential, host and access level for the report.

## Notes

The account must be allowed WinRM (Remote Management Users or admin) — a valid credential alone is not enough. Loading scripts/binaries in memory still meets endpoint defences on hardened hosts. Prefer HTTPS (`-S`) where 5986 is the one open. Clean up anything you upload.
