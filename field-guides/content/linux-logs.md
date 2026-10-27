# Linux logs

Visual reference for Linux on cases: where each log lives on Debian and Red Hat families, reading auth logs and the journal, auditd rules and records, shell history and its gaps, the persistence spots to check, and a first-response triage. Hosts, users and IPs below are placeholders.

## The mental model

Most services log to the **systemd journal**, which `rsyslog` may also write out as text files under `/var/log`. **auditd** records kernel-level events (process execution, file access, syscalls) if rules are loaded. Shell history is a convenience, not a log: it's per user, written on exit, and easy to switch off.

```flow
sshd, sudo, cron[app]{server} --> systemd journal[data]{log} --rsyslog--> /var/log text files[storage]{log} --> Forwarder / agent[mgmt]{db}
Kernel[compute]{sensor} --audit rules--> auditd[security]{shield} --> /var/log/audit/audit.log[storage]{log} --> Forwarder / agent[mgmt]{db}
```

```terms
journald :: systemd's binary log. Read it with `journalctl`. Persistent only if `/var/log/journal` exists; otherwise it's lost on reboot.
rsyslog :: Writes journal and syslog messages to text files and forwards them over the network.
auditd :: The Linux audit daemon. Logs what its rules ask for: commands run, files touched, privilege changes.
auid :: Audit user ID: the user who originally logged in. It survives `sudo` and `su`, so it tells you who really ran a command.
wtmp / btmp / lastlog :: Binary records of logins, failed logins and each user's last login. Read with `last`, `lastb`, `lastlog`.
utmp :: Who is logged in right now (`who`, `w`).
```

## Where things are

| What | Debian / Ubuntu | RHEL / Rocky / Amazon Linux |
| --- | --- | --- |
| Authentication, sudo, SSH | `/var/log/auth.log` | `/var/log/secure` |
| General system messages | `/var/log/syslog` | `/var/log/messages` |
| Cron | `/var/log/syslog` (or `cron.log`) | `/var/log/cron` |
| Package installs | `/var/log/dpkg.log`, `/var/log/apt/history.log` | `/var/log/dnf.log`, `/var/log/yum.log` |
| Kernel | `/var/log/kern.log`, `dmesg` | `/var/log/messages`, `dmesg` |
| Audit | `/var/log/audit/audit.log` | `/var/log/audit/audit.log` |
| Logins (binary) | `/var/log/wtmp`, `/var/log/btmp`, `/var/log/lastlog` | the same |
| Web servers | `/var/log/nginx/`, `/var/log/apache2/` | `/var/log/nginx/`, `/var/log/httpd/` |

**Watch for:** recent distributions (Debian 12 and later, for example) may not install rsyslog at all, so the text files don't exist and everything is in the journal.

## Authentication

### Reading auth.log / secure

```text
Oct 27 03:12:41 web01 sshd[2211]: Failed password for invalid user admin from 203.0.113.50 port 51122 ssh2
Oct 27 03:14:02 web01 sshd[2290]: Accepted publickey for deploy from 198.51.100.7 port 40112 ssh2: ED25519 SHA256:AbC...
Oct 27 03:14:30 web01 sudo: deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/bash
Oct 27 03:15:10 web01 useradd[2402]: new user: name=backup2, UID=0, GID=0, home=/root, shell=/bin/bash
```

| Message | Means |
| --- | --- |
| `Failed password for invalid user` | Guessing usernames that don't exist |
| `Failed password for <user>` | Wrong password for a real user |
| `Accepted password` / `Accepted publickey` | Successful SSH login, and how. The key's fingerprint identifies which key |
| `sudo: <user> : … COMMAND=` | A command run with sudo, and as whom |
| `sudo: … authentication failure` / `NOT in sudoers` | Failed privilege escalation |
| `session opened for user root by` | `su` or `sudo` to root |
| `new user:` / `new group:` / `password changed for` | Account changes |

**Read:** `useradd` with `UID=0` creates a second root account. Check `/etc/passwd` for any UID 0 besides `root`.

### Logins

```text
last -F -i | head -30
lastb -F -i | head -30
lastlog | grep -v "Never logged in"
who -a
```

## The journal

| Want | Command |
| --- | --- |
| One service | `journalctl -u ssh` (or `sshd` on RHEL) |
| A time window | `journalctl --since "2026-10-27 03:00" --until "2026-10-27 04:00"` |
| Since a boot | `journalctl -b` (this boot), `journalctl --list-boots` |
| By process or user | `journalctl _PID=2290`, `journalctl _UID=1001` |
| By executable | `journalctl _COMM=sudo` |
| Kernel only | `journalctl -k` |
| As JSON, for export | `journalctl -o json --since today > journal.json` |
| Check integrity | `journalctl --verify` |

## auditd

### A useful rule set

```text
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k privilege
-w /etc/sudoers.d/ -p wa -k privilege
-w /root/.ssh/ -p wa -k ssh_keys
-w /etc/cron.d/ -p wa -k persistence
-w /etc/systemd/system/ -p wa -k persistence
-a always,exit -F arch=b64 -S execve -F auid>=1000 -F auid!=4294967295 -k user_exec
-a always,exit -F arch=b64 -S execve -F euid=0 -F auid>=1000 -F auid!=4294967295 -k root_exec
```

**Read:** `-w` watches a path (`-p wa`: writes and attribute changes). `-a … -S execve` logs every command run. `-k` tags records so you can search by key. Public baselines such as the Neo23x0 auditd rules are a good start; tune out noise before you ship them.

### Reading an audit record

One event is several lines sharing the same `msg=audit(<time>:<serial>)`.

```anatomy
type=SYSCALL :: record type: also EXECVE, PATH, CWD, USER_AUTH, USER_CMD…
msg=audit(1793084081.512:4211) :: epoch time and serial: joins the lines of one event
syscall=59 :: execve on x86_64
auid=1001 uid=0 :: logged in as UID 1001, running as root (via sudo)
exe="/usr/bin/curl" :: the program
key="root_exec" :: the rule that matched
```

```text
ausearch -k root_exec --start today -i
ausearch -ua 1001 --start recent -i
ausearch -m USER_AUTH,USER_LOGIN --success no -i
aureport --summary
aureport -x --summary
```

| Command | Answers |
| --- | --- |
| `ausearch -k <key> -i` | Everything a rule caught, with IDs translated to names |
| `ausearch -ua <auid>` | Everything one logged-in user did, even after `sudo` |
| `ausearch -m USER_AUTH --success no` | Failed authentications |
| `aureport -x --summary` | Which executables ran, most often first |

## Shell history

| Where | Notes |
| --- | --- |
| `~/.bash_history`, `/root/.bash_history` | Written when the shell exits. No timestamps unless `HISTTIMEFORMAT` was set |
| `~/.zsh_history` | zsh, usually with timestamps |
| `~/.python_history`, `~/.mysql_history`, `~/.lesshst` | Other interactive tools keep their own |

**Watch for:** attackers clearing or disabling history. Signs include `unset HISTFILE`, `HISTFILE=/dev/null`, `history -c`, `export HISTSIZE=0`, a history file linked to `/dev/null`, or a leading space before commands (with `HISTCONTROL=ignorespace`). auditd `execve` records don't have these gaps.

## Persistence to check

```flow
Cron[app]{function} --> systemd units and timers[app]{server} --> SSH authorized_keys[security]{key} --> Shell startup files[app]{log} --> New users and sudoers[security]{user} --> LD_PRELOAD and PAM[security]{lock}
```

| Where | Look at |
| --- | --- |
| Cron | `crontab -l -u <user>` for every user, `/etc/crontab`, `/etc/cron.d/`, `/etc/cron.{hourly,daily,weekly,monthly}/`, `/var/spool/cron/` |
| systemd | `systemctl list-unit-files --state=enabled`, `systemctl list-timers --all`, new files in `/etc/systemd/system/` and `~/.config/systemd/user/` |
| SSH keys | `~/.ssh/authorized_keys` for every user, including root and service accounts |
| Shell startup | `~/.bashrc`, `~/.profile`, `/etc/profile.d/`, `/etc/bash.bashrc` |
| Accounts | `/etc/passwd` (UID 0, new shells on service accounts), `/etc/sudoers`, `/etc/sudoers.d/` |
| Libraries | `/etc/ld.so.preload`, `LD_PRELOAD` in environment files |
| PAM | Changes under `/etc/pam.d/` and new modules in `/lib/security/` or `/lib/x86_64-linux-gnu/security/` |
| Init and rc | `/etc/rc.local`, `/etc/init.d/` |
| Web shells | New or changed files under web roots, especially `.php`, `.jsp` and `.aspx` |

## First-response triage

```text
date; uptime; hostname
w; last -F -i | head -20
ps auxf
ss -tulpn
ss -tnp state established
ls -la /tmp /var/tmp /dev/shm
find / -xdev -newermt "2026-10-26" -type f \( -perm -u+x -o -name "*.sh" \) 2>/dev/null | head -100
cat /etc/passwd | awk -F: '$3 == 0'
for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u "$u" 2>/dev/null | sed "s/^/$u: /"; done
```

| Command | Answers |
| --- | --- |
| `ps auxf` | Process tree. Look for shells under web servers and odd names |
| `ss -tulpn`, `ss -tnp state established` | Listening ports and live connections, with the process |
| `ls -la /tmp /var/tmp /dev/shm` | World-writable places tools are dropped |
| `find … -newermt` | Executables changed since a date |
| `ls -la /proc/<pid>/exe` | The binary behind a process, even if it was deleted ("(deleted)") |

**Watch for:** collect before you change. Copy logs off the host (or snapshot the disk) before killing processes or rebooting, since the journal may not persist and `/dev/shm` is in memory.

## Queries

### SSH brute force by source (Splunk)

```spl
index=linux sourcetype=linux_secure "Failed password"
| rex "from (?<src>\d+\.\d+\.\d+\.\d+)"
| stats count, dc(user) as users by src, host
| where count > 20
| sort - count
```

### Commands run as root through sudo (Sentinel, Syslog table)

```kql
Syslog
| where TimeGenerated > ago(1d)
| where ProcessName == "sudo" and SyslogMessage has "COMMAND="
| extend RunAs = extract(@"USER=(\S+)", 1, SyslogMessage), Command = extract(@"COMMAND=(.*)$", 1, SyslogMessage)
| project TimeGenerated, HostName, SyslogMessage, RunAs, Command
```

### New accounts on Linux hosts (SecOps)

```udm
metadata.event_type = "USER_CREATION"
principal.platform = "LINUX"
```

Then open the raw log of each hit and look for `UID=0`.

**Tune:** how sshd, sudo and auditd lines parse depends on the collector. Check one event of each in your SIEM first.
