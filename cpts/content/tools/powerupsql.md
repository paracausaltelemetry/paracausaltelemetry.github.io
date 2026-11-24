---
tool: PowerUpSQL
slug: powerupsql
stages: [pre-compromise]
targets: [windows]
category: Discovering and attacking MSSQL in a domain
platforms: [windows]
services: [mssql]
ports: [1433]
tags: [mssql, active directory, enumeration, privilege escalation, linked servers]
attack: [T1046, T1078, T1210]
summary: Finds every SQL Server in a domain from its SPNs, checks where your account can log in, audits each instance for privilege-escalation paths, and crawls linked-server chains to run commands on boxes you were never meant to reach. The PowerShell toolkit that turns a domain foothold into MSSQL compromise.
references:
  - PowerUpSQL on GitHub | https://github.com/NetSPI/PowerUpSQL
  - PowerUpSQL wiki | https://github.com/NetSPI/PowerUpSQL/wiki
---

## When to reach for it

You are in a domain and SQL Servers are about (port 1433, or MSSQL SPNs in LDAP). PowerUpSQL discovers them without a scan, tells you which ones accept your current Windows account, and finds the misconfigurations — excessive privileges, impersonation, linked servers — that lead to command execution.

## Key flags

- `Get-SQLInstanceDomain`: enumerate instances from domain SPNs (no scanning).
- `Get-SQLConnectionTestThreaded`: test where your account can authenticate.
- `Invoke-SQLAudit`: run the privilege-escalation checks against an instance.
- `Get-SQLServerLinkCrawl`: follow linked-server chains across hosts.
- `Invoke-SQLOSCmd -Command`: run an OS command via xp_cmdshell.

## Commands

Discover instances and test access across the domain:

```powershell
Import-Module .\PowerUpSQL.ps1
Get-SQLInstanceDomain | Get-SQLConnectionTestThreaded -Verbose
```

Audit a reachable instance for escalation paths:

```powershell
Get-SQLInstanceDomain | Invoke-SQLAudit -Verbose
```

Crawl linked servers and run a command on a reachable one:

```powershell
Get-SQLServerLinkCrawl -Instance "SQL01" -Query "exec master..xp_cmdshell 'whoami'"
```

## Workflow

1. `Get-SQLInstanceDomain` to list every SQL Server from SPNs — no noisy port sweep.
2. `Get-SQLConnectionTestThreaded` to see which accept your current token.
3. `Invoke-SQLAudit` on the reachable ones for impersonation and privilege issues.
4. `Get-SQLServerLinkCrawl` to reach instances through trusted links.
5. Land OS command execution with `Invoke-SQLOSCmd`, then pivot from the SQL host.

## Notes

PowerUpSQL shines in Active Directory because it finds servers from SPNs and uses your Windows identity, so it needs no password where integrated auth is on. Linked-server crawling is its signature trick: a low-priv login on one server can become `sa` and `xp_cmdshell` two hops away. From Linux, the database-attacks note and `impacket-mssqlclient` cover the manual MSSQL side.
