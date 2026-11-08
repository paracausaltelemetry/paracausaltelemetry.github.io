---
tool: Credential hunting
slug: credential-hunting
kind: technique
stages: [actions-on-objectives]
category: Finding passwords already on the box
platforms: [windows, linux]
services: [all]
tags: [credentials, looting, lazagne, config-files, post-exploitation]
attack: [T1552.001, T1552.002, T1555, T1003]
summary: The next account is usually sitting on the one you own: in a config file, a script, a history file, a saved session or the registry. Hunt it before you reach for an exploit. A reused password here is the quiet path to lateral movement.
references:
  - The Hacker Recipes: credentials | https://www.thehacker.recipes/ad/movement/credentials/
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

## Automate

```bash
lazagne.exe all          # Windows: browsers, Wi-Fi, saved apps
python laZagne.py all     # Linux equivalent
```

## Notes

Reading other users' config, history and credential stores is sensitive even when the file sits under your own foothold, so stay within the agreed scope and record where each credential came from for the report. Every password, key and hash you turn up is loot to handle with the rest of the engagement data, not to reuse beyond the authorised targets.
