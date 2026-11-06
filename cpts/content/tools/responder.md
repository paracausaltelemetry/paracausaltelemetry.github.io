---
tool: Responder
slug: responder
stages: [delivery]
category: LLMNR/NBT-NS poisoning
platforms: [linux, network]
services: [smb, http, ldap]
ports: [137, 138, 139, 445, 5355, 5353]
tags: [poisoning, credential-capture, ntlm, relay, mitm]
attack: [T1557.001, T1187]
summary: Answers LLMNR, NBT-NS and mDNS name-resolution requests on the local segment, so a host looking for a mistyped or missing name connects to you instead and hands over an NTLMv2 hash. A top source of first credentials on an internal test.
references:
  - Responder GitHub | https://github.com/lgandx/Responder
  - Responder wiki | https://github.com/lgandx/Responder/wiki
---

## When to reach for it

You are on the internal network with no credentials. Windows hosts fall back to LLMNR/NBT-NS when DNS fails (a typo, a stale share), broadcasting the name they want. Responder answers, the host authenticates to you, and you capture a crackable NTLMv2 hash — passively, just by listening.

## Key flags

- `-I eth0` — the interface to listen on (required).
- `-A` — analyse mode: watch and log requests without answering (safe first look).
- `-w` — start the WPAD proxy (catches HTTP auth too).
- `-f` — fingerprint the hosts that talk to you.
- `-v` — verbose.
- Config: edit `Responder.conf` to turn specific servers (SMB, HTTP) off, e.g. when relaying instead of capturing.

## Commands

Analyse first — see who is asking for names, answer nothing:

```bash
sudo responder -I eth0 -A
```

Poison and capture hashes:

```bash
sudo responder -I eth0 -wf
```

Captured hashes are written under `logs/` and printed to screen; crack them offline:

```bash
hashcat -m 5600 captured-ntlmv2.txt /usr/share/wordlists/rockyou.txt
```

## Workflow

1. Run in analyse mode (`-A`) to confirm LLMNR/NBT-NS traffic and gauge noise.
2. Switch to poisoning and let it collect NTLMv2 hashes as hosts mis-resolve names.
3. Take the hashes offline to a cracker — do not brute force online.
4. If SMB signing is off on targets (check with NetExec), consider relaying the authentication instead of cracking it (turn Responder's SMB/HTTP servers off and use ntlmrelayx).
5. Record the account, source host and time for the report.

## Notes

Poisoning is intrusive and can break legitimate name resolution briefly — keep it inside the agreed window and scope, and prefer analyse mode until you are sure. NTLMv2 hashes are *not* pass-the-hash material; they must be cracked, or relayed. Machine-account hashes (`$`) rarely crack — relay those instead.
