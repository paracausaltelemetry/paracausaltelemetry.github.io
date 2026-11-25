---
tool: mitm6
slug: mitm6
stages: [pre-compromise]
targets: [windows]
category: IPv6 DNS takeover and relay
platforms: [linux, network]
services: [ldap, smb, http]
ports: [389, 445, 88]
tags: [ipv6, relay, mitm, wpad, ntlm, active directory, coercion]
attack: [T1557, T1200, T1187]
summary: Abuses the fact that Windows prefers IPv6 and asks for a DHCPv6 lease nobody answers. mitm6 answers, becomes the clients' DNS server, and poisons name lookups (classically WPAD) to coerce authentication, which you relay with ntlmrelayx to LDAP or SMB. The quiet IPv6 cousin of Responder, and a reliable first move in a default AD network.
references:
  - mitm6 on GitHub | https://github.com/dirkjanm/mitm6
  - dirkjanm — mitm6 write-up | https://blog.fox-it.com/2018/01/11/mitm6-compromising-ipv4-networks-via-ipv6/
---

## When to reach for it

You are on an internal segment with a default Active Directory and want credentials or a relay without a password. IPv6 is on and unmanaged on almost every Windows network, so mitm6 wins the DHCPv6 race, hands clients a DNS server (you), and turns their name lookups into authentication you can relay.

## Key flags

- `-d DOMAIN`: only spoof replies for this victim domain (keep the blast radius small).
- `-i eth0`: the interface to listen on.
- `--ignore-nofqdn`: answer queries that are not fully qualified.
- Relay side (`ntlmrelayx.py`): `-6` (listen on IPv6), `-wh wpad` (serve a fake WPAD), `-t ldaps://DC` (relay target), `--delegate-access` / `--add-computer`.

## Commands

Start the IPv6 DNS takeover, scoped to the target domain:

```bash
mitm6 -d DOMAIN -i eth0
```

Relay the coerced auth to LDAPS and grant yourself delegation / a computer:

```bash
ntlmrelayx.py -6 -t ldaps://HOST -wh wpad.DOMAIN --delegate-access
```

Relay to SMB on a host where SMB signing is off:

```bash
ntlmrelayx.py -6 -t smb://HOST -wh wpad.DOMAIN -smb2support
```

## Workflow

1. Confirm IPv6 is unmanaged (no DHCPv6 server answering).
2. Start `mitm6 -d DOMAIN`, scoped so you only poison the intended domain.
3. In another terminal start `ntlmrelayx.py -6` with a WPAD host and an LDAPS/SMB target.
4. Wait for a workstation or a logged-on user to renew — WPAD or a name lookup coerces auth.
5. Harvest the relayed access: delegation, a new computer account, or dumped hashes.

## Notes

Only relay to targets where it pays: LDAP/LDAPS on a DC for delegation and ACL edits, or SMB where signing is off. Run mitm6 for minutes, not hours — it answers every client's DNS and will disrupt the network if left unscoped, so always pass `-d`. It pairs naturally with Responder (IPv4) and the NTLM relay note; coercion tools like PetitPotam can force the authentication instead of waiting for it.
