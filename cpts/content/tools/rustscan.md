---
tool: RustScan
slug: rustscan
stages: [reconnaissance]
category: Fast port scanning
platforms: [linux, network]
services: [all]
ports: []
tags: [scanning, port-discovery, nmap, fast, recon]
attack: [T1046, T1595.001]
summary: A very fast port sweep that finds the open ports in seconds, then hands them straight to Nmap for version and script scanning. Use it as the front end to Nmap when a full-range scan would otherwise be slow.
references:
  - RustScan README | https://github.com/RustScan/RustScan
  - RustScan wiki | https://github.com/RustScan/RustScan/wiki
---

## When to reach for it

You want every open port on a host without waiting for a full Nmap `-p-`. RustScan sweeps all 65,535 ports fast, then pipes only the open ones into Nmap so the slow version and script scan runs on a short list. It is a speed front end, not a replacement: Nmap still does the enumeration.

## Key flags

- `-a`: target address or CIDR range.
- `-r 1-65535`: port range (default is all ports).
- `-p 80,443,445`: a specific port list.
- `-b 500`: batch size (open sockets at once); lower it on flaky links or tight ulimits.
- `-t 2000`: socket timeout in milliseconds.
- `-u 5000`: raise the file-descriptor ulimit for the run.
- `--`: everything after is passed through to Nmap.
- `-g`: greppable output.

## Commands

Full sweep, then hand the open ports to Nmap for service and default scripts:

```bash
rustscan -a HOST -- -sC -sV -oN rustscan-TARGET.txt
```

Tune the batch size and timeout for a slow or filtered host:

```bash
rustscan -a HOST -b 300 -t 2500 -- -sV
```

Scan a range and write greppable output:

```bash
rustscan -a 10.10.10.0/24 -g
```

## Workflow

1. Run RustScan against the host to get the open ports fast.
2. It passes those ports to Nmap automatically; let the `-sC -sV` run finish.
3. Read the Nmap output as you would a normal scan and pick targets per service.
4. If RustScan misses ports on a filtered host, fall back to a tuned Nmap scan directly.

## Notes

Speed comes from opening many sockets at once, which is loud and can trip rate limits or knock over fragile services, so drop `-b` on anything delicate. The quality of the result is still Nmap's: everything after `--` is Nmap syntax. On the exam, know the plain Nmap equivalent so you are never blocked when RustScan is not installed.
