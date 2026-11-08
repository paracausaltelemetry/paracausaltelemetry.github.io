---
tool: Active Directory ACL abuse
slug: acl-abuse
kind: technique
stages: [actions-on-objectives]
category: Turning a BloodHound edge into access
platforms: [windows, linux, network]
services: [ldap, smb]
ports: [389, 636, 445]
tags: [active-directory, acl, dacl, genericall, writedacl, bloodhound]
attack: [T1222.001, T1098, T1484.001]
summary: BloodHound shows an edge like GenericAll or WriteDACL from your account to another object. ACL abuse is how you spend it: reset a password, add yourself to a group, grant delegation or write a shadow credential. The glue between an attack path and actual access.
references:
  - The Hacker Recipes: DACL abuse | https://www.thehacker.recipes/ad/movement/dacl/
  - BloodHound edges | https://bloodhound.readthedocs.io/en/latest/data-analysis/edges.html
---

## When to reach for it

You have a foothold account and BloodHound marks an outbound control edge to a user, group, computer or the domain object. Each edge maps to a concrete action. These change the directory, so note every object you touch and revert where you can.

## The common edges and their moves

- **GenericAll / GenericWrite over a user**: reset their password, or write a shadow credential and get their hash via `pywhisker` + `certipy`.
- **ForceChangePassword**: reset the target user's password outright.
- **GenericAll / AddMember over a group**: add your account to it (e.g. a nested path to Domain Admins).
- **WriteDACL / Owns**: grant yourself full control first, then use one of the above.
- **GenericAll over a computer**: set RBCD so you can impersonate any user to it.

## From Linux (impacket / bloodyAD)

Reset a user's password, add a member to a group, grant control:

```bash
net rpc password "victim" "NewPass123!" -U "DOMAIN/me%mypass" -S DC
bloodyAD -u me -p mypass -d DOMAIN --host DC add groupMember "Domain Admins" me
dacledit.py -action write -rights FullControl -principal me -target victim 'DOMAIN/me:mypass'
```

## From Windows (PowerView)

```powershell
Set-DomainUserPassword -Identity victim -AccountPassword (ConvertTo-SecureString 'NewPass123!' -AsPlainText -Force)
Add-DomainGroupMember -Identity 'Domain Admins' -Members me
Add-DomainObjectAcl -TargetIdentity victim -PrincipalIdentity me -Rights All
```

## Notes

Resetting a user's password, changing group membership and editing a DACL are intrusive, logged and can disrupt a real account, so confirm these are in scope, record the before state, and revert added rights, memberships and shadow credentials at the end. Prefer the least-disruptive edge that reaches the objective. In-scope and authorised use only; any recovered hash or credential is sensitive loot to handle with the engagement data.
