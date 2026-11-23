---
tool: Credential hunting
slug: credential-hunting
kind: technique
stages: [post-compromise]
targets: [windows, linux]
category: Finding passwords already on the box
platforms: [windows, linux]
services: [all]
tags: [credentials, looting, lazagne, config-files, post-exploitation]
attack: [T1552.001, T1552.002, T1555, T1003]
summary: The next account is usually sitting on the one you own: in a config file, a script, a history file, a saved session or the registry. Hunt it before you reach for an exploit. A reused password here is the quiet path to lateral movement.
references:
  - The Hacker Recipes: credential dumping | https://www.thehacker.recipes/ad/movement/credentials/dumping/
  - HackTricks post-exploitation | https://book.hacktricks.wiki/en/windows-hardening/windows-local-privilege-escalation/index.html
---

## When to reach for it

Right after any foothold, on either OS, before escalating the hard way. Developers and admins leave passwords in plaintext constantly: connection strings, deployment scripts, saved RDP/WinRM sessions, cloud CLIs. One find often reuses straight into a more privileged account.

## Linux

Grep the obvious places, then read what runs automatically and what the user typed:

```bash
grep -rniE 'password|passwd|secret|api[_-]?key' /var/www /etc /opt /home 2>/dev/null
cat ~/.bash_history ~/.*_history 2>/dev/null; cat ~/.ssh/id_* 2>/dev/null
find / -name '*.conf' -o -name '*.config' -o -name '.env' 2>/dev/null
```

Check mounted shares, database config (`wp-config.php`, `settings.py`), cron scripts and `~/.aws`/`~/.config` credential stores.

## Windows

Search files and the registry, and pull saved credentials:

```cmd
findstr /si password *.xml *.ini *.config *.txt
reg query HKLM /f password /t REG_SZ /s
cmdkey /list
```

PowerShell history (`ConsoleHost_history.txt`), `Unattend.xml` / `sysprep.inf`, saved PuTTY/WinSCP sessions and the Windows Credential Manager are high-yield. Run `netexec` or `winPEAS` to automate the sweep.

## Find interesting files by type

Grepping for the word `password` misses a lot. Hunt by file type too: private keys, password databases, configs, backups and office documents are where secrets hide. Cast the net by extension, then open the hits.

```bash
# Linux: keys, vaults and databases
find / \( -name 'id_rsa*' -o -name '*.pem' -o -name '*.ppk' -o -name '*.key' -o -name '*.kdbx' -o -name '*.sqlite' \) 2>/dev/null
# configs, env files and backups
find / \( -name '*.conf' -o -name '.env' -o -name '*.bak' -o -name '*.old' -o -name '*.config' \) 2>/dev/null | grep -v '/proc/'
# documents on shares and home dirs
find /home /srv /opt -iregex '.*\.\(docx?\|xlsx?\|pdf\|ps1\|yml\)' 2>/dev/null
```

```powershell
# Windows: by extension, including interesting filenames
Get-ChildItem C:\ -Recurse -Include *.kdbx,*.ppk,*.pem,*.key,*.rdp,*.config,*pass*,*cred* -EA SilentlyContinue | Select FullName
```

```cmd
:: Windows cmd equivalent
dir /s /b C:\*.kdbx C:\*.ppk C:\*.config C:\*unattend*.xml 2>nul
```

A found KeePass `.kdbx`, SSH key or `.ppk` is cracked offline (`keepass2john`, `ssh2john`, `putty2john`), see the password-attacks map.

## Automate

```bash
lazagne.exe all          # Windows: browsers, Wi-Fi, saved apps
python laZagne.py all     # Linux equivalent
```

## Notes

Reading other users' config, history and credential stores is sensitive even when the file sits under your own foothold, so stay within the agreed scope and record where each credential came from for the report. Every password, key and hash you turn up is loot to handle with the rest of the engagement data, not to reuse beyond the authorised targets.
