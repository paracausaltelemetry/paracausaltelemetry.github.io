---
tool: Hashcat / John the Ripper
slug: hashcat
stages: [actions-on-objectives]
category: Offline hash cracking
platforms: [linux]
services: []
ports: []
tags: [cracking, hashcat, john, kerberoast, ntlm, wordlist, rules]
attack: [T1110.002]
summary: Where captured hashes turn into passwords. Hashcat is the GPU workhorse; John covers odd formats, CPU cracking and the *2john extractors. The end of the credential-capture chain: Responder loot, Kerberoast tickets, shadow and KeePass files all land here.
references:
  - Hashcat wiki | https://hashcat.net/wiki/
  - Hashcat example hashes (mode table) | https://hashcat.net/wiki/doku.php?id=example_hashes
  - John the Ripper (Jumbo) | https://github.com/openwall/john
---

## When to reach for it

You have a hash and want the password behind it: a NetNTLMv2 from Responder, a Kerberoast or AS-REP ticket, a line from `/etc/shadow`, a dumped NTLM, or a locked KeePass or zip. Cracking runs on your own machine, never the target. Reach for Hashcat on a GPU; reach for John for CPU boxes, unusual formats, and its `*2john` tools that turn a file into a crackable hash.

## Identify the hash first

The mode or format has to match, or it never cracks:

```bash
hashid 'HASH'                         # quick guess
hashcat --example-hashes | grep -i ntlm   # confirm the mode number
# John auto-detects most formats; --format forces one
```

## Hashcat: key flags

- `-m <mode>`: hash type. 1000 NTLM, 5600 NetNTLMv2, 13100 Kerberoast (TGS), 18200 AS-REP, 1800 sha512crypt (`$6$` shadow), 13400 KeePass, 13600 zip.
- `-a <mode>`: attack. `0` wordlist, `3` mask/brute force, `6`/`7` wordlist+mask.
- `-r <rules>`: mutate the wordlist (`best64.rule`, `OneRuleToRuleThemAll.rule`).
- `--username`: the hash file is `user:hash`; strip the user before cracking.
- `--show`: print already-cracked hashes from the potfile.
- `-O` optimised kernels, `-w 3` workload; `--force` only if it refuses to run.

## Hashcat: commands

Straight wordlist with a rule set (the first thing to try):

```bash
hashcat -m 5600 netntlmv2.txt /usr/share/wordlists/rockyou.txt \
  -r /usr/share/hashcat/rules/best64.rule
```

Kerberoast ticket, then read the cracked passwords back:

```bash
hashcat -m 13100 kerberoast.txt rockyou.txt -r best64.rule
hashcat -m 13100 kerberoast.txt --show
```

Mask attack when you know the shape (eight chars, caps start, digits end):

```bash
hashcat -m 1000 ntlm.txt -a 3 '?u?l?l?l?l?l?d?d'
```

## John: key flags and the *2john tools

- `john --wordlist=rockyou.txt hash` / `--rules`: wordlist with John's own rules.
- `--format=<name>`: force a format (`--list=formats` to see them).
- `--show hash`: print cracked results.
- `zip2john file.zip > hash`, `keepass2john file.kdbx`, `ssh2john id_rsa`: extract a hash from a file.
- `unshadow /etc/passwd /etc/shadow > hashes`: merge Linux files for cracking.

```bash
# locked KeePass database -> hash -> crack
keepass2john Database.kdbx > kp.hash
john --wordlist=rockyou.txt kp.hash
john --show kp.hash
```

## Workflow

1. Identify the hash type (`hashid`, the example-hashes table, or let John detect it).
2. Clean the file: one hash per line, strip usernames (`--username`) if present.
3. Wordlist first: `rockyou` plus `best64`, then a bigger rule set.
4. Still nothing? Mask attack on a known pattern, or targeted rules.
5. Collect with `--show`; note which credential came from which host and account.
6. Feed cracked passwords into lateral movement (netexec, evil-winrm, spraying).

## Notes

Match the mode to the hash exactly, which is where most failed cracks come from. Hashcat wants a real GPU; in a VM without one it crawls, so John or a wordlist-only pass is often faster on a CPU box. `rockyou` plus `best64` cracks a surprising share of lab passwords before you reach for masks. Crack only hashes you captured in scope, keep the loot with the rest of the engagement notes, and handle cracked passwords as sensitive.
