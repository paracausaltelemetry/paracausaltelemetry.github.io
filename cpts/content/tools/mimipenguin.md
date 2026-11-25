---
tool: mimipenguin
slug: mimipenguin
stages: [post-compromise]
targets: [linux]
category: Dumping cleartext credentials from Linux memory
platforms: [linux]
services: []
ports: []
tags: [credentials, linux, memory, post-exploitation, dumping]
attack: [T1003.007, T1555]
summary: The Linux answer to Mimikatz's cleartext dump. With root, it scrapes the memory of processes that hold a user's password — the display manager, sshd, sudo, VSFTPd — and recovers the plaintext. A quick way to turn a fresh root shell into the actual password behind it, ready to reuse elsewhere.
references:
  - mimipenguin on GitHub | https://github.com/huntergregal/mimipenguin
---

## When to reach for it

You just became root on a Linux host and want the cleartext passwords sitting in memory — the logged-in user's desktop password, an SSH or sudo password typed recently. mimipenguin reads them straight out of process memory, giving you credentials that are almost always reused on other systems.

## Key flags

- Run as root — it reads `/proc/<pid>/mem`, which needs privilege.
- `mimipenguin.sh`: the shell version (greps known process memory regions).
- `mimipenguin.py`: the Python version, with more target processes.
- `2john`-style output is not produced — these are already plaintext.

## Commands

Run the shell version as root:

```bash
sudo ./mimipenguin.sh
```

The Python version (broader process coverage):

```bash
sudo python3 mimipenguin.py
```

## Workflow

1. Confirm you are root (it cannot read other processes' memory otherwise).
2. Run it soon after escalating, while sessions and the display manager are live.
3. Note every plaintext it recovers and who it belongs to.
4. Spray those passwords across the estate — desktop passwords are heavily reused.
5. For broader on-host secrets (browsers, vaults), follow with LaZagne.

## Notes

mimipenguin only works where a process is still holding the password in memory, so it is hit-or-miss and best run on a live, logged-in box right after you get root. It complements the file-based hunting in LaZagne and credential-hunting: this one targets live memory, those target stored secrets. On modern GNOME/systemd setups some sources are gone, but SSH and sudo captures are still common wins.
