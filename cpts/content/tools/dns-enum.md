---
tool: DNS enumeration
slug: dns-enum
kind: technique
stages: [pre-compromise]
targets: [windows, linux]
category: Records, subdomains and zone transfers
platforms: [linux, network]
services: [dns]
ports: [53]
tags: [enumeration, dns, zone transfer, subdomains, records]
attack: [T1590.002, T1596, T1046]
summary: Pulling structure out of DNS: resolve the standard records, try a zone transfer that hands you the whole zone at once, and brute-force subdomains when it does not. A misconfigured DNS server leaking its zone is one of the fastest wins in external and internal enumeration.
references:
  - dig man page | https://linux.die.net/man/1/dig
  - dnsenum | https://github.com/fwaeytens/dnsenum
---

## When to reach for it

Port 53 is open, or you have a domain name and want its hosts. Start with the obvious records, then attempt a zone transfer (AXFR) — if the server allows it, you get every record without guessing. If it refuses, fall back to subdomain brute forcing.

## Key flags

- `dig @HOST DOMAIN <type>`: query a specific server for a record type.
- `axfr`: the zone-transfer "record type" — dumps the whole zone if allowed.
- `-t`: record type for `host`/`dnsenum` (`A`, `MX`, `NS`, `TXT`, `SRV`).
- `--enum`: dnsenum's all-in-one mode (records, transfer, brute force).
- `-f wordlist`: subdomain list for brute forcing.

## Commands

Zone transfer — the whole zone in one request if misconfigured:

```bash
dig @HOST DOMAIN axfr
```

The common record types:

```bash
dig @HOST DOMAIN any
dig @HOST MX DOMAIN
dig @HOST TXT DOMAIN
```

Automated sweep (records + AXFR + subdomain brute force):

```bash
dnsenum --enum DOMAIN --dnsserver HOST \
  -f /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
```

AD service records (locate DCs and services):

```bash
dig @HOST SRV _ldap._tcp.dc._msdcs.DOMAIN
```

## Workflow

1. Query `NS` to find the authoritative servers for the domain.
2. Try `axfr` against each one — a success dumps the lot.
3. If AXFR is refused, brute-force subdomains with `dnsenum` or `gobuster dns`.
4. In an AD environment, query `_msdcs` SRV records to locate domain controllers.
5. Resolve every discovered host and feed new IPs back into the port scan.

## Notes

AXFR should be restricted to secondary name servers; when it is not, it is a free map of the network. Internal AD DNS is especially rich — SRV records point straight at domain controllers, Kerberos and LDAP. `fierce` and `gobuster dns` cover the brute-force side; `dig` is the precise instrument when you want one record from one server.
