---
tool: Impacket
slug: impacket
stages: [actions-on-objectives]
category: Windows and AD protocol tooling
platforms: [linux, windows, network]
services: [smb, kerberos, ldap, mssql, rpc]
ports: [88, 135, 139, 445, 389, 1433]
tags: [credential-dumping, lateral-movement, kerberos, dcsync, pass-the-hash]
attack: [T1003.006, T1558.003, T1550.002, T1021.002]
summary: A toolbox of Python scripts that speak Windows protocols directly. secretsdump pulls hashes, the exec scripts (psexec, wmiexec) give remote shells, and GetUserSPNs/GetNPUsers pull Kerberos tickets to crack. The backbone of Active Directory attacks from Linux.
references:
  - Impacket GitHub | https://github.com/fortra/impacket
  - Examples | https://github.com/fortra/impacket/tree/master/examples
---

## When to reach for it

You have a domain credential or hash and a goal: dump more credentials, move to another host, or get crackable Kerberos tickets. Impacket does each over the wire from your Linux box, no agent on the target.

## Key flags

Credentials are given as `DOMAIN/user:password@HOST`, or with `-hashes LM:NT` for pass-the-hash.

- `secretsdump.py`: dump SAM, LSA and, with the right rights, the whole domain via DCSync (`-just-dc`).
- `psexec.py` / `wmiexec.py` / `smbexec.py`: remote command execution (psexec drops a service; wmiexec is quieter).
- `GetUserSPNs.py -request`: Kerberoast: pull service tickets for offline cracking.
- `GetNPUsers.py`: AS-REP roast accounts that don't require pre-auth.
- `-k -no-pass`: use a Kerberos ticket from the environment (`KRB5CCNAME`).

## Commands

Dump secrets from a host (local admin), or the whole domain from a DC (DCSync rights):

```bash
secretsdump.py CORP/administrator:'Passw0rd!'@HOST
secretsdump.py -just-dc CORP/administrator:'Passw0rd!'@DC01
```

Pass-the-hash to a shell on a host where the hash is admin:

```bash
wmiexec.py -hashes :31d6cfe0d16ae931b73c59d7e0c089c0 CORP/administrator@HOST
```

Kerberoast: request service tickets to crack offline:

```bash
GetUserSPNs.py -request -dc-ip TARGET CORP/jsmith:'Winter2026!'
hashcat -m 13100 kerberoast.hash /usr/share/wordlists/rockyou.txt
```

## Workflow

1. From a valid domain credential, enumerate SPNs and AS-REP-roastable accounts; crack what comes back offline.
2. Where a credential is local admin (NetExec told you), dump secrets for more material.
3. Reuse hashes with the exec scripts (pass-the-hash) to move laterally: prefer wmiexec over psexec for noise.
4. With Domain Admin or DCSync rights, `secretsdump -just-dc` for the krbtgt and the domain.
5. Record every credential, its source and the technique for the report.

## Notes

psexec is reliable but noisy (creates a service, writes to disk); wmiexec and smbexec are quieter. NTLM hashes are pass-the-hash material; Kerberos tickets (roasting output) must be cracked. DCSync and krbtgt extraction are high-impact: only with explicit authorisation, and documented carefully.
