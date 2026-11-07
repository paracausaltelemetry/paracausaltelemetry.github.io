---
tool: AutoRecon
slug: autorecon
stages: [reconnaissance]
category: Automated recon orchestration
platforms: [linux, network]
services: [all]
ports: []
tags: [enumeration, automation, scanning, recon, orchestration]
attack: [T1046, T1595.001, T1087]
summary: A multi-target recon orchestrator. It runs the port scan, then fires the right enumeration tool at each service it finds and files the output per host and port. Use it to get broad, structured coverage early so you can read while it works.
references:
  - AutoRecon README | https://github.com/Tib3rius/AutoRecon
---

## When to reach for it

You have one or more in-scope hosts and want thorough first-pass enumeration without typing every command. AutoRecon port-scans each target, then launches service-appropriate tools (Nmap scripts, web directory brute force, SMB and DNS enumeration, and more) and saves everything in a tidy per-host tree. It is a time-saver for breadth, not a substitute for reading the output and following leads by hand.

## Key flags

- `autorecon TARGET [TARGET ...]`: one or more hosts, CIDRs or a file.
- `-t targets.txt`: read targets from a file.
- `-o loot`: output directory root.
- `--single-target`: skip the top-level host directory for one target.
- `--heartbeat 30`: status line interval in seconds.
- `--nmap-append="--max-rate 500"`: pass extra options to the Nmap scans (throttle here).
- `--only-scans-dir`: write only the scans, no report scaffolding.
- `--exclude-tags`: skip classes of scan (e.g. heavy or intrusive ones).

## Commands

Enumerate a single host into a named output directory:

```bash
autorecon TARGET -o loot --single-target
```

Run a list of targets and throttle the scanning:

```bash
autorecon -t targets.txt --nmap-append="--max-rate 500"
```

Read the structured output it produces:

```bash
# per-host tree: scans/ (tool output), report/, loot/, exploit/
ls -R loot/TARGET/scans
cat loot/TARGET/scans/_full_tcp_nmap.txt
```

## Workflow

1. Confirm the targets are in scope, then start AutoRecon and let it run.
2. While it works, read the port scan and the first service results as they land.
3. Follow the interesting threads by hand: the automation covers breadth, you add depth.
4. Use the per-port notes and the manual-commands file it writes as a checklist.
5. Re-run or extend with targeted tools where the automated pass looked thin.

## Notes

AutoRecon is loud and parallel: it opens many scans at once, which can hammer a fragile host or trip rate limits, so throttle with `--nmap-append` and mind the scope. It wraps other tools, so it is only as good as what is installed and the wordlists present. On the exam, treat it as a head start and a checklist, not the answer: you still need to interpret every result and know the manual command behind each automated step. Start it early so the output is waiting when you are.
