---
tool: rpcclient
slug: rpcclient
stages: [pre-compromise]
targets: [windows, linux]
category: MSRPC enumeration over SMB
platforms: [linux, network]
services: [smb, msrpc]
ports: [135, 139, 445]
tags: [enumeration, smb, msrpc, rid cycling, users, active directory, null session]
attack: [T1087.002, T1135, T1069.002]
summary: Talks to the Windows (or Samba) MSRPC interfaces over SMB. With a null or valid session it enumerates users, groups, shares, the password policy and more, and RID-cycles to turn one known account into the whole user list. A classic first move against 139/445 before you have credentials.
references:
  - rpcclient man page | https://www.samba.org/samba/docs/current/man-html/rpcclient.1.html
  - HackTricks — SMB enumeration (null sessions & RID cycling) | https://book.hacktricks.xyz/network-services-pentesting/pentesting-smb
---

## When to reach for it

SMB is open (139/445) and you want to pull directory data straight from the RPC interfaces — users, groups, the password policy — ideally before you have a credential. If a null session is allowed, rpcclient hands you a lot for free; if not, any low-privileged account still works.

## Key flags

- `-U '' -N`: null session (empty user, no password).
- `-U 'DOMAIN\user%Password'`: authenticate with a credential.
- `-c '<command>'`: run one RPC command non-interactively.
- Interactive commands: `enumdomusers`, `enumdomgroups`, `querydominfo`, `getdompwinfo`, `queryuser`, `lookupnames`, `lookupsids`.

## Commands

Null-session user and group enumeration:

```bash
rpcclient -U '' -N HOST -c 'enumdomusers; enumdomgroups; querydominfo'
```

Password policy (useful before spraying):

```bash
rpcclient -U '' -N HOST -c 'getdompwinfo'
```

RID cycling — resolve SIDs to names to recover the user list:

```bash
for rid in $(seq 500 1100); do
  rpcclient -U '' -N HOST -c "lookupsids S-1-5-21-DOMAINSID-$rid" 2>/dev/null
done
```

Details for one user by RID:

```bash
rpcclient -U '' -N HOST -c 'queryuser 0x1f4'
```

## Workflow

1. Try a null session first (`-U '' -N`); if refused, use any credential you have.
2. `enumdomusers` and `enumdomgroups` for the account picture.
3. `getdompwinfo` to read the lockout threshold before you spray.
4. If direct enumeration is blocked, RID-cycle with `lookupsids` to rebuild the user list.
5. Feed valid usernames into Kerbrute, spraying or the Kerberos attacks.

## Notes

Null sessions are rare on modern Windows but common on Samba and older/misconfigured hosts. The domain SID for RID cycling comes from `lsaquery` or any `lookupnames` result. enum4linux-ng wraps these same RPC calls into one friendly report; rpcclient is the manual, surgical version when you want a specific query or a tight loop.
