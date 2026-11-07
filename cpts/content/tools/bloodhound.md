---
tool: BloodHound
slug: bloodhound
stages: [actions-on-objectives]
category: Active Directory attack paths
platforms: [windows, linux, network]
services: [ldap, smb, kerberos]
ports: [389, 636, 445, 88]
tags: [active-directory, attack-paths, graph, enumeration, privilege-escalation]
attack: [T1087.002, T1069.002, T1482]
summary: Maps Active Directory as a graph and finds the shortest path from where you are to Domain Admin. A collector (SharpHound or the Python collector) gathers users, groups, sessions, ACLs and trusts; BloodHound shows who can reach what, and how.
references:
  - BloodHound docs | https://bloodhound.specterops.io/
  - SharpHound collector | https://bloodhound.specterops.io/collect-data/ce-collection/sharphound
---

## When to reach for it

You have a domain foothold and want to know the route to the top. AD privilege relationships are too tangled to read by hand; BloodHound collects them and answers "from this user, what is the shortest path to Domain Admin?" and "who can reset this account's password?".

## Key flags

Collection with the Python collector (`bloodhound-python`), run from Linux:

- `-u user -p pass`: domain credential.
- `-d DOMAIN`: the domain.
- `-ns TARGET` / `-dc DC01`: the DNS/DC to query.
- `-c All`: all collection methods (sessions, ACLs, trusts, and more).

In the BloodHound UI: run the built-in queries, or mark nodes **Owned** / **High Value** and use "Shortest paths to Domain Admins".

## Commands

Collect from Linux with a domain credential:

```bash
bloodhound-python -u jsmith -p 'Winter2026!' -d DOMAIN -ns TARGET -c All
```

Collect on a Windows foothold with SharpHound, then pull the zip off:

```text
C:\> SharpHound.exe -c All -d DOMAIN
```

Load the resulting JSON/zip into the BloodHound UI, then run, for example, the "Shortest Paths to Domain Admins" query after marking your user **Owned**.

## Workflow

1. Collect with `-c All` from any valid domain account.
2. Import the data; mark the accounts and hosts you already control as **Owned**.
3. Run "Shortest paths from Owned principals to Domain Admins".
4. Read each edge (e.g. `GenericAll`, `AddMember`, `ForceChangePassword`, session on a privileged host): each is a concrete next step.
5. Execute the first edge with the right tool (Impacket, NetExec), then re-mark and re-query.

## Notes

The graph is only as current as the collection: sessions especially go stale, so recollect after you change the environment. Edges name the attack (`GenericAll`, `ReadGACLs`, `AllowedToDelegate`); learning what each means is the point for CPTS. Collection touches LDAP heavily and is visible to monitoring; keep it scoped.
