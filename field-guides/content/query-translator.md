# Query translator: UDM, KQL and SPL

The same operations and the same hunts written three ways: Google SecOps UDM search, KQL (Microsoft Sentinel and Defender Advanced Hunting) and SPL (Splunk). For moving a detection between SIEMs, or reading a customer's query in a language you use less. Hosts, users and IPs below are placeholders.

## How the three think

```flow
UDM: filter events[data]{gcp/secops} --> match: group[app]{function} --> outcome: aggregate[mgmt]{radar}
KQL: table[data]{azure/sentinel} --pipe--> where[app]{function} --pipe--> summarize[mgmt]{radar}
SPL: index search[data]{db} --pipe--> where / eval[app]{function} --pipe--> stats[mgmt]{radar}
```

| | UDM search | KQL | SPL |
| --- | --- | --- | --- |
| Starts from | All events, filtered by field | A table (`DeviceProcessEvents`, `SigninLogs`) | An index and sourcetype |
| Field names | One schema for every source (`principal.ip`) | Per table (`DeviceName`, `IPAddress`) | Per add-on, normalised by the CIM (`src`, `user`) |
| Pipeline | Sections: filter, `match:`, `outcome:`, `order:` | `\|` between operators | `\|` between commands |
| Time | The time picker | `where Timestamp > ago(7d)` | `earliest=-7d` or the time picker |
| Case | Exact unless `nocase` | `==` exact, `=~` insensitive | Field values insensitive, `where` exact |

**Read:** UDM's one schema is the biggest difference. In KQL and SPL you first find the table or sourcetype the data lives in; in UDM you filter on the event type and the vendor instead.

## Operations side by side

| Want | UDM search | KQL | SPL |
| --- | --- | --- | --- |
| Equals | `principal.hostname = "WKS-0142"` | `where DeviceName == "wks-0142"` | `host=WKS-0142` |
| Case-insensitive | `= "x" nocase` | `=~ "x"` | default for field values |
| Not equals | `!= "x"` | `!= "x"` | `!= x` or `NOT field=x` |
| One of several | `= /^(cmd\|powershell)\.exe$/ nocase` | `in~ ("cmd.exe", "powershell.exe")` | `IN ("cmd.exe", "powershell.exe")` |
| Contains | `= /-enc/ nocase` | `contains "-enc"` (or `has` for whole terms) | `="*-enc*"` |
| Regex | `= /pattern/` or `re.regex(field, "p")` | `matches regex @"pattern"` | `\| regex field="pattern"` |
| Field present | `!= ""` | `isnotempty(Field)` | `field=*` |
| IP in range | `net.ip_in_range_cidr(principal.ip, "10.0.0.0/8")` | `ipv4_is_in_range(IP, "10.0.0.0/8")` | `cidrmatch("10.0.0.0/8", src)` |
| Count by group | `match: $h` + `outcome: $c = count(metadata.id)` | `summarize count() by DeviceName` | `stats count by host` |
| Distinct count | `count_distinct(field)` | `dcount(Field)` | `dc(field)` |
| List of values | `array_distinct(field)` | `make_set(Field)` | `values(field)` |
| First / last seen | `min(metadata.event_timestamp.seconds)` | `min(Timestamp)`, `max(Timestamp)` | `min(_time)`, `max(_time)` |
| Filter on a count | `outcome:` then `condition:` (rules) or filter in the results | `\| where Count > 10` | `\| where count > 10` |
| Sort | `order: $c desc` | `sort by Count desc` | `sort - count` |
| Time buckets | `match: $h by 1h` (in rules: `over 1h`) | `bin(Timestamp, 1h)` | `timechart span=1h` or `bin _time span=1h` |
| New field | `outcome: $x = …` | `extend X = …` | `eval x = …` |

**Tune:** the field names in the KQL column are Defender Advanced Hunting's. Sentinel's tables use `TimeGenerated` rather than `Timestamp`, and their own column names.

## Hunts in all three

### Encoded PowerShell

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.full_path = /\\(powershell|pwsh)\.exe$/ nocase
target.process.command_line = /\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+\/=]{40,}/ nocase
```

```kql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName in~ ("powershell.exe", "pwsh.exe")
| where ProcessCommandLine matches regex @"(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}"
| project Timestamp, DeviceName, AccountName, InitiatingProcessFileName, ProcessCommandLine
```

```spl
index=wineventlog source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1
  Image IN ("*\\powershell.exe", "*\\pwsh.exe")
| regex CommandLine="(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}"
| table _time, host, User, ParentImage, CommandLine
```

### Office spawning a shell

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.process.file.full_path = /\\(winword|excel|powerpnt|outlook)\.exe$/ nocase
target.process.file.full_path = /\\(cmd|powershell|pwsh|wscript|cscript|mshta)\.exe$/ nocase
```

```kql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where InitiatingProcessFileName in~ ("winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe")
| where FileName in~ ("cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe", "mshta.exe")
| project Timestamp, DeviceName, AccountName, InitiatingProcessFileName, ProcessCommandLine
```

```spl
index=wineventlog source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1
  ParentImage IN ("*\\winword.exe", "*\\excel.exe", "*\\powerpnt.exe", "*\\outlook.exe")
  Image IN ("*\\cmd.exe", "*\\powershell.exe", "*\\pwsh.exe", "*\\wscript.exe", "*\\cscript.exe", "*\\mshta.exe")
| table _time, host, User, ParentImage, CommandLine
```

### Password spray: one source, many users

```udm
metadata.event_type = "USER_LOGIN"
security_result.action = "BLOCK"
$ip = principal.ip
match:
  $ip
outcome:
  $failures = count(metadata.id)
  $users = count_distinct(target.user.userid)
order:
  $users desc
```

```kql
SigninLogs
| where TimeGenerated > ago(1d)
| where ResultType != "0"
| summarize failures = count(), users = dcount(UserPrincipalName) by IPAddress
| where users > 10
| sort by users desc
```

```spl
| tstats count, dc(Authentication.user) as users from datamodel=Authentication
  where Authentication.action=failure by Authentication.src
| where users > 10
| sort - users
```

### Added to a privileged group

```udm
metadata.vendor_name = "Microsoft" nocase
metadata.product_event_type = /^(4728|4732|4756)$/
```

```kql
SecurityEvent
| where TimeGenerated > ago(7d)
| where EventID in (4728, 4732, 4756)
| where TargetUserName in~ ("Administrators", "Domain Admins", "Enterprise Admins", "Schema Admins")
| project TimeGenerated, Computer, SubjectUserName, MemberName, TargetUserName
```

```spl
index=wineventlog source="XmlWinEventLog:Security" EventCode IN (4728, 4732, 4756)
  Group_Name IN ("Administrators", "Domain Admins", "Enterprise Admins", "Schema Admins")
| table _time, host, src_user, Group_Name, EventCode
```

### Service installed

```udm
metadata.vendor_name = "Microsoft" nocase
metadata.product_event_type = "7045"
```

```kql
DeviceEvents
| where Timestamp > ago(7d)
| where ActionType == "ServiceInstalled"
| extend Service = tostring(parse_json(AdditionalFields).ServiceName)
| project Timestamp, DeviceName, Service, FolderPath, InitiatingProcessFileName
```

```spl
index=wineventlog source="XmlWinEventLog:System" EventCode=7045
| table _time, host, Service_Name, Service_File_Name, Service_Account
```

### Audit log cleared

```udm
metadata.vendor_name = "Microsoft" nocase
metadata.product_event_type = /^(1102|104)$/
```

```kql
SecurityEvent
| where TimeGenerated > ago(30d)
| where EventID == 1102
| project TimeGenerated, Computer, SubjectUserName
```

```spl
index=wineventlog (EventCode=1102 source="XmlWinEventLog:Security") OR (EventCode=104 source="XmlWinEventLog:System")
| table _time, host, user, EventCode
```

### Inbox rule created or changed

```udm
metadata.product_name = "Office 365" nocase
metadata.product_event_type = /^(New-InboxRule|Set-InboxRule|UpdateInboxRules)$/
```

```kql
OfficeActivity
| where TimeGenerated > ago(30d)
| where Operation in ("New-InboxRule", "Set-InboxRule", "UpdateInboxRules")
| project TimeGenerated, UserId, ClientIP, Operation, Parameters
```

```spl
index=o365 sourcetype="o365:management:activity" Operation IN ("New-InboxRule", "Set-InboxRule", "UpdateInboxRules")
| table _time, UserId, ClientIP, Operation, Parameters{}.Name, Parameters{}.Value
```

### Rare processes across the estate

```udm
metadata.event_type = "PROCESS_LAUNCH"
$process = target.process.file.full_path
match:
  $process
outcome:
  $hosts = count_distinct(principal.hostname)
  $runs = count(metadata.id)
order:
  $hosts asc
```

```kql
DeviceProcessEvents
| where Timestamp > ago(7d)
| summarize hosts = dcount(DeviceId), runs = count() by FolderPath
| where hosts <= 2
| sort by hosts asc
```

```spl
index=wineventlog source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1 earliest=-7d
| stats dc(host) as hosts, count by Image
| where hosts <= 2
| sort hosts
```

## Before you trust a translation

| Check | Why |
| --- | --- |
| Where does the data live? | The same Windows event can be in `SecurityEvent`, `DeviceEvents` or nowhere, depending on the agent |
| How was it parsed? | UDM fields depend on the parser, SPL fields on the add-on. Look at one raw event first |
| Case and wildcards | `=` in SPL ignores case; `==` in KQL doesn't; UDM needs `nocase` |
| Time | Each tool's default range differs. State it in the query |
| Empty is not clean | Zero results from a source that isn't collected looks the same as zero results from a clean estate |

Each language has its own field guide: [Google SecOps UDM](/field-guides/google-secops/), [Defender XDR and Sentinel](/field-guides/defender-sentinel/) and [Splunk](/field-guides/splunk/).
