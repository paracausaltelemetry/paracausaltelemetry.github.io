---
tool: KeyTabExtract
slug: keytabextract
stages: [post-compromise]
targets: [linux, windows]
category: Pulling hashes out of Kerberos keytab files
platforms: [linux]
services: [kerberos]
ports: []
tags: [active directory, kerberos, keytab, credentials, pass-the-hash, cracking]
attack: [T1003.007, T1558, T1550.002]
summary: A keytab file on a domain-joined Linux host stores the keys an account uses to authenticate with Kerberos. KeyTabExtract reads a .keytab and recovers the NTLM and AES keys inside — so a keytab you can read turns into a Pass-the-Hash, a forged ticket, or a hash to crack for the plaintext password.
references:
  - KeyTabExtract on GitHub | https://github.com/sosdave/KeyTabExtract
  - MIT Kerberos — kinit | https://web.mit.edu/kerberos/krb5-latest/doc/user/user_commands/kinit.html
---

## When to reach for it

You found a keytab (`find / -name '*keytab*'`, or referenced inside a cron script) and have read access to it. Importing it with `kinit` lets you *use* the account over Kerberos, but KeyTabExtract goes further: it dumps the account's NTLM and AES keys, which you can pass, forge tickets with, or crack to recover the actual password for logging in locally.

## Key flags

- Takes a single argument: the path to the `.keytab` file.
- Reports the realm, service principal, and each key type held in the file.
- Recovers the RC4/NTLM hash and the AES-128 / AES-256 keys when present.
- A keytab can hold several principals and key types merged together.

## Commands

```bash
python3 keytabextract.py /opt/svc_user.keytab
```

Inspect what a keytab contains first, with the native tools:

```bash
klist -k -t /opt/svc_user.keytab
```

## Workflow

1. Locate a readable keytab and confirm its principal with `klist -k -t`.
2. Run KeyTabExtract to pull the NTLM and AES keys.
3. Pass the NTLM hash straight away with [Impacket](/cpts/#tool-impacket), [NetExec](/cpts/#tool-netexec) or [Evil-WinRM](/cpts/#tool-evil-winrm).
4. Or crack the NTLM hash with [Hashcat](/cpts/#tool-hashcat) to get the plaintext and log in on the Linux host itself.
5. Use the AES keys to forge tickets with [Rubeus](/cpts/#tool-rubeus) or Impacket where RC4 is disabled.

## Notes

The NTLM hash is the quickest win — pass it immediately, or crack it (often a weak service-account password). AES keys matter where the domain has disabled RC4, since a forged ticket must then use AES to be accepted. A keytab's keys only change when the account's password changes, so a stale keytab recovered from a backup or an old host can still be valid. This pairs directly with the [Pass the Ticket (Linux) note](/cpts/#tool-linux-ticket-abuse), which covers finding keytabs and reusing the resulting access.
