---
tool: pspy
slug: pspy
stages: [post-compromise]
targets: [linux]
category: Watching processes and cron without root
platforms: [linux]
services: []
ports: []
tags: [linux, privilege escalation, cron, processes, enumeration, monitoring]
attack: [T1057, T1053.003]
summary: Watches every process start on a Linux host in real time, with no root and no need to read restricted files. It is how you catch root's cron jobs, scheduled scripts and service restarts as they fire — the commands, their arguments and any secrets passed on the command line. Often the finding that turns a user shell into root.
references:
  - pspy on GitHub | https://github.com/DominicBreuker/pspy
---

## When to reach for it

You are a low-privileged user on Linux and `crontab -l` shows nothing, but something is clearly running on a schedule (files changing, a service bouncing). pspy uses the kernel's process events to see every exec as it happens, including root's, so you can find a privileged job that runs a script you can write to.

## Key flags

- `-p`: print commands (process events) — the useful default.
- `-f`: also print filesystem events (inotify).
- `-i 1000`: polling interval in milliseconds for the procfs scan.
- `-c`: print the command's working directory and more context.
- Use the static `pspy64` / `pspy32` build so there are no dependencies on the target.

## Commands

Transfer the static binary, make it executable, and watch:

```bash
chmod +x pspy64
./pspy64 -pf -i 1000
```

Quieter, process events only:

```bash
./pspy64 -p
```

## Workflow

1. Get the static `pspy64` onto the host (see the file-transfer notes).
2. Run it and leave it for a few minutes, spanning at least one cron minute boundary.
3. Watch for processes running as UID 0 (root) on a schedule.
4. Note the script or binary that root runs and check whether you can write to it or its PATH.
5. Hijack that file, wait for the next run, and collect your root shell.

## Notes

pspy needs no privileges because it reads `/proc` and subscribes to kernel process events — it cannot be hidden by a root cron that is not world-readable. Watch for secrets leaked on the command line (passwords, tokens) as well as writable targets. It pairs with the Linux privesc note: pspy finds the scheduled job, GTFOBins or a writable-PATH trick weaponises it.
