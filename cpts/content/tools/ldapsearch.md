---
tool: ldapsearch
slug: ldapsearch
stages: [pre-compromise]
targets: [windows]
category: LDAP and AD enumeration
platforms: [linux, network]
services: [ldap]
ports: [389, 636, 3268, 3269]
tags: [enumeration, active directory, ldap, users, naming context]
attack: [T1087.002, T1018, T1069.002]
summary: Queries a domain controller's directory over LDAP. Anonymous, it often leaks the naming context and the domain's basic shape; with any credential it dumps users, groups, computers, descriptions and account flags. The low-level read behind BloodHound and NetExec, handy when you want the raw objects.
references:
  - ldapsearch man page | https://linux.die.net/man/1/ldapsearch
  - The Hacker Recipes — LDAP | https://www.thehacker.recipes/ad/recon/ldap
---

## When to reach for it

An LDAP port (389/636, or the Global Catalog on 3268/3269) is open on a domain controller. Use it to read directory objects directly: first anonymously to learn the naming context, then with a domain credential to enumerate users, groups and the fields that so often hold passwords.

## Key flags

- `-x`: simple authentication (anonymous, or with `-D`/`-w`).
- `-H ldap://HOST`: the LDAP URL (use `ldaps://` for 636).
- `-D 'user@DOMAIN'`: the bind DN / user to authenticate as.
- `-w 'Password'` / `-W`: the password (inline, or prompt).
- `-b 'DC=corp,DC=local'`: the search base (naming context).
- `-s base|one|sub`: search scope.
- the trailing args: an LDAP filter, then the attributes to return.

## Commands

Anonymous: read the naming context and root DSE:

```bash
ldapsearch -x -H ldap://HOST -s base namingcontexts
```

Authenticated: every user account:

```bash
ldapsearch -x -H ldap://HOST -D 'user@DOMAIN' -w 'Password' \
  -b 'DC=corp,DC=local' '(objectClass=user)' sAMAccountName description
```

Passwords hidden in description fields:

```bash
ldapsearch -x -H ldap://HOST -D 'user@DOMAIN' -w 'Password' \
  -b 'DC=corp,DC=local' '(objectClass=user)' description | grep -i descr
```

AS-REP-roastable accounts (no Kerberos pre-auth):

```bash
ldapsearch -x -H ldap://HOST -D 'user@DOMAIN' -w 'Password' \
  -b 'DC=corp,DC=local' \
  '(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304))' sAMAccountName
```

## Workflow

1. Anonymous `namingcontexts` query to get the base DN (`DC=corp,DC=local`).
2. With any credential, dump users and read their `description` fields.
3. Filter on `userAccountControl` bits for AS-REP-roastable and never-expire accounts.
4. Pull `servicePrincipalName` to spot Kerberoastable service accounts.
5. Feed what you find into Kerbrute, the Kerberos attacks or BloodHound.

## Notes

The `userAccountControl:1.2.840.113556.1.4.803:=` matching rule is a bitwise AND — `4194304` is "don't require pre-auth", `2` is "disabled". NetExec's `--users` and BloodHound collect the same data more conveniently, but raw ldapsearch wins when a filter needs tuning or tooling is unavailable. Use `windapsearch` for a friendlier front-end over the same queries.
