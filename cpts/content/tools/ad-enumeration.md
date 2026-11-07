---
tool: Active Directory enumeration
slug: ad-enumeration
kind: technique
stages: [actions-on-objectives]
category: Mapping the domain
platforms: [windows, network]
services: [ldap, smb, kerberos]
ports: [389, 636, 445, 88]
tags: [active-directory, enumeration, ldap, bloodhound, powerview, users]
attack: [T1087.002, T1069.002, T1482]
summary: Once you have any domain credential, map users, groups, computers, GPOs, trusts and the password policy. The data that drives every AD attack path.
references:
  - The Hacker Recipes: AD | https://www.thehacker.recipes/ad/
  - PowerView | https://powersploit.readthedocs.io/en/latest/Recon/
---

## From Linux, with a credential

```bash
# Users, groups, policy, shares across the domain
netexec smb DC01 -u jsmith -p 'Winter2026!' --users --groups --pass-pol --shares
# LDAP: dump users and descriptions (passwords hide in descriptions)
ldapsearch -x -H ldap://DC01 -D 'jsmith@corp.local' -w 'Winter2026!' -b 'DC=corp,DC=local' "(objectClass=user)" sAMAccountName description
# Feed BloodHound
bloodhound-python -u jsmith -p 'Winter2026!' -d corp.local -ns 10.10.10.5 -c All
```

## From Windows, with PowerView

```powershell
Import-Module .\PowerView.ps1
Get-NetUser | select samaccountname,description
Get-NetGroup "Domain Admins" | Get-NetGroupMember
Get-NetComputer | select name,operatingsystem
Get-NetGPO; Get-NetDomainTrust
# Accounts with SPNs (kerberoastable) or no pre-auth (AS-REP roastable)
Get-NetUser -SPN | select samaccountname,serviceprincipalname
Get-NetUser -PreauthNotRequired
```

## What to look for

```text
- Users in Domain Admins, Enterprise Admins, and nested privileged groups
- Service accounts with SPNs (kerberoast) and accounts without pre-auth (AS-REP)
- Passwords in user "description" / "info" fields and in SYSVOL scripts
- Machines where your user is local admin (NetExec (Pwn3d!))
- Trusts to other domains/forests, and GPOs you can edit
```

## Notes

Mark your owned principals in [BloodHound](/cpts/#tool-bloodhound) and run "shortest path to Domain Admins": each edge is a concrete next step. Enumeration over LDAP is noisy; one broad collection beats many small queries. From here go to [Kerberos attacks](/cpts/#tool-kerberos-attacks) and [Impacket](/cpts/#tool-impacket).
