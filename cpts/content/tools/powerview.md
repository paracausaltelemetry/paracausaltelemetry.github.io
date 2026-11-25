---
tool: PowerView
slug: powerview
stages: [post-compromise]
targets: [windows]
category: AD situational awareness from a Windows host
platforms: [windows]
services: [ldap, smb]
ports: [389, 445]
tags: [active directory, enumeration, powershell, acls, situational awareness]
attack: [T1087.002, T1069.002, T1018, T1482]
summary: The PowerShell workhorse for Active Directory enumeration from a Windows foothold. It wraps LDAP in friendly cmdlets — users, groups, computers, GPOs, ACLs, sessions and local-admin access — so you can map attack paths by hand when BloodHound is not an option. Part of PowerSploit; the go-to for living-off-the-land AD recon.
references:
  - PowerView (PowerSploit) | https://github.com/PowerShellMafia/PowerSploit/blob/master/Recon/PowerView.ps1
  - HarmJ0y — PowerView cheat sheet | https://gist.github.com/HarmJ0y/184f9822b195c52dd50c379ed3117993
---

## When to reach for it

You have a shell on a domain-joined Windows host and want to understand the domain without dropping a collector binary or when BloodHound ingestion is awkward. PowerView answers "who am I, what can I reach, and where can I log in as admin" with built-in PowerShell and LDAP.

## Key flags

- `Get-Domain` / `Get-DomainController`: the domain and its DCs.
- `Get-DomainUser -SPN`: Kerberoastable service accounts.
- `Get-DomainGroupMember 'Domain Admins'`: who holds the keys.
- `Find-LocalAdminAccess`: hosts where your token is local admin.
- `Get-DomainObjectAcl -ResolveGUIDs`: who has rights over what (attack edges).
- `Invoke-ShareFinder` / `Find-InterestingDomainShareFile`: readable shares and loot.

## Commands

Import the module, then get oriented:

```powershell
Import-Module .\PowerView.ps1
Get-Domain
Get-DomainUser -SPN | select samaccountname,serviceprincipalname
```

Find where you can already act as local admin:

```powershell
Find-LocalAdminAccess
```

Map the ACL edges into a target (the by-hand BloodHound):

```powershell
Get-DomainObjectAcl -Identity "Domain Admins" -ResolveGUIDs |
  ? { $_.ActiveDirectoryRights -match "WriteDacl|GenericAll|GenericWrite" }
```

## Workflow

1. Import PowerView (or load it in memory to avoid touching disk).
2. `Get-Domain` and `Get-DomainController` to confirm the lay of the land.
3. `Get-DomainUser -SPN` and `Get-DomainUser -PreauthNotRequired` for roastable accounts.
4. `Find-LocalAdminAccess` to find lateral-movement targets for your current token.
5. Chase ACL edges with `Get-DomainObjectAcl`, then spend them via the ACL abuse note.

## Notes

PowerView is flagged by AMSI and most EDR; load it in memory, obfuscate, or use the compiled `SharpView` where scripts are blocked. It reads the same LDAP data as BloodHound — use BloodHound for pathfinding at scale, PowerView for targeted questions and for environments where you cannot export a zip. On newer systems, `Get-ADObject` and the AD PowerShell module cover some of the same ground natively.
