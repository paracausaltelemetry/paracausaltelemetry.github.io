---
tool: sqlmap
slug: sqlmap
stages: [exploitation]
category: SQL injection
platforms: [linux, web]
services: [http, https, mysql, mssql, postgres]
ports: [80, 443, 8080, 1433, 3306, 5432]
tags: [sql-injection, database, exploitation, web]
attack: [T1190]
summary: Automates finding and exploiting SQL injection. Confirms the flaw, fingerprints the database, dumps data, and — where the configuration allows — reads files or gets command execution. Point it at a request you suspect is injectable.
references:
  - sqlmap GitHub | https://github.com/sqlmapproject/sqlmap
  - sqlmap usage wiki | https://github.com/sqlmapproject/sqlmap/wiki/Usage
---

## When to reach for it

A parameter looks injectable (an error on a quote, a different response to `1 AND 1=1` vs `1 AND 1=2`). sqlmap confirms it and does the tedious extraction. Capture the exact request first so sqlmap tests the real thing, cookies and all.

## Key flags

- `-u "URL"` — target URL with the parameter.
- `-r request.txt` — use a saved raw HTTP request (best for POST, headers, cookies).
- `-p param` — test only this parameter.
- `--data "a=1&b=2"` — POST body.
- `--cookie`, `--headers` — session and custom headers.
- `--batch` — take default answers, no prompts.
- `--level 1-5`, `--risk 1-3` — how hard to test (higher finds more, slower, riskier).
- `--dbs`, `--tables`, `--columns`, `--dump` — enumerate and extract.
- `-D db -T table -C col` — scope the extraction.
- `--os-shell`, `--file-read` — command execution or file read where supported.

## Commands

Test a GET parameter and list databases:

```bash
sqlmap -u "http://TARGET/item?id=1" -p id --batch --dbs
```

Use a saved request (grab it from the browser or Burp) — handles POST, cookies, headers:

```bash
sqlmap -r request.txt --batch --level 3 --risk 2 --dbs
```

Dump a specific table:

```bash
sqlmap -r request.txt -D appdb -T users --dump --batch
```

## Workflow

1. Find the candidate parameter manually; save the full request to `request.txt`.
2. Run sqlmap on the request with `--batch` to confirm injectability and DBMS.
3. Enumerate `--dbs`, then the interesting database's `--tables` and `--columns`.
4. Dump only what the engagement needs (credentials, proof) — not the whole database.
5. If the DBMS and privileges allow, try `--os-shell` for execution, noting it is far noisier.

## Notes

Start at low `--level`/`--risk` and raise only if needed — high risk sends destructive test payloads. Always prefer `-r request.txt` over `-u` for anything with a session, so you test as an authenticated user. Dumping entire databases of real data on an engagement is rarely in scope; extract proof, not everything.
