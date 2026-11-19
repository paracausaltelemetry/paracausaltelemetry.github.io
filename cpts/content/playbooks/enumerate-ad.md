---
title: Enumerate an Active Directory domain
slug: enumerate-ad
area: active-directory
module: 13
order: 1
goal: Map a domain — users, groups, computers, policies and attack paths — from your first foothold or credential.
summary: How to enumerate AD — find the DC, recover users with no creds, pull the directory with one credential, then collect BloodHound and let it find the path to Domain Admin.
prereqs: [Reach to a Domain Controller (or any domain-joined host), Ideally one valid domain credential (even low-priv), BloodHound to review the graph]
seeAlso: [tool:netexec, tool:bloodhound, tool:ad-enumeration, tool:kerbrute, howto:roast-kerberos, map:active-directory]
references:
  - The Hacker Recipes: AD recon | https://www.thehacker.recipes/ad/recon/
  - BloodHound | https://github.com/SpecterOps/BloodHound
---

AD is a graph of who-can-do-what. Everything downstream — roasting, ACL abuse, delegation — is read off the enumeration. Find the DC, get a foothold credential, then let BloodHound show you the shortest path to Domain Admin.

## No credentials yet

```bash
nxc smb DC -u '' -p '' --rid-brute 10000            # recover users (null session)
enum4linux-ng -A DC
kerbrute userenum -d corp.local --dc DCIP users.txt  # validate names, no lockout
```

## With one credential

```bash
nxc smb DC -u user -p pass --users --groups --shares --pass-pol
nxc ldap DC -u user -p pass --users --password-not-required
ldapsearch -x -H ldap://DC -D 'user@corp.local' -w pass -b 'DC=corp,DC=local' '(objectClass=user)' sAMAccountName description
```

## Collect BloodHound and find the path

```bash
bloodhound-python -d corp.local -u user -p pass -c All -ns DCIP --zip
nxc ldap DC -u user -p pass --bloodhound --collection-method All --dns-server DCIP
```

Import the zip, mark your account **Owned**, and run: *Shortest Paths to Domain Admins*, *Shortest Paths from Owned Principals*, *Kerberoastable accounts*.

## On a Windows foothold (PowerView)

```powershell
Get-DomainUser -SPN | select samaccountname,serviceprincipalname    # kerberoastable
Get-DomainUser -PreauthNotRequired                                  # AS-REP roastable
Find-InterestingDomainAcl -ResolveGUIDs                             # abusable rights
Get-DomainComputer -Unconstrained                                   # delegation
```

## If it fails

- **Null session refused**: modern DCs block anonymous — you need a credential; get one via spraying, a roast, or a service.
- **BloodHound collection errors**: check time sync, DNS (`-ns`/`--dns-server` the DC), and that the account can read LDAP.
- **No obvious path in the graph**: look for kerberoastable/AS-REP accounts, GPO/ACL edges, and sessions of privileged users on reachable hosts.
- **LDAP signing/channel-binding required**: use LDAPS or Kerberos auth instead of simple bind.

## Verify

A user/group/computer list, the password policy, and at least one candidate path (a roastable account, an ACL edge, a reachable admin session) is "done". Take the path — Roast Kerberos, Abuse AD ACLs, or straight to DCSync.
