# Query translator: UDM, KQL, SPL, ES|QL and Sigma

The same operations and the same hunts written five ways: Google SecOps UDM search, KQL (Microsoft Sentinel and Defender Advanced Hunting), SPL (Splunk), ES|QL (Elastic) and Sigma, the vendor-neutral rule format. Use the Queries switch at the top to show only your language. For moving a detection between SIEMs, or reading a customer's query in a language you use less. Hosts, users and IPs below are placeholders.

## How they think

```flow
UDM: filter events[data]{gcp/secops} --> match: group[app]{function} --> outcome: aggregate[mgmt]{radar}
KQL: table[data]{azure/sentinel} --pipe--> where[app]{function} --pipe--> summarize[mgmt]{radar}
SPL: index search[data]{db} --pipe--> where / eval[app]{function} --pipe--> stats[mgmt]{radar}
ES|QL: FROM data stream[data]{db} --pipe--> WHERE / EVAL[app]{function} --pipe--> STATS ... BY[mgmt]{radar}
```

| | UDM search | KQL | SPL | ES\|QL |
| --- | --- | --- | --- | --- |
| Starts from | All events, filtered by field | A table (`DeviceProcessEvents`, `SigninLogs`) | An index and sourcetype | `FROM` a data stream pattern (`logs-endpoint.events.process-*`) |
| Field names | One schema for every source (`principal.ip`) | Per table (`DeviceName`, `IPAddress`) | Per add-on, normalised by the CIM (`src`, `user`) | One schema, ECS (`host.name`, `source.ip`) |
| Pipeline | Sections: filter, `match:`, `outcome:`, `order:` | `\|` between operators | `\|` between commands | `\|` between commands |
| Time | The time picker | `where Timestamp > ago(7d)` | `earliest=-7d` or the time picker | `WHERE @timestamp > NOW() - 7 days` or the time picker |
| Case | Exact unless `nocase` | `==` exact, `=~` insensitive | Field values insensitive, `where` exact | `==` exact; wrap in `TO_LOWER()` to ignore case |

**Read:** one schema is the biggest difference. In KQL and SPL you first find the table or sourcetype the data lives in; in UDM and ES|QL every source shares field names (UDM and ECS), so you filter on the event type instead. ES|QL still starts `FROM` a data stream, which narrows the search to one integration.

## Operations side by side

| Want | UDM search | KQL | SPL | ES\|QL |
| --- | --- | --- | --- | --- |
| Equals | `principal.hostname = "WKS-0142"` | `where DeviceName == "wks-0142"` | `host=WKS-0142` | `WHERE host.name == "wks-0142"` |
| Case-insensitive | `= "x" nocase` | `=~ "x"` | default for field values | `TO_LOWER(field) == "x"` |
| Not equals | `!= "x"` | `!= "x"` | `!= x` or `NOT field=x` | `!= "x"` |
| One of several | `= /^(cmd\|powershell)\.exe$/ nocase` | `in~ ("cmd.exe", "powershell.exe")` | `IN ("cmd.exe", "powershell.exe")` | `IN ("cmd.exe", "powershell.exe")` |
| Contains | `= /-enc/ nocase` | `contains "-enc"` (or `has` for whole terms) | `="*-enc*"` | `LIKE "*-enc*"` |
| Regex | `= /pattern/` or `re.regex(field, "p")` | `matches regex @"pattern"` | `\| regex field="pattern"` | `RLIKE "pattern"` (matches the whole value) |
| Field present | `!= ""` | `isnotempty(Field)` | `field=*` | `IS NOT NULL` |
| IP in range | `net.ip_in_range_cidr(principal.ip, "10.0.0.0/8")` | `ipv4_is_in_range(IP, "10.0.0.0/8")` | `cidrmatch("10.0.0.0/8", src)` | `CIDR_MATCH(source.ip, "10.0.0.0/8")` |
| Count by group | `match: $h` + `outcome: $c = count(metadata.id)` | `summarize count() by DeviceName` | `stats count by host` | `STATS count = COUNT(*) BY host.name` |
| Distinct count | `count_distinct(field)` | `dcount(Field)` | `dc(field)` | `COUNT_DISTINCT(field)` |
| List of values | `array_distinct(field)` | `make_set(Field)` | `values(field)` | `VALUES(field)` |
| First / last seen | `min(metadata.event_timestamp.seconds)` | `min(Timestamp)`, `max(Timestamp)` | `min(_time)`, `max(_time)` | `MIN(@timestamp)`, `MAX(@timestamp)` |
| Filter on a count | `outcome:` then `condition:` (rules) or filter in the results | `\| where Count > 10` | `\| where count > 10` | `\| WHERE count > 10` |
| Sort | `order: $c desc` | `sort by Count desc` | `sort - count` | `SORT count DESC` |
| Time buckets | `match: $h by 1h` (in rules: `over 1h`) | `bin(Timestamp, 1h)` | `timechart span=1h` or `bin _time span=1h` | `STATS ... BY BUCKET(@timestamp, 1 hour)` |
| New field | `outcome: $x = …` | `extend X = …` | `eval x = …` | `EVAL x = …` |

**Tune:** the field names in the KQL column are Defender Advanced Hunting's. Sentinel's tables use `TimeGenerated` rather than `Timestamp`, and their own column names.

## Hunts in all five

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

```esql
FROM logs-endpoint.events.process-*
| WHERE @timestamp > NOW() - 7 days AND event.type == "start"
  AND TO_LOWER(process.name) IN ("powershell.exe", "pwsh.exe")
  AND TO_LOWER(process.command_line) RLIKE """.*[ ]-e(nc|ncodedcommand)?[ ]+[a-z0-9+/=]{40,}.*"""
| KEEP @timestamp, host.name, user.name, process.parent.name, process.command_line
```

```sigma
title: Encoded PowerShell command line
logsource:
  category: process_creation
  product: windows
detection:
  selection_img:
    - Image|endswith:
        - '\powershell.exe'
        - '\pwsh.exe'
    - OriginalFileName:
        - 'PowerShell.EXE'
        - 'pwsh.dll'
  selection_cli:
    CommandLine|contains|windash:
      - ' -e '
      - ' -en '
      - ' -enc '
      - ' -encodedcommand '
  condition: all of selection_*
level: medium
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

```esql
FROM logs-endpoint.events.process-*
| WHERE @timestamp > NOW() - 7 days AND event.type == "start"
  AND TO_LOWER(process.parent.name) IN ("winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe")
  AND TO_LOWER(process.name) IN ("cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe", "mshta.exe")
| KEEP @timestamp, host.name, user.name, process.parent.name, process.command_line
```

```sigma
title: Office application spawning a shell
logsource:
  category: process_creation
  product: windows
detection:
  selection_parent:
    ParentImage|endswith:
      - '\winword.exe'
      - '\excel.exe'
      - '\powerpnt.exe'
      - '\outlook.exe'
  selection_child:
    Image|endswith:
      - '\cmd.exe'
      - '\powershell.exe'
      - '\pwsh.exe'
      - '\wscript.exe'
      - '\cscript.exe'
      - '\mshta.exe'
  condition: all of selection_*
level: high
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

```esql
FROM logs-system.security-*
| WHERE @timestamp > NOW() - 1 day AND event.code == "4625"
| STATS failures = COUNT(*), users = COUNT_DISTINCT(user.name) BY source.ip
| WHERE users > 10
| SORT users DESC
```

```sigma
title: Failed logon
name: failed_logon
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 4625
  condition: selection
---
title: Password spray from one source
correlation:
  type: value_count
  rules:
    - failed_logon
  group-by:
    - IpAddress
  timespan: 1h
  condition:
    field: TargetUserName
    gte: 10
level: high
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

```esql
FROM logs-system.security-*
| WHERE @timestamp > NOW() - 7 days AND event.code IN ("4728", "4732", "4756")
  AND group.name IN ("Administrators", "Domain Admins", "Enterprise Admins", "Schema Admins")
| KEEP @timestamp, host.name, user.name, winlog.event_data.MemberName, group.name
```

```sigma
title: Member added to a privileged group
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID:
      - 4728
      - 4732
      - 4756
    TargetUserName:
      - 'Administrators'
      - 'Domain Admins'
      - 'Enterprise Admins'
      - 'Schema Admins'
  condition: selection
level: high
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

```esql
FROM logs-system.system-*
| WHERE @timestamp > NOW() - 7 days AND event.code == "7045"
| KEEP @timestamp, host.name, winlog.event_data.ServiceName, winlog.event_data.ImagePath, winlog.event_data.AccountName
```

```sigma
title: New service installed
logsource:
  product: windows
  service: system
detection:
  selection:
    Provider_Name: 'Service Control Manager'
    EventID: 7045
  condition: selection
level: low
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

```esql
FROM logs-system.security-*, logs-system.system-*
| WHERE @timestamp > NOW() - 30 days AND event.code IN ("1102", "104")
| KEEP @timestamp, host.name, user.name, event.code
```

```sigma
title: Security event log cleared
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 1102
  condition: selection
level: high
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

```esql
FROM logs-o365.audit-*
| WHERE @timestamp > NOW() - 30 days
  AND event.action IN ("New-InboxRule", "Set-InboxRule", "UpdateInboxRules")
| KEEP @timestamp, user.id, source.ip, event.action
```

```sigma
title: Inbox rule created or changed
logsource:
  product: m365
  service: audit
detection:
  selection:
    Operation:
      - 'New-InboxRule'
      - 'Set-InboxRule'
      - 'UpdateInboxRules'
  condition: selection
level: medium
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

```esql
FROM logs-endpoint.events.process-*
| WHERE @timestamp > NOW() - 7 days AND event.type == "start"
| STATS hosts = COUNT_DISTINCT(host.id), runs = COUNT(*) BY process.executable
| WHERE hosts <= 2
| SORT hosts ASC
```

```sigma
title: Process launch
name: process_launch
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '.exe'
  condition: selection
---
title: Process seen on few hosts
correlation:
  type: value_count
  rules:
    - process_launch
  group-by:
    - Image
  timespan: 7d
  condition:
    field: Computer
    lt: 3
level: low
```

## Sigma in one minute

Sigma is a YAML format for detection rules that isn't tied to any SIEM. A converter turns one rule into UDM, KQL, SPL and many others, so it's the format most teams share detections in.

```terms
logsource :: What data the rule needs: a `category` (`process_creation`), or a `product` and `service` (`windows` / `security`). The converter maps it to an index, table or log type.
detection :: Named selections of field conditions. Values in a list are OR; fields in one selection are AND.
condition :: How the selections combine: `selection`, `all of selection_*`, `selection and not filter`.
Modifiers :: Change how a value matches: `|contains`, `|endswith`, `|startswith`, `|re`, `|all`, `|cidr`, and `|windash` (also matches `/enc` and other dash variants).
Correlation :: Sigma 2 rules over other rules: `event_count`, `value_count` and `temporal`, grouped by fields over a `timespan`.
level :: `informational` to `critical`. A hint for triage, not a score.
```

```text
pip install sigma-cli
sigma plugin install splunk
sigma convert -t splunk -p splunk_windows rule.yml
```

**Read:** the converter is only as good as the field mapping (`-p` pipeline) for your data. Run the converted query and check it returns what the rule means before you schedule it.

## Before you trust a translation

| Check | Why |
| --- | --- |
| Where does the data live? | The same Windows event can be in `SecurityEvent`, `DeviceEvents` or nowhere, depending on the agent |
| How was it parsed? | UDM fields depend on the parser, SPL fields on the add-on, ECS fields on the Elastic integration. Look at one raw event first |
| Case and wildcards | `=` in SPL ignores case; `==` in KQL and ES\|QL doesn't; UDM needs `nocase` |
| Time | Each tool's default range differs. State it in the query | `WHERE @timestamp > NOW() - 7 days` or the time picker |
| Empty is not clean | Zero results from a source that isn't collected looks the same as zero results from a clean estate |
| Sigma pipelines | A converted Sigma rule uses the field names its pipeline assumes. Check them against your data |

Each language has its own field guide: [Google SecOps UDM](/field-guides/google-secops/), [Defender XDR and Sentinel](/field-guides/defender-sentinel/), [Splunk](/field-guides/splunk/) and [Elastic](/field-guides/elastic/).
| Two KQLs | Kibana's search bar also calls its language KQL (Kibana Query Language). It is a filter syntax, not Kusto: `process.name : "cmd.exe"` |
