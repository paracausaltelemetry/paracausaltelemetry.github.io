---
tool: Service enumeration
slug: service-enum
kind: technique
stages: [reconnaissance]
category: Port by port enumeration cheat sheet
platforms: [linux, network]
services: [ftp, ssh, smtp, dns, smb, snmp, ldap, mssql, nfs, mysql, rdp, winrm]
ports: [21, 22, 25, 53, 139, 445, 161, 389, 1433, 2049, 3306, 3389, 5985]
tags: [enumeration, smb, ldap, snmp, nfs, rpc, banner]
attack: [T1046, T1087, T1135]
summary: After the port scan, the first move on each open service. What to run against FTP, SSH, SMTP, DNS, SMB, SNMP, LDAP, MSSQL, NFS and the rest to pull users, shares, versions and config.
references:
  - HackTricks pentesting ports | https://book.hacktricks.wiki/en/network-services-pentesting/index.html
  - NSE scripts | https://nmap.org/nsedoc/
---

## FTP (21), SSH (22), SMTP (25)

```bash
# FTP: try anonymous, list, grab files
nmap -p21 --script ftp-anon,ftp-syst TARGET
ftp TARGET            # user: anonymous, pass: anything
# SMTP: enumerate valid users
nmap -p25 --script smtp-commands,smtp-enum-users TARGET
smtp-user-enum -M VRFY -U users.txt -t TARGET
```

## DNS (53)

```bash
dig axfr @TARGET domain.local        # zone transfer
dnsenum domain.local --dnsserver TARGET
```

## SMB (139/445) and RPC

```bash
nmap -p445 --script "smb-enum-shares,smb-enum-users,smb-os-discovery" TARGET
netexec smb TARGET -u '' -p '' --shares --users --pass-pol   # null session
smbclient -N -L //TARGET/                 # list shares, no creds
smbclient -N //TARGET/share               # connect
rpcclient -U '' -N TARGET                 # then: enumdomusers, querydominfo
enum4linux-ng -A TARGET
```

## SNMP (161/udp), LDAP (389)

```bash
snmpwalk -v2c -c public TARGET            # try public/private community strings
onesixtyone -c /usr/share/seclists/Discovery/SNMP/common-community-strings.txt TARGET
ldapsearch -x -H ldap://TARGET -s base namingcontexts    # find base DN
ldapsearch -x -H ldap://TARGET -b "DC=domain,DC=local"   # dump objects
```

## NFS (2049), MSSQL (1433), MySQL (3306), RDP (3389), WinRM (5985)

```bash
showmount -e TARGET                       # NFS exports, then mount -t nfs
netexec mssql TARGET -u sa -p 'Password1' --local-auth
mysql -h TARGET -u root -p
netexec rdp TARGET -u users.txt -p 'Password1'
netexec winrm TARGET -u user -p 'pass'    # (Pwn3d!) means you can get a shell
```

## Notes

Always try the unauthenticated angle first: anonymous FTP, SMB null sessions, default SNMP community strings, LDAP anonymous bind. Record every version string, every user and every share, then feed each into its own attack. [NetExec](/cpts/#tool-netexec) carries most of the SMB/LDAP/MSSQL/WinRM load once you have a credential.
