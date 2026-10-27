# Microsoft Defender for Endpoint

Visual reference for Defender for Endpoint (MDE) on a host: the sensor and Defender Antivirus, how to read a detection name, attack surface reduction rules, the device timeline, response actions and live response, indicators, and the tampering to look for. Hosts, users and hashes below are placeholders. For Defender XDR incidents, Sentinel and the wider Advanced Hunting schema, see the [Defender XDR and Sentinel field guide](/field-guides/defender-sentinel/).

## The mental model

Two engines share the host. **Defender Antivirus** blocks files and behaviour; the **EDR sensor** (`MsSense.exe`, built into Windows 10 and later) records what happens and streams it to the Defender portal. ASR rules, network protection and tamper protection harden the host around them.

```layers
Policy :: Indicators[security]{radar}, Intune / Security settings management[mgmt]{azure/intune}
Host :: Defender Antivirus[security]{shield}, EDR sensor[app]{sensor}, ASR rules[security]{lock}
Portal :: Alerts and incidents[security]{alert}, Device timeline[mgmt]{laptop}, Advanced Hunting[data]{db}
Indicators -> Defender Antivirus: block or allow
Intune / Security settings management -> ASR rules
Defender Antivirus -> Alerts and incidents: detections
EDR sensor -> Device timeline
EDR sensor -> Advanced Hunting: telemetry
```

```terms
MsMpEng.exe :: Defender Antivirus's engine. Its service is WinDefend.
MsSense.exe :: The EDR sensor. Its service is Sense.
Passive mode :: Defender Antivirus runs but doesn't block, because another AV is primary. EDR still records.
EDR in block mode :: Lets the EDR remediate things it sees even when Defender Antivirus is passive.
ASR rules :: Attack surface reduction: blocks common attacker behaviour (Office spawning children, LSASS theft). Modes: Block, Audit, Warn, Off.
Tamper protection :: Stops local changes to Defender settings, even by admins. Should be on everywhere.
Network protection :: Blocks connections to bad domains and IPs, and enforces network indicators, for every process.
Controlled folder access :: Only allowed apps can write to protected folders. Ransomware protection.
Device group :: Groups devices for RBAC and automation level.
Automated investigation (AIR) :: Investigates an alert and proposes or takes remediation, depending on the automation level.
Indicator :: Your own hash, IP, URL, domain or certificate with an action: Allow, Audit, Warn, Block, or Block and remediate.
```

## Reading a detection name

```anatomy
Trojan :: type
: :: 
Win32 :: platform
/ :: 
Emotet :: family
. :: 
ABC :: variant
!ml :: suffix (here: detected by machine learning)
```

**Read:** the type tells you the most. `Trojan`, `Backdoor`, `Ransom` and `HackTool` deserve a look. `Behavior:` names come from behaviour monitoring rather than a file, so the alert's process tree matters more than the file. `PUA:` is potentially unwanted software, not malware.

## On the host: Defender Antivirus

```powershell
Get-MpComputerStatus | Select-Object AMRunningMode, RealTimeProtectionEnabled, IsTamperProtected, AntivirusSignatureLastUpdated
Get-MpThreatDetection | Sort-Object InitialDetectionTime -Descending | Select-Object -First 10
Get-MpPreference | Select-Object ExclusionPath, ExclusionProcess, ExclusionExtension
& "$env:ProgramFiles\Windows Defender\MpCmdRun.exe" -Scan -ScanType 2
sc.exe query sense
```

| Command | Answers |
| --- | --- |
| `Get-MpComputerStatus` | Is AV active or passive, is real-time protection on, is tamper protection on? |
| `Get-MpThreatDetection` | What did Defender detect here, and what did it do? |
| `Get-MpPreference` | Which exclusions are set? (Attackers add them. Tamper protection can hide them from non-admins) |
| `MpCmdRun.exe -Scan -ScanType 2` | Full scan from the command line |
| `sc.exe query sense` | Is the EDR sensor running? |

### Defender event log

`Microsoft-Windows-Windows Defender/Operational`:

| Event ID | Means |
| --- | --- |
| 1116 | Malware or PUA detected |
| 1117 | Action taken on it |
| 1121 / 1122 | ASR rule blocked / audited |
| 5001 | Real-time protection disabled |
| 5007 | Configuration changed (exclusions, settings) |
| 5013 | Tamper protection blocked a change |

## Attack surface reduction

| Rule | GUID |
| --- | --- |
| Block credential stealing from LSASS | `9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2` |
| Block all Office applications from creating child processes | `d4f940ab-401b-4efc-aadc-ad5f3c50688a` |
| Block executable content from email client and webmail | `be9ba2d9-53ea-4cdc-84e5-9b1eeee46550` |
| Block process creations from PSExec and WMI commands | `d1e49aac-8f56-4280-b9ba-993a6d77406c` |
| Use advanced protection against ransomware | `c1db55ab-c21a-4637-bb3f-a12568109d35` |

### ASR blocks and audits in Advanced Hunting

```kql
DeviceEvents
| where Timestamp > ago(7d)
| where ActionType startswith "Asr"
| summarize count(), devices = dcount(DeviceId) by ActionType, FileName
| sort by count_ desc
```

**Read:** run new rules in Audit first and watch this query for a week. `AsrLsassCredentialTheftAudited` from your backup or monitoring agent is normal; from `rundll32.exe` it isn't.

## The device timeline

Every device page has a timeline of the sensor's events. It's the quickest way to answer "what happened around this alert?"

```sequence
Analyst[user]{user} -> Alert[security]{alert}: Open the alert's process tree
Alert -> Device timeline[mgmt]{laptop}: "See in timeline" jumps to the moment
Device timeline -> Device timeline: Filter to the process, then widen to ±30 minutes
Device timeline -> Advanced Hunting[data]{db}: "Hunt for related events" builds the KQL
note: The timeline keeps 180 days; Advanced Hunting raw events keep 30
```

## Response actions

| Action | Does | Undo |
| --- | --- | --- |
| Isolate device | Cuts all network except the Defender service. Selective isolation keeps Outlook and Teams | Release from isolation |
| Restrict app execution | Only Microsoft-signed binaries can run | Remove restriction |
| Run antivirus scan | Quick or full scan | — |
| Collect investigation package | Zip of autoruns, processes, connections, scheduled tasks, prefetch, event logs | — |
| Stop and quarantine file | Kills the process and quarantines the file on every device that has it | Restore from quarantine |
| Initiate live response session | A remote shell over the sensor | End session |
| Troubleshoot mode | Lets a local admin change Defender settings for a few hours, even with tamper protection | Ends on its own |

### Live response

```text
connections
processes
findfile invoice.js
fileinfo C:\Users\j.smith\AppData\Local\Temp\invoice.js
getfile C:\Users\j.smith\AppData\Local\Temp\invoice.js
registry HKCU\Software\Microsoft\Windows\CurrentVersion\Run
remediate file C:\Users\j.smith\AppData\Local\Temp\invoice.js
run triage.ps1
```

| Command | Use |
| --- | --- |
| `connections`, `processes` | What's running and talking right now |
| `findfile`, `fileinfo` | Find a file and get its hashes and signer |
| `getfile` | Download a file for analysis |
| `registry` | Read a key, such as Run keys |
| `remediate` | Remove a file, process, service or registry entry |
| `library`, `putfile`, `run` | Upload a script to the library, push it, run it (needs the advanced role, and unsigned scripts must be allowed) |

## Indicators

| Type | Actions | Enforced by |
| --- | --- | --- |
| File hash (SHA-1, SHA-256) | Allow, Audit, Warn, Block and remediate | Defender Antivirus |
| IP, URL, domain | Allow, Audit, Warn, Block | Network protection (and SmartScreen in Edge) |
| Certificate | Allow, Block and remediate | Defender Antivirus |

**Watch for:** indicators need Defender Antivirus active and network protection in block mode. On hosts where another AV is primary, file and network blocks don't happen.

## Tampering to look for

| Signal | Where |
| --- | --- |
| New exclusions | Event 5007, `DeviceRegistryEvents` under `Windows Defender\Exclusions` |
| Real-time protection off | Event 5001, `Get-MpComputerStatus` |
| `Set-MpPreference -DisableRealtimeMonitoring` in a command line | `DeviceProcessEvents` |
| Sensor service stopped or sensor silent | Device health status "Inactive", or no events from a device that is on |
| Tamper protection blocks | Event 5013, `DeviceEvents` with `ActionType == "TamperingAttempt"` |
| Defender's own tools abused | `MpCmdRun.exe -DownloadFile` fetching from the internet |

### Exclusions added

```kql
DeviceRegistryEvents
| where Timestamp > ago(30d)
| where RegistryKey has @"Windows Defender\Exclusions"
| where ActionType == "RegistryValueSet"
| project Timestamp, DeviceName, RegistryKey, RegistryValueName, InitiatingProcessFileName, InitiatingProcessCommandLine
```
