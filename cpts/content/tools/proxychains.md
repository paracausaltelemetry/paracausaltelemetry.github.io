---
tool: proxychains
slug: proxychains
stages: [misc]
targets: [windows, linux]
category: Routing tools through a SOCKS pivot
platforms: [linux]
services: []
ports: []
tags: [pivoting, socks, proxy, tunnelling, lateral movement]
attack: [T1090.001, T1572]
summary: Forces an ordinary tool's TCP connections through a SOCKS proxy, so nmap, smbclient or Impacket on your box can reach a network they have no route to. It is the glue between a tunnel — a Chisel, ligolo-ng or SSH SOCKS proxy on a foothold — and the tools you already know. No tool rewrites, just a prefix.
references:
  - proxychains-ng | https://github.com/rofl0r/proxychains-ng
  - Ligolo-ng | https://github.com/nicocha30/ligolo-ng
---

## When to reach for it

You have a foothold that can see an internal network, and a SOCKS proxy standing on it (from Chisel, ligolo-ng, Metasploit or `ssh -D`). proxychains makes your local tools send their traffic down that proxy, so you can scan and attack the far side as if you were local.

## Key flags

- `/etc/proxychains4.conf`: the config — add a `socks5 127.0.0.1 1080` line at the end.
- `-f conf`: use a specific config file instead of the global one.
- `strict_chain` / `dynamic_chain`: how it walks a multi-proxy chain.
- `proxy_dns`: resolve names through the proxy (avoid DNS leaks).
- Prefix any command: `proxychains <command>`.

## Commands

Point it at your SOCKS listener (bottom of `/etc/proxychains4.conf`):

```bash
socks5 127.0.0.1 1080
```

Scan the internal network through the pivot (TCP connect, no ping):

```bash
proxychains -q nmap -sT -Pn -n -p 445,3389,5985 10.10.20.0/24
```

Use a credential against an internal host through the proxy:

```bash
proxychains -q netexec smb 10.10.20.25 -u user -p 'Password'
```

## Workflow

1. Stand up a SOCKS proxy on the foothold (Chisel/ligolo-ng/`ssh -D 1080`).
2. Add the `socks5 127.0.0.1 <port>` line to `proxychains4.conf`.
3. Test with a single `proxychains` connection to a known internal host.
4. Run your enumeration and attack tools prefixed with `proxychains`.
5. Prefer `-sT`/full-connect tools — raw-socket scans and ICMP do not traverse SOCKS.

## Notes

SOCKS only carries TCP, so use connect scans (`nmap -sT`) and skip ping sweeps (`-Pn`). Set `proxy_dns` so lookups do not leak onto your own network. proxychains is convenient but slow and brittle for heavy traffic; ligolo-ng's tun interface gives native-speed, routed access without wrapping each command, and is the better choice when the tooling allows it.
