# Windows event IDs and Sysmon

Visual reference for Windows logs on cases: which log holds what, the Security event IDs that matter, logon types and failure codes, how Kerberos and NTLM show up, the Sysmon events, and the IDs to chain together for lateral movement, persistence and log clearing. Hosts, users and SIDs below are placeholders.

## The mental model

Windows writes to several logs. **Security** holds authentication, account changes and (if audited) process creation. **System** holds services and drivers. Product logs under Applications and Services Logs hold PowerShell, RDP, Defender and Sysmon. Domain controllers hold the Kerberos and account-change events for the whole domain.

```flow
Workstations and servers[compute]{laptop} --Security, System, Sysmon, PowerShell--> Forwarder / agent[mgmt]{log} --> SIEM[data]{db}
Domain controller[security]{key} --Kerberos, NTLM, account changes--> Forwarder / agent[mgmt]{log}
```

| Log | Holds |
| --- | --- |
| Security | Logons, Kerberos and NTLM (on DCs), account and group changes, 4688 process creation, 1102 |
| System | 7045 services installed, 7036 service state, 104 log cleared |
| Microsoft-Windows-PowerShell/Operational | 4104 script blocks, 4103 module logging |
| Microsoft-Windows-Sysmon/Operational | Sysmon, if installed |
| TerminalServices-* | RDP authentication and sessions |
| TaskScheduler/Operational | Scheduled tasks registered and run |
| Windows Defender/Operational | Detections and Defender changes (see the [Defender for Endpoint field guide](/field-guides/defender-endpoint/)) |

**Watch for:** many of these events only exist if auditing is configured. 4688 with command lines, 4104 script blocks and 5145 share access are all off by default. Check the audit policy (`auditpol /get /category:*`) before concluding something didn't happen.

## Logons

| Event ID | Means |
| --- | --- |
| 4624 | Successful logon (on the machine logged on to) |
| 4625 | Failed logon |
| 4634 / 4647 | Logoff / user-initiated logoff |
| 4648 | Logon with explicit credentials (`runas`, or a process using other credentials) |
| 4672 | Special privileges assigned: an admin-equivalent logon |
| 4776 | NTLM credential validation (on the DC, or locally for local accounts) |
| 4740 | Account locked out (on the DC) |

### Logon types

| Type | Name | Usually |
| --- | --- | --- |
| 2 | Interactive | Keyboard at the machine |
| 3 | Network | SMB shares, PsExec, WMI, most remote admin. The most common lateral movement type |
| 4 | Batch | Scheduled tasks |
| 5 | Service | Services starting under an account |
| 7 | Unlock | Unlocking the screen |
| 8 | NetworkCleartext | Credentials sent in clear (IIS basic auth, some PowerShell) |
| 9 | NewCredentials | `runas /netonly`: the local session is unchanged, network access uses new credentials |
| 10 | RemoteInteractive | RDP |
| 11 | CachedInteractive | Logon with cached domain credentials, no DC reachable |

### Failure codes (4625)

| Sub status | Means |
| --- | --- |
| `0xC000006A` | Wrong password for a real user |
| `0xC0000064` | User doesn't exist |
| `0xC0000234` | Account locked out |
| `0xC0000072` | Account disabled |
| `0xC000006F` | Outside allowed logon hours |
| `0xC0000071` | Password expired |
| `0xC0000193` | Account expired |
| `0xC0000133` | Clocks out of sync |

**Read:** lots of `0xC0000064` from one source is someone guessing usernames. Lots of `0xC000006A` across many users with one or two attempts each is a password spray.

## Kerberos and NTLM

```sequence
User[user]{laptop} -> Domain controller[security]{key}: AS-REQ: password-derived key
Domain controller --> User: TGT (4768 on the DC; 4771 if pre-auth fails)
User -> Domain controller: TGS-REQ for cifs/FS01
Domain controller --> User: Service ticket (4769 on the DC)
User -> File server[compute]{server}: AP-REQ with the ticket
File server -> File server: 4624 type 3 on FS01
note: NTLM instead shows 4776 on the DC, and 4624 with an NTLM package on the target
```

| Event ID | Watch for |
| --- | --- |
| 4768 | TGT requests with pre-authentication type `0`: AS-REP roasting |
| 4769 | Ticket encryption `0x17` (RC4) for many service names from one account: Kerberoasting |
| 4771 | Pre-auth failures with code `0x18`: wrong passwords, Kerberos-style spray |
| 4776 | NTLM where you expect Kerberos, or from unexpected workstations |
| 4624 | Type 9 with logon process `seclogo` on the source host: `runas /netonly`, or pass-the-hash tools such as Mimikatz `sekurlsa::pth` |

## Accounts and groups

| Event ID | Means |
| --- | --- |
| 4720 | User account created |
| 4722 / 4725 | Account enabled / disabled |
| 4724 | Password reset by someone else |
| 4723 | User changed their own password |
| 4738 | User account changed |
| 4728 / 4729 | Added to / removed from a global security group (Domain Admins is one) |
| 4732 / 4733 | Added to / removed from a local or domain local group (local Administrators) |
| 4756 | Added to a universal group (Enterprise Admins, Schema Admins) |
| 4662 | Operation on an AD object. With the replication GUIDs below, it's DCSync |

**Watch for:** 4662 with `1131f6aa-9c07-11d1-f79f-00c04fc2dcd2` or `1131f6ad-9c07-11d1-f79f-00c04fc2dcd2` from an account that isn't a domain controller.

## Processes, services and tasks

| Event ID | Log | Means |
| --- | --- | --- |
| 4688 | Security | Process created (with command line if the policy is on) |
| 4697 | Security | Service installed |
| 7045 | System | Service installed (always on, even without Security auditing) |
| 7036 | System | Service started or stopped |
| 4698 / 4702 | Security | Scheduled task created / updated |
| 106 / 140 / 200 | TaskScheduler / Operational | Task registered / updated / run |
| 4104 | PowerShell / Operational | Script block logged (decoded, so `-enc` shows in clear) |
| 4103 | PowerShell / Operational | Module logging: each command run |
| 400 / 800 | Windows PowerShell | Engine start (shows the host version: `2.0` means a downgrade) |

## Remote access

| Event ID | Log | Means |
| --- | --- | --- |
| 4624 type 10 | Security | RDP logon |
| 1149 | TerminalServices-RemoteConnectionManager | RDP authentication succeeded (source IP, user) |
| 21 / 24 / 25 | TerminalServices-LocalSessionManager | RDP session logon / disconnect / reconnect |
| 4778 / 4779 | Security | Session reconnected / disconnected |
| 5140 | Security | Share accessed (`ADMIN$`, `C$` are interesting) |
| 5145 | Security | File in a share checked (very noisy, very useful) |
| 91 | WinRM / Operational | WinRM session created |

### Lateral movement: what each tool leaves

```flow
PsExec[app]{function} --> 4624 type 3 + 5140 ADMIN$[security]{lock} --> 7045 PSEXESVC[app]{log} --> 4688 on target[compute]{server}
WMI / wmiexec[app]{function} --> 4624 type 3[security]{lock} --> 4688 wmiprvse.exe child[compute]{server}
RDP[network]{laptop} --> 1149 + 4624 type 10[security]{lock} --> 21 session logon[compute]{server}
```

## Log clearing and tampering

| Event ID | Log | Means |
| --- | --- | --- |
| 1102 | Security | Security log cleared |
| 104 | System | Another log cleared |
| 4719 | Security | Audit policy changed |
| 1100 | Security | Event logging service shut down |

**Read:** a gap in the logs with no 1102 can still mean tampering: the service was stopped, or the forwarder was.

## Sysmon

Sysmon adds detail Windows doesn't log by default. What it logs depends entirely on its configuration file.

| Event ID | Means |
| --- | --- |
| 1 | Process created: image, command line, hashes, parent, user |
| 3 | Network connection: process, source and destination |
| 5 | Process terminated |
| 6 | Driver loaded |
| 7 | Image (DLL) loaded |
| 8 | CreateRemoteThread: a classic injection sign |
| 10 | Process access: who opened which process (LSASS access is credential theft) |
| 11 | File created |
| 12 / 13 / 14 | Registry key created or deleted / value set / renamed |
| 15 | Alternate data stream created (Mark of the Web) |
| 17 / 18 | Named pipe created / connected (C2 frameworks use them) |
| 19 / 20 / 21 | WMI event filter / consumer / binding: WMI persistence |
| 22 | DNS query, with the process that made it |
| 23 / 26 | File deleted (archived / just logged) |
| 25 | Process tampering: hollowing or herpaderping |
| 29 | Executable file detected |

### Sysmon 1 anatomy

```anatomy
ParentImage: C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE :: who started it
Image: C:\Windows\System32\cmd.exe :: what ran
CommandLine: cmd.exe /c powershell -w hidden -enc SQBFAFgA... :: with what arguments
User: CORP\j.smith :: as whom
ProcessGuid: {4a1c…} :: unique ID: joins to its events 3, 11, 22 via the same GUID
```

**Read:** pivot on `ProcessGuid`, not the process ID. IDs are reused; GUIDs aren't.

## Queries

### Password spray from one source (Sentinel)

```kql
SecurityEvent
| where TimeGenerated > ago(1d)
| where EventID == 4625
| summarize attempts = count(), users = dcount(TargetUserName) by IpAddress
| where users > 10
| sort by users desc
```

### Kerberoasting (Splunk)

```spl
index=wineventlog source="XmlWinEventLog:Security" EventCode=4769 Ticket_Encryption_Type=0x17 Service_Name!="*$"
| stats dc(Service_Name) as services, values(Service_Name) as names by Account_Name, Client_Address
| where services > 3
```

### Services installed (SecOps)

```udm
metadata.vendor_name = "Microsoft" nocase
metadata.product_event_type = "7045"
```

More of these, side by side in UDM, KQL and SPL, are in the [query translator](/field-guides/query-translator/).
