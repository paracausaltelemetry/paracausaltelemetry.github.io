---
tool: Seatbelt
slug: seatbelt
stages: [post-compromise]
targets: [windows]
category: Windows host survey for post-exploitation
platforms: [windows]
services: []
ports: []
tags: [enumeration, windows, post-exploitation, situational awareness, credentials]
attack: [T1082, T1552, T1087.001]
summary: A C# host survey that gathers the security-relevant facts about a Windows box — token privileges, UAC and defences, stored credentials and tokens, user activity, network state and local secrets. Where winPEAS scores privesc, Seatbelt answers "what is this machine and what is on it", fast and in one binary.
references:
  - Seatbelt (GhostPack) | https://github.com/GhostPack/Seatbelt
---

## When to reach for it

You have landed on a Windows host and need situational awareness before you act: your privileges, what defences are watching, which credentials and tokens are lying around, and what the user has been doing. Seatbelt collects it all without the noise of a full privesc scanner.

## Key flags

- `-group=all`: run every check (comprehensive, loud).
- `-group=user` / `-group=system`: user-context vs system-wide checks.
- `-group=remote`: checks safe to run against remote context.
- `-full`: do not truncate results.
- Specific commands: `TokenPrivileges`, `UAC`, `WindowsDefender`, `CredEnum`, `LogonSessions`, `PuttySessions`, `LSASettings`.

## Commands

A focused, high-value run (user + system groups):

```powershell
.\Seatbelt.exe -group=user -group=system
```

Everything, untruncated:

```powershell
.\Seatbelt.exe -group=all -full
```

Just the privilege and credential checks:

```powershell
.\Seatbelt.exe TokenPrivileges CredEnum LSASettings WindowsDefender
```

## Workflow

1. Run a user+system pass to learn your privileges and the host's defences.
2. Read `TokenPrivileges` — `SeImpersonate`/`SeBackup` point straight at a privesc route.
3. Check `WindowsDefender`/`AMSI` so you know what will catch your next tool.
4. Harvest `CredEnum`, `PuttySessions` and browser/vault findings as reusable loot.
5. Hand the privilege findings to PowerUp or the Windows privesc note to exploit.

## Notes

Seatbelt is reconnaissance, not exploitation — it tells you where to point PowerUp, PrintSpoofer or Rubeus next. Being GhostPack C#, it trips EDR; run it as a BOF through your C2, or obfuscate. It pairs naturally with winPEAS (privesc breadth) and Snaffler (share loot); Seatbelt's strength is the token/credential/defence picture of the one host you are standing on.
