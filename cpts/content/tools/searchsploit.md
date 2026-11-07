---
tool: SearchSploit
slug: searchsploit
stages: [exploitation]
category: Exploit lookup (Exploit-DB)
platforms: [linux]
services: [all]
ports: []
tags: [exploitation, exploit-db, cve, enumeration, offline]
attack: [T1203, T1588.005]
summary: The command-line search for the offline Exploit-DB archive. Match a service and version from recon to a known public exploit, read it, and copy it out to work on. The bridge from "what version is this" to "is there an exploit".
references:
  - SearchSploit manual | https://www.exploit-db.com/searchsploit
  - Exploit-DB | https://www.exploit-db.com/
---

## When to reach for it

Recon gave you a product and version (from `nmap -sV`, a banner, a CMS footer) and you want to know whether a public exploit already exists. SearchSploit queries a local copy of Exploit-DB, so it works offline and fast. It finds and shows the exploit; you still read and understand it before running anything.

## Key flags

- `searchsploit <terms>`: search titles for all the terms (AND).
- `-t`: match the title only (fewer false hits from file paths).
- `-e`: exact match on the phrase.
- `--exclude="term"`: drop results containing a term (e.g. `--exclude="dos"`).
- `-w`: show the Exploit-DB URL for each result.
- `-p <id>`: show the full path to an exploit and copy it to the clipboard.
- `-m <id>`: mirror (copy) the exploit into the current directory.
- `-x <id>`: examine (open) the exploit in the pager.
- `-u`: update the local Exploit-DB copy.
- `--nmap <file.xml>`: read an Nmap XML scan and search for each service found.

## Commands

Search by product and version, titles only:

```bash
searchsploit -t vsftpd 2.3.4
```

Examine an entry, then copy it out to work on:

```bash
searchsploit -x 49757          # read it in the pager first
searchsploit -m 49757          # mirror it into the current directory
```

Feed an Nmap scan straight in to triage every service at once:

```bash
nmap -sV -oX scan.xml TARGET
searchsploit --nmap scan.xml
```

Trim noise from a broad search:

```bash
searchsploit apache 2.4 --exclude="dos"
```

## Workflow

1. Take the exact product and version from the version scan.
2. Search titles (`-t`) for it; narrow with `--exclude` if a flood of unrelated hits appears.
3. Examine the candidate (`-x`) and read it end to end before trusting it.
4. Mirror it (`-m`) and check what it does, where it writes, and any hard-coded offsets or IPs.
5. Adjust the target, offsets and listener for your environment, then run it in a controlled way.

## Notes

A match is a lead, not a working exploit: public code often needs the right target version, a fixed offset, or an updated shellcode, and some entries are proof-of-concept or denial-of-service you would not run in an engagement. Always read downloaded exploit code before executing it; run unknown code only against in-scope lab targets. Keep the archive current with `searchsploit -u`.
