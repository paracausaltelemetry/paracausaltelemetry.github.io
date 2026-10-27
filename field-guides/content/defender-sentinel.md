# Microsoft Defender XDR and Sentinel

Visual reference for Microsoft's security stack on cases: what each Defender product sees, how alerts become incidents, how Sentinel sits on top, the Advanced Hunting tables, KQL patterns for Tier 2 hunts, and the response actions. Hosts, users and IPs below are placeholders.

## The mental model

Each Defender product watches one surface. Defender XDR correlates their alerts into incidents and keeps 30 days of raw events for Advanced Hunting. Sentinel is the SIEM: it takes Defender's data plus everything else (firewalls, cloud, identity) into a Log Analytics workspace, and both now live in the Defender portal.

```layers
Signals :: Defender for Endpoint[compute]{laptop}, Defender for Office 365[app]{mail}, Defender for Identity[security]{key}, Defender for Cloud Apps[external]{cloud}, Entra ID Protection[security]{azure/entra-id-protection}
Correlation :: Defender XDR[security]{shield}, Other sources[network]{firewall}
SIEM :: Sentinel workspace[data]{azure/sentinel}, Log Analytics[data]{azure/log-analytics}
Action :: Incidents and hunting[mgmt]{alert}, Playbooks[app]{azure/logic-apps}, Workbooks[mgmt]{azure/workbooks}
Defender for Endpoint -> Defender XDR
Defender for Office 365 -> Defender XDR
Defender for Identity -> Defender XDR
Defender for Cloud Apps -> Defender XDR
Entra ID Protection -> Defender XDR
Defender XDR -> Sentinel workspace: incidents and raw tables
Other sources -> Log Analytics: connectors
Log Analytics -> Sentinel workspace
Sentinel workspace -> Incidents and hunting
Sentinel workspace -> Playbooks: automation rules
Sentinel workspace -> Workbooks
```

```terms
Alert :: One detection from one product, with its evidence.
Incident :: Related alerts grouped by Defender XDR (or Sentinel analytics) into one case.
Entity / evidence :: The devices, users, files, IPs, mailboxes and URLs an alert involves.
AIR :: Automated investigation and response. Investigates an alert, proposes actions, and can apply them.
Action center :: Where pending and completed remediation actions (AIR or manual) are listed and approved.
Advanced Hunting :: KQL over 30 days of raw Defender events, across all Defender products.
Sentinel workspace :: A Log Analytics workspace with Sentinel enabled: tables, rules, incidents, automation.
Data connector :: How a source's logs reach the workspace (built-in connector, AMA agent, Syslog/CEF, API).
Analytics rule :: A Sentinel detection: scheduled KQL, near-real-time, or Microsoft's ML (Fusion).
Automation rule / playbook :: Rules that triage incidents automatically; playbooks are Logic Apps they can run.
Watchlist :: A lookup table (VIP users, admin hosts, known IPs) to use in KQL.
UEBA :: User and entity behaviour analytics: baselines and anomaly scores for users and hosts.
```

### How long the data lasts

```bars
Sentinel workspace (included) :: 90 :: days
Advanced Hunting raw events :: 30 :: days
Entra sign-in logs (P1 / P2) :: 30 :: days
```

**Read:** after 30 days, raw endpoint events only exist if they're streamed into Sentinel. Check that before you scope an old incident.

## From alert to response

```flow
Defender alerts[security]{alert} --correlate--> Incident[mgmt]{log} --AIR--> Investigation[app]{radar} --approve--> Action center[security]{shield}
Sentinel analytics rule[data]{azure/sentinel} --creates--> Incident[mgmt]{log} --automation rule--> Playbook[app]{azure/logic-apps}
```

### Automation rule running a playbook

```sequence
Analytics rule[data]{azure/sentinel} -> Sentinel[mgmt]{azure/sentinel}: Incident: impossible travel for j.smith
Sentinel -> Automation rule[app]{function}: Matches "severity High and tactic InitialAccess"
Automation rule -> Playbook[app]{azure/logic-apps}: Run "Revoke and notify"
Playbook -> Microsoft Graph[compute]{entra/entra-id}: POST /users/j.smith/revokeSignInSessions
Playbook --> Sentinel: Comment and tag on the incident
note: Playbooks run as a managed identity. Its permissions are your automation's blast radius
```

## Advanced Hunting tables

| Table | Holds |
| --- | --- |
| `DeviceProcessEvents` | Process starts, with command line and parent |
| `DeviceNetworkEvents` | Connections, with the process that made them |
| `DeviceFileEvents` | File created, modified, renamed, deleted |
| `DeviceRegistryEvents` | Registry changes |
| `DeviceLogonEvents` | Logons on the device, with logon type |
| `DeviceEvents` | Everything else: AMSI, ASR, LSASS access (`OpenProcessApiCall`), exploit guard |
| `DeviceImageLoadEvents` | DLL loads |
| `EmailEvents` | Every message: sender, recipient, subject, delivery action, threats |
| `EmailUrlInfo` / `EmailAttachmentInfo` | URLs and attachments in those messages |
| `UrlClickEvents` | Safe Links clicks, allowed or blocked |
| `IdentityLogonEvents` | On-prem AD and Entra authentications seen by Defender for Identity |
| `IdentityDirectoryEvents` | AD changes: group membership, password resets |
| `CloudAppEvents` | SaaS activity from Defender for Cloud Apps |
| `AlertInfo` / `AlertEvidence` | Alerts and the entities in them |

### Sentinel tables you'll meet

| Table | Holds |
| --- | --- |
| `SigninLogs` / `AuditLogs` | Entra sign-ins and directory changes |
| `SecurityEvent` | Windows security events from the AMA agent (4624, 4688…) |
| `CommonSecurityLog` | CEF from firewalls and proxies (Palo Alto, Fortinet…) |
| `Syslog` | Linux and appliance syslog |
| `OfficeActivity` | Exchange, SharePoint and Teams audit |
| `AzureActivity` | Azure control plane |
| `SecurityIncident` / `SecurityAlert` | Sentinel's own incidents and alerts |

## KQL cheat sheet

| Want | Write |
| --- | --- |
| Time window | `where Timestamp > ago(7d)` (Defender) or `TimeGenerated` (Sentinel) |
| Case-insensitive equals | `where FileName =~ "powershell.exe"` |
| One of several | `where FileName in~ ("cmd.exe", "powershell.exe")` |
| Whole term (fast) | `where ProcessCommandLine has "downloadstring"` |
| Substring (slower) | `where ProcessCommandLine contains "http"` |
| Regex | `where ProcessCommandLine matches regex @"(?i)-enc\s"` |
| Count per group | `summarize count() by DeviceName` |
| Distinct count | `summarize dcount(AccountUpn) by IPAddress` |
| List of values | `summarize make_set(RemoteUrl, 20) by DeviceName` |
| Latest row per key | `summarize arg_max(Timestamp, *) by DeviceId` |
| Time buckets | `summarize count() by bin(Timestamp, 1h)` |
| Join two tables | `join kind=inner (OtherTable) on NetworkMessageId` |
| Reuse a value | `let suspect = "WKS-0142";` |
| JSON column | `extend p = parse_json(AdditionalFields)` |

**Tune:** filter on time first and use `has` before `contains`. Both make queries much faster.

## Hunts

### Encoded PowerShell

```kql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName in~ ("powershell.exe", "pwsh.exe")
| where ProcessCommandLine matches regex @"(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}"
| project Timestamp, DeviceName, AccountName, InitiatingProcessFileName, ProcessCommandLine
```

### Office spawning a shell

```kql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where InitiatingProcessFileName in~ ("winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe")
| where FileName in~ ("cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe", "mshta.exe")
| project Timestamp, DeviceName, AccountName, InitiatingProcessFileName, FileName, ProcessCommandLine
```

### LOLBins talking to the internet

```kql
DeviceNetworkEvents
| where Timestamp > ago(7d)
| where InitiatingProcessFileName in~ ("rundll32.exe", "regsvr32.exe", "mshta.exe", "certutil.exe", "bitsadmin.exe")
| where RemoteIPType == "Public"
| summarize Connections = count(), Urls = make_set(RemoteUrl, 10) by DeviceName, InitiatingProcessFileName
```

### LSASS access

```kql
DeviceEvents
| where Timestamp > ago(7d)
| where ActionType == "OpenProcessApiCall" and FileName =~ "lsass.exe"
| where InitiatingProcessFileName !in~ ("MsMpEng.exe", "csrss.exe", "wininit.exe", "svchost.exe")
| project Timestamp, DeviceName, InitiatingProcessFileName, InitiatingProcessCommandLine
```

### Phish clicked, then what ran

```kql
let clicks = UrlClickEvents
| where Timestamp > ago(3d) and ActionType == "ClickAllowed"
| project ClickTime = Timestamp, AccountUpn, Url, NetworkMessageId;
clicks
| join kind=inner (EmailEvents | project NetworkMessageId, SenderFromAddress, Subject) on NetworkMessageId
| project ClickTime, AccountUpn, Url, SenderFromAddress, Subject
```

**Then:** take each `AccountUpn`'s devices and look at `DeviceProcessEvents` in the minutes after `ClickTime`.

### Password spray against AD

```kql
IdentityLogonEvents
| where Timestamp > ago(1d) and ActionType == "LogonFailed"
| summarize Failures = count(), Accounts = dcount(AccountUpn) by IPAddress
| where Accounts > 10
| order by Accounts desc
```

### Firewall denies from one host (Sentinel)

```kql
CommonSecurityLog
| where TimeGenerated > ago(1d)
| where SourceIP == "10.10.4.22" and DeviceAction in~ ("deny", "drop", "block")
| summarize Denies = count(), Ports = make_set(DestinationPort, 20) by DestinationIP, DeviceVendor
| order by Denies desc
```

## Response actions

| Action | Where | Effect |
| --- | --- | --- |
| Isolate device | Device page | Cuts the network except to Defender. Selective isolation can keep Outlook and Teams |
| Restrict app execution | Device page | Only Microsoft-signed code runs |
| Collect investigation package | Device page | Zip of logs, processes, autoruns, network config |
| Live response | Device page | Remote shell: `getfile`, `run` scripts, `remediate` |
| Stop and quarantine file | File page | Kills the process and quarantines the file everywhere it's seen |
| Indicator (block) | Settings › Indicators | Block a hash, IP, URL or certificate across the estate |
| Soft delete / move email | Threat Explorer › Take action | Pulls a delivered message from every mailbox |
| Disable user / force password reset | User page (Defender for Identity) | On-prem AD and Entra account actions |
| Run playbook | Sentinel incident | Any Logic App action: revoke sessions, block in firewall, open a ticket |

**Watch for:** someone turning off tamper protection, adding exclusions, or offboarding a device. Look in the Defender audit log, and treat each as an incident until explained.

## Hunting in SecOps

### Defender for Endpoint process events

```udm
metadata.vendor_name = "Microsoft" nocase
metadata.event_type = "PROCESS_LAUNCH"
principal.hostname = "WKS-0142" nocase
```

**Tune:** Defender data arrives in SecOps under different log types depending on the feed (streaming API, Event Hub). Check one event in the UDM viewer first.
