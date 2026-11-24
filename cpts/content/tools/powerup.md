---
tool: PowerUp / SharpUp
slug: powerup
stages: [post-compromise]
targets: [windows]
category: Windows privilege-escalation checks
platforms: [windows]
services: []
ports: []
tags: [privilege escalation, windows, services, powershell, enumeration]
attack: [T1068, T1574.009, T1574.011]
summary: Hunts the common misconfigurations that let a normal user become SYSTEM on Windows — unquoted service paths, weak service and binary permissions, AlwaysInstallElevated, modifiable scheduled tasks and registry autoruns — and, with PowerUp, can abuse them directly. SharpUp is the compiled C# version for when PowerShell is blocked.
references:
  - PowerUp (PowerSploit) | https://github.com/PowerShellMafia/PowerSploit/blob/master/Privesc/PowerUp.ps1
  - SharpUp (GhostPack) | https://github.com/GhostPack/SharpUp
---

## When to reach for it

You have a user shell on Windows and want a fast, targeted read of the privesc landscape — specifically the service and installer misconfigurations that are quick to exploit. PowerUp enumerates and can weaponise them in one tool; reach for it alongside winPEAS when you want the service angle in depth.

## Key flags

- `Invoke-AllChecks`: run every PowerUp check and summarise the wins.
- `Get-ServiceUnquoted` / `Get-ModifiableServiceFile` / `Get-ModifiableService`: the service issues.
- `Invoke-ServiceAbuse -Name <svc>`: exploit a weak service to add an admin.
- `Get-RegistryAlwaysInstallElevated`: the MSI-as-SYSTEM misconfiguration.
- SharpUp: `SharpUp.exe audit` (enumerate only) — no PowerShell needed.

## Commands

Load PowerUp and run all checks:

```powershell
Import-Module .\PowerUp.ps1
Invoke-AllChecks
```

Abuse a weak service to create a local admin:

```powershell
Invoke-ServiceAbuse -Name "VulnSvc" -Username "pwn" -Password "P@ssw0rd!"
```

Compiled alternative when scripts are blocked:

```powershell
.\SharpUp.exe audit
```

## Workflow

1. `Invoke-AllChecks` (or `SharpUp.exe audit`) for the summary of weaknesses.
2. Prioritise the quick wins: unquoted paths, modifiable service binaries, AlwaysInstallElevated.
3. Exploit a service issue with `Invoke-ServiceAbuse`, or drop a crafted binary into a writable path.
4. For AlwaysInstallElevated, build a malicious MSI with msfvenom and install it.
5. Confirm the new admin / SYSTEM context, then dump credentials.

## Notes

PowerUp overlaps winPEAS but goes deeper on services and can exploit, not just report — use both: winPEAS/Seatbelt for breadth, PowerUp for the service kill. Both are AMSI-flagged; load in memory, obfuscate, or use SharpUp as a BOF. The Windows privesc note covers the manual equivalents (`sc qc`, `icacls`) when you cannot run a script.
