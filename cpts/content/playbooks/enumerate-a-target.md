---
title: Enumerate a target from scratch
slug: enumerate-a-target
area: initial-access
module: 3
order: 1
goal: Go from just an IP to a mapped attack surface — open ports, service versions and the first leads.
summary: How to enumerate a host — a fast then thorough nmap sweep, per-service enumeration, and turning versions into leads, so you always know the next move.
prereqs: [A target IP in scope, Network reach to it, nmap and the per-service tools installed]
seeAlso: [tool:nmap, tool:autorecon, tool:service-enum, howto:attack-a-service-to-a-shell, map:start]
references:
  - HackTricks: pentesting methodology | https://book.hacktricks.wiki/en/generic-methodologies-and-resources/pentesting-methodology.html
  - nmap reference | https://nmap.org/book/man.html
---

Enumeration is the whole game early on — the more you find, the more doors you have. Scan fast to see what's open, then scan those ports hard, then enumerate each service in turn.

## Sweep the ports

```bash
nmap -p- --min-rate 5000 -T4 TARGET -oN all-ports.txt         # all 65535, fast
nmap -sC -sV -p 22,80,445 TARGET -oN services.txt             # scripts + versions on the open ones
nmap -sU --top-ports 50 TARGET                                # a quick UDP look (SNMP, DNS, TFTP)
```

Or let AutoRecon drive the whole thing:

```bash
autorecon TARGET
```

## Enumerate each service

```bash
nmap -sV -p445 --script "smb-enum-*" TARGET                   # SMB
smbclient -L //TARGET/ -N ; enum4linux-ng -A TARGET
whatweb http://TARGET ; feroxbuster -u http://TARGET -w common.txt   # HTTP
snmpwalk -v2c -c public TARGET ; nmap -p161 -sU --script snmp-info TARGET   # SNMP
```

## Turn versions into leads

```bash
searchsploit "<product> <version>"          # known exploits
nmap --script vuln -p PORT TARGET           # quick vuln scripts
```

## If it fails

- **No ports open**: host may be filtered/behind a firewall — try `-Pn` (skip ping), different timing, or a UDP sweep.
- **Versions unknown**: add `-sV --version-intensity 9`, or banner-grab manually with `nc TARGET PORT`.
- **Scan is slow**: raise `--min-rate`, scan the full range in the background and work the common ports first.
- **Script errors**: a service rejected the probe — enumerate it manually with its own client.

## Verify

A clear list of open ports, service versions and at least one lead per service is "done". Take the strongest lead to Turn an open service into a shell.
