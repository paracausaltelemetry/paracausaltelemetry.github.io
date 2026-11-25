---
tool: Packet capture (tcpdump & Wireshark)
slug: packet-capture
kind: technique
stages: [pre-compromise]
targets: [windows, linux]
category: Sniffing credentials off the wire
platforms: [linux, windows]
services: []
ports: []
tags: [sniffing, credentials, traffic, cleartext, mitm, network]
attack: [T1040, T1557]
summary: Capturing and reading network traffic to pull out the secrets that cross it in the clear — FTP, Telnet, HTTP basic auth, SNMP community strings, and protocol handshakes. tcpdump grabs the packets on a foothold, Wireshark (or net-creds) reads them. Free credentials when a protocol was never encrypted.
references:
  - tcpdump man page | https://www.tcpdump.org/manpages/tcpdump.1.html
  - Wireshark User's Guide | https://www.wireshark.org/docs/wsug_html_chunked/
---

## When to reach for it

You can see traffic — you are on a host that routes it, or on a segment where legacy protocols are in use. Capture it and look for credentials sent in the clear, or protocol material (NetNTLM challenges, SNMP strings) you can take offline. Even a few minutes on a busy link can hand you a login.

## Key flags

- `tcpdump -i eth0`: capture on an interface.
- `-w cap.pcap`: write raw packets to a file to analyse later.
- `-A` / `-X`: print payloads as ASCII / hex+ASCII live.
- `host HOST` / `port 21` / `not port 22`: BPF filters to cut the noise.
- Wireshark: **Follow > TCP Stream**, and display filters like `http.authbasic` or `ftp`.

## Commands

Capture to a file, excluding your own SSH session:

```bash
tcpdump -i eth0 -w cap.pcap 'not port 22'
```

Watch cleartext auth live on legacy ports:

```bash
tcpdump -i eth0 -A 'port 21 or port 23 or port 110'
```

Pull strings and creds from a saved capture:

```bash
strings cap.pcap | grep -iE 'user|pass|login'
```

## Workflow

1. Capture to a `.pcap` on the foothold; keep the filter tight so the file stays small.
2. Move the capture to your box and open it in Wireshark for stream reassembly.
3. Filter for cleartext protocols (FTP, Telnet, HTTP basic, SNMP, LDAP simple bind).
4. Follow the TCP stream of anything interesting to read the full exchange.
5. Reuse recovered credentials, or take captured hashes/handshakes to the cracking note.

## Notes

Only cleartext and crackable material is useful here — TLS traffic shows only metadata without the key. Tools like `net-creds` and `Pcredz` automate credential extraction from a live interface or a pcap, which is faster than reading streams by hand. On a switched network you see only your own traffic unless you are inline; combine with Responder/mitm6 to make hosts talk to you. Capturing traffic may expose third-party data — stay within the engagement scope.
