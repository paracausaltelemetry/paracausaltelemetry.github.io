---
tool: Shell upgrade (TTY)
slug: shell-upgrade
kind: technique
stages: [installation]
category: Stabilising a caught shell
platforms: [linux, windows]
services: []
ports: []
tags: [tty, shell-stabilisation, post-exploitation, foothold]
attack: [T1059]
summary: Turning the dumb shell you just caught into a usable one — job control, tab completion, arrow keys, and a window size that does not break full-screen tools. The first thing to do after catching a Linux reverse shell.
references:
  - ropnop: upgrading simple shells to fully interactive TTYs | https://blog.ropnop.com/upgrading-simple-shells-to-fully-interactive-ttys/
---

## When to reach for it

You caught a reverse shell and it is painful: Ctrl-C kills it, there is no tab completion, and `sudo`, `ssh` or `vi` misbehave. Upgrade it to a proper TTY before you go further.

## Linux: full TTY upgrade

```bash
# 1. Spawn a PTY (whichever is present on the target)
python3 -c 'import pty;pty.spawn("/bin/bash")'
# or: script -qc /bin/bash /dev/null

# 2. Background the shell, fix your local terminal, foreground it again
#    (type each line; Ctrl-Z after the first)
export TERM=xterm
# Ctrl-Z
stty raw -echo; fg
# press Enter twice

# 3. Match the rows/cols to your terminal (run `stty size` in a local shell first)
stty rows 50 cols 200
```

## Linux: quick improvements (when a full TTY will not cooperate)

```bash
# A better prompt and basic line editing without a full PTY
export SHELL=/bin/bash; export TERM=xterm-256color
# If stty is unavailable, at least stop output wrapping oddly
exec /bin/bash -i
```

## Windows

```powershell
# Windows has no TTY to upgrade the same way. For an interactive experience,
# move off the netcat shell onto a proper channel once you have creds/a hash:
#   - evil-winrm (WinRM)         - see the Evil-WinRM guide
#   - a Meterpreter session      - see the Metasploit guide
# From the dumb shell, confirm who you are and plan that move:
whoami /all
```

## Notes

Do the `stty raw -echo; fg` dance exactly — a wrong order leaves your local terminal broken (fix it with `reset` or `stty sane`). Set `rows`/`cols` or full-screen tools (`vi`, `less`, `tmux`) draw garbage. On Windows, do not fight the dumb shell — pivot to WinRM or Meterpreter as soon as you have a credential or hash.
