---
tool: Nmap
slug: nmap
stages: [reconnaissance]
category: Network scanning
platforms: [linux, network]
services: [all]
ports: []
tags: [scanning, enumeration, host-discovery, version-detection, nse]
attack: [T1046, T1595.001]
summary: The port scanner. Finds live hosts, open ports, service versions and, through NSE scripts, a first pass of service enumeration. Usually the first command run against an in-scope network.
references:
  - Nmap reference guide (man page) | https://nmap.org/book/man.html
  - NSE script documentation | https://nmap.org/nsedoc/
  - Host discovery | https://nmap.org/book/host-discovery.html
---

## When to reach for it

First contact with an in-scope host or range. You want to know what is alive, what ports are open, and what is listening before you pick a direction. Run a fast sweep to find open ports, then a focused, deeper scan on just those ports.

## Key flags

- `-sC`: run the default NSE script set (safe, enumeration-focused).
- `-sV`: probe open ports to determine service and version.
- `-p-`: scan all 65,535 TCP ports (default is the top 1,000).
- `-p 22,80,445`: scan a specific list of ports.
- `--min-rate 1000`: send at least this many packets per second (speeds up large scans).
- `-sU`: UDP scan (slow; use a small port list).
- `-Pn`: skip host discovery, treat the host as up (use when ICMP is filtered).
- `-oA name`: write results in all three formats (`.nmap`, `.gnmap`, `.xml`) with the given basename.
- `-A`: aggressive, runs `-sC -sV -O --traceroute` in one flag.

## Commands

A fast scan of all TCP ports, then a detailed scan of only the open ones:

```bash
# 1. Fast sweep: every TCP port, just find what's open
nmap -p- --min-rate 1000 -T4 TARGET -oA scans/all-ports

# 2. Pull the open ports out and scan them in depth
ports=$(grep -oP '\d+/open' scans/all-ports.gnmap | cut -d/ -f1 | paste -sd,)
nmap -p "$ports" -sC -sV TARGET -oA scans/deep
```

UDP top ports (slow, so keep the list short):

```bash
nmap -sU --top-ports 50 TARGET -oA scans/udp
```

Scan a whole range for a single service, output grep-able:

```bash
nmap -p 445 --open 10.10.10.0/24 -oG - | grep open
```

## Workflow

1. Confirm the target is in scope before scanning anything.
2. Fast full-port TCP sweep to find open ports.
3. Deep `-sC -sV` scan on only the open ports.
4. Note service versions and feed each interesting service into its own tool (web to a content scanner, SMB to an SMB enumerator, and so on).
5. Save all output (`-oA`) so the evidence is in the report.

## Notes

`-sC` runs the *default* script category, which is safe and mostly read-only, but still touches the service. Scanning is noisy and will show up in the target's logs: expected on an authorised test, but keep the scope and timing in your notes. A closed or filtered result is evidence too: record it.
