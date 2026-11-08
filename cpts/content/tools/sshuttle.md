---
tool: sshuttle
slug: sshuttle
stages: [command-and-control]
category: Tunnelling and pivoting
platforms: [linux]
services: [ssh]
ports: [22]
tags: [pivoting, tunnelling, proxy, vpn, ssh]
attack: [T1090, T1572]
summary: A poor man's VPN over plain SSH. Point it at a host you can SSH to and it routes a whole subnet through that host, so your tools reach the internal network with no proxychains. Reach for it when you have SSH to a dual-homed box and want a quick pivot.
references:
  - sshuttle docs | https://sshuttle.readthedocs.io/
  - sshuttle README | https://github.com/sshuttle/sshuttle
---

## When to reach for it

You have SSH to a host that can see a network you cannot. sshuttle forwards TCP (and optionally DNS) for a chosen subnet over that SSH session, so nmap, netexec and a browser reach the internal range directly, no SOCKS wrapper in front. It needs only a normal SSH login and Python on the far side, which makes it the fastest pivot to stand up when you have credentials but cannot upload an agent like [ligolo-ng](#tool-ligolo-ng).

## Key flags

- `-r user@HOST`: the SSH host to tunnel through (a name or an IP).
- the trailing subnet(s): what to route, e.g. `172.16.5.0/24`, or `0.0.0.0/0` for everything.
- `--dns`: resolve DNS through the remote side too.
- `-x SUBNET`: exclude a range (keep your own routes out of the tunnel).
- `--ssh-cmd 'ssh -i key.pem'`: use a key or custom SSH options.
- `-v`: verbose, to see what is being routed.

## Commands

Route one internal subnet through the foothold:

```bash
sshuttle -r user@HOST 172.16.5.0/24
```

Tunnel everything, DNS included, excluding your own LAN:

```bash
sshuttle -r user@HOST 0.0.0.0/0 --dns -x ATTACKER_IP/24
```

Pivot using a key rather than a password:

```bash
sshuttle -r user@HOST --ssh-cmd 'ssh -i id_rsa' 172.16.5.0/24
```

## Workflow

1. Confirm you can SSH to the dual-homed host and note its internal subnet.
2. Start sshuttle with that subnet; leave the session running.
3. Run your normal tools against the internal range, no proxychains needed.
4. Add `--dns` if internal name resolution matters; `-x` to keep local routes out.
5. Stop sshuttle to tear the route down cleanly when you finish.

## Notes

sshuttle carries TCP and DNS, not ICMP or UDP, so a ping sweep will not cross it; use a TCP scan through the tunnel instead. It needs Python on the remote host and does not require root there for a basic forward. Compared with [ligolo-ng](#tool-ligolo-ng) it uploads nothing and rides your existing SSH, but it is TCP-only. Keep the tunnel and its routes inside the engagement scope and remove them when done.
