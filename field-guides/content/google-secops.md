# Google SecOps: UDM search for investigations

A working reference for Unified Data Model (UDM) search in Google Security Operations (formerly Chronicle). The goal is investigating like a Tier 2 analyst: scope an alert, rebuild what happened on the host and the identity, prove or disprove a hypothesis, and hand over something a Tier 3 or incident lead can act on.

It is written for the SIEM side of SecOps (UDM search, statistics, YARA-L), not SOAR playbooks. Every hostname, user, IP and domain below is a placeholder.

> **Note:** Field population depends on the parser for each log source. If a query returns nothing, check the field is populated for that `metadata.log_type` before deciding the activity did not happen (see [Know your data first](#know-your-data-first)).

## How UDM is shaped

Every normalised event is a UDM record. Learn the shape once and every log source reads the same way: a Windows process launch, an EDR alert and a proxy log all describe *who did what to what*.

### The nouns

| Noun | Meaning | Typical use |
| --- | --- | --- |
| `principal` | The actor: the host, user or process that did the thing | Source host of a connection, parent process, logged-on user |
| `target` | The thing acted on | Child process, destination IP, file written, account logged in to |
| `src` | The source of a copy or move, distinct from the actor | Source file in a copy, source of a mailbox move |
| `intermediary` | Something in the middle | Proxy, load balancer, mail relay |
| `observer` | What saw and reported it | Firewall, IDS sensor, EDR agent |
| `about` | Anything else the event refers to | Attachments, IOCs, URLs in an email |

Each noun carries the same sub-objects: `hostname`, `ip`, `mac`, `asset_id`, `user`, `process`, `file`, `registry`, `url`, `port`, `location`, `cloud`, `resource` and more. So `principal.process.command_line` is the parent's command line and `target.process.command_line` is the child's.

### The metadata

| Field | Why it matters |
| --- | --- |
| `metadata.event_type` | The normalised action. Filter on this first in almost every query |
| `metadata.log_type` | The ingestion label, e.g. `WINEVTLOG`, `WINDOWS_SYSMON`, `CS_EDR`, `OFFICE_365`, `AZURE_AD` |
| `metadata.product_name` / `metadata.vendor_name` | Which product produced the log |
| `metadata.product_event_type` | The vendor's own event ID or name, e.g. `4625` or `ProcessRollup2` |
| `metadata.event_timestamp` | When it happened (event time) |
| `metadata.ingested_timestamp` | When SecOps received it. Gaps between the two explain "missing" events |
| `metadata.id` | Unique event ID. Use it to count events |

### Event types worth memorising

| Event type | What lands there |
| --- | --- |
| `PROCESS_LAUNCH` | Sysmon 1, 4688, EDR process events |
| `PROCESS_MODULE_LOAD`, `PROCESS_INJECTION`, `PROCESS_OPEN` | DLL loads, injection, handle access (LSASS access shows up here) |
| `NETWORK_CONNECTION` | Firewall, Sysmon 3, EDR network events |
| `NETWORK_DNS` | DNS queries and answers |
| `NETWORK_HTTP` | Proxy and web logs |
| `USER_LOGIN`, `USER_LOGOUT` | 4624, 4625, cloud sign-ins, VPN |
| `USER_CREATION`, `USER_CHANGE_PERMISSIONS`, `GROUP_MODIFICATION` | Account and group changes |
| `FILE_CREATION`, `FILE_MODIFICATION`, `FILE_DELETION`, `FILE_READ` | File activity |
| `REGISTRY_CREATION`, `REGISTRY_MODIFICATION`, `REGISTRY_DELETION` | Registry activity |
| `SCHEDULED_TASK_CREATION`, `SERVICE_CREATION` | Persistence mechanisms |
| `EMAIL_TRANSACTION` | Mail gateway and Microsoft 365 message trace |
| `USER_RESOURCE_ACCESS` | SaaS and cloud resource access |
| `STATUS_UPDATE`, `GENERIC_EVENT` | Catch-alls: anything the parser could not classify cleanly |

> **Watch for:** `GENERIC_EVENT` hides real activity. When a source maps most of its events there, filter on `metadata.product_event_type` instead of `metadata.event_type`.

### Security results and auth details

`security_result` is a repeated object holding the verdict side of an event: `security_result.action` (`ALLOW`, `BLOCK`, `QUARANTINE`, `FAIL`, `CHALLENGE`), `security_result.severity`, `security_result.rule_name`, `security_result.category_details` and `security_result.summary`.

Authentication events add `extensions.auth`. The `extensions.auth.mechanism` field maps Windows logon types to readable names:

| Windows logon type | `extensions.auth.mechanism` |
| --- | --- |
| 2 | `INTERACTIVE` |
| 3 | `NETWORK` |
| 4 | `BATCH` |
| 5 | `SERVICE` |
| 7 | `UNLOCK` |
| 8 | `NETWORK_CLEAR_TEXT` |
| 9 | `NEW_CREDENTIALS` |
| 10 | `REMOTE_INTERACTIVE` |
| 11 | `CACHED_INTERACTIVE` |

## Search syntax

UDM search is a filter language: each line is a condition on a field, and lines are joined with `AND` unless you say otherwise.

### Comparisons and logic

```udm
metadata.event_type = "PROCESS_LAUNCH"
AND principal.hostname = "WKS-0142"
AND NOT target.process.file.full_path = /\\Windows\\System32\\/ nocase
```

- Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, with `AND`, `OR`, `NOT` and parentheses.
- Enum values (event types, actions, mechanisms) are upper case strings: `"BLOCK"`, not `"block"`.
- Strings are case-sensitive unless you add `nocase`: `principal.user.userid = "j.smith" nocase`.
- Numbers are bare: `target.port = 3389`.
- Put brackets around every `OR`. Conditions on separate lines are joined with `AND`, and `AND` binds tighter than `OR`, so `a OR b` on its own line without brackets can match far more than you meant.

### Regular expressions

Wrap the pattern in slashes. Escape a literal backslash with another backslash, which matters on every Windows path.

```udm
target.process.file.full_path = /\\(cmd|powershell|pwsh|wscript|cscript|mshta)\.exe$/ nocase
```

The function form does the same and is easier to read for long patterns:

```udm
re.regex(target.process.command_line, `(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}`)
```

> **Tip:** Anchor your regex. An unanchored `/cmd\.exe/` also matches `wincmd.exe.lnk` and costs more to run. Use `$` for "ends with" and `\\` before the file name for "is this file".

### Presence and absence

An empty string means "not populated". This is the quickest way to see whether a parser filled a field.

```udm
metadata.event_type = "NETWORK_CONNECTION"
AND principal.hostname != ""
AND target.ip != ""
```

### Repeated fields

Some fields hold several values: `principal.ip`, `principal.user.email_addresses`, `security_result`, `about`, `network.dns.answers`. A condition on a repeated field matches if **any** value matches. Prefix the comparison with `all` when every value must match.

```udm
metadata.event_type = "USER_LOGIN"
AND all security_result.action != "BLOCK"
```

### Grouped fields

Grouped fields search one value across every noun at once. They are the fastest way to start on an indicator when you don't yet know where it appears.

```udm
ip = "203.0.113.45"
```

```udm
hostname = "wks-0142" nocase
```

The groups are `ip`, `hostname`, `user`, `email`, `domain`, `hash` and `file_path`. Once you know where the value sits, switch to the exact field: the query is faster and the results are easier to read.

### Network ranges and reference lists

```udm
metadata.event_type = "NETWORK_CONNECTION"
AND NOT net.ip_in_range_cidr(target.ip, "10.0.0.0/8")
AND NOT net.ip_in_range_cidr(target.ip, "172.16.0.0/12")
AND NOT net.ip_in_range_cidr(target.ip, "192.168.0.0/16")
```

Reference lists (`%name`) and data tables hold allow- and block-lists that you maintain once and reuse in search and rules:

```udm
principal.hostname in %domain_controllers
```

```udm
network.dns.questions.name in regex %suspicious_tld_patterns
```

```udm
target.ip in cidr %client_egress_ranges
```

### Useful functions

| Function | Use |
| --- | --- |
| `re.regex(field, pattern)` | Regex match |
| `re.capture(field, pattern)` | Pull part of a value out, e.g. a domain from a URL |
| `strings.to_lower(field)`, `strings.to_upper(field)` | Normalise case before grouping |
| `strings.concat(a, b)` | Build a combined key, such as `host:user` |
| `strings.coalesce(a, b)` | First populated value: `principal.hostname` or `principal.ip` |
| `net.ip_in_range_cidr(ip, cidr)` | Range checks |
| `timestamp.get_hour(seconds, "UTC")` | Hour of day, for out-of-hours activity |
| `timestamp.get_day_of_week(seconds)` | Day of week (1 = Sunday) |
| `arrays.length(field)` | Number of values in a repeated field |
| `math.abs(n)` | Absolute value |

> **Note:** Function support in search is a subset of what YARA-L allows and grows with each release. If a function errors in search, it usually still works in a rule.

## Know your data first

Before hunting, find out what the tenant actually has. Two minutes here saves an hour of wondering why a query is empty. These use statistics, covered in the next section.

```udm
metadata.log_type != ""
$log_type = metadata.log_type
$event_type = metadata.event_type
match:
  $log_type, $event_type
outcome:
  $events = count(metadata.id)
order:
  $events desc
```

Then check whether the fields you rely on are filled for one source:

```udm
metadata.log_type = "WINEVTLOG"
metadata.event_type = "PROCESS_LAUNCH"
$host = principal.hostname
match:
  $host
outcome:
  $events = count(metadata.id)
  $with_cmdline = count_distinct(target.process.command_line)
  $with_parent = count_distinct(principal.process.file.full_path)
  $with_hash = count_distinct(target.process.file.sha256)
order:
  $events desc
limit:
  20
```

> **Defender view:** Windows 4688 events carry no parent command line or hashes unless auditing is configured for them; Sysmon and EDR do. Knowing which hosts send which source tells you which questions you can answer on each machine.

## Statistics and aggregation

Raw search answers "show me the events". Statistics answer "how many, how often, how unusual", and that is where Tier 2 work lives. A statistics query adds sections after the filter:

- **Placeholder variables** (`$name = field`) name the fields you group by or measure.
- **`match:`** lists the variables to group by.
- **`outcome:`** computes values per group.
- **`order:`** sorts by an outcome or match variable (`asc` or `desc`).
- **`limit:`** caps the rows returned.

### Aggregate functions

| Function | Returns |
| --- | --- |
| `count(field)` | Number of events |
| `count_distinct(field)` | Number of different values |
| `sum(field)`, `avg(field)`, `min(field)`, `max(field)` | Arithmetic over numeric fields |
| `stddev(field)` | Spread, for spotting outliers and steady beacons |
| `array(field)`, `array_distinct(field)` | The values themselves, to read without another pivot |
| `earliest(field)`, `latest(field)` | First and last timestamps |

### Rare process paths across the estate

The rarest binaries are worth a look on any estate.

```udm
metadata.event_type = "PROCESS_LAUNCH"
$path = strings.to_lower(target.process.file.full_path)
match:
  $path
outcome:
  $hosts = count_distinct(principal.hostname)
  $runs = count(metadata.id)
  $example_cmdline = array_distinct(target.process.command_line)
order:
  $hosts asc, $runs asc
limit:
  100
```

### Who talks to a domain

```udm
metadata.event_type = "NETWORK_DNS"
network.dns.questions.name = /(^|\.)example-cdn\.top$/ nocase
$host = principal.hostname
match:
  $host
outcome:
  $queries = count(metadata.id)
  $first = earliest(metadata.event_timestamp.seconds)
  $last = latest(metadata.event_timestamp.seconds)
  $names = array_distinct(network.dns.questions.name)
order:
  $first asc
```

`$first` across hosts shows which machine queried it first: often patient zero.

### Activity by hour

```udm
metadata.event_type = "USER_LOGIN"
target.user.userid = "j.smith" nocase
$hour = timestamp.get_hour(metadata.event_timestamp.seconds, "Europe/London")
match:
  $hour
outcome:
  $logins = count(metadata.id)
  $sources = array_distinct(principal.ip)
order:
  $hour asc
```

> **Tip:** Run aggregations over a wide window (7 to 30 days) to set a baseline, then narrow the window around the incident. "Unusual" only means something against a baseline.

## Pivoting: the Tier 2 loop

A Tier 1 analyst confirms the alert. A Tier 2 analyst scopes it. Every investigation follows the same loop:

1. **Anchor.** Pin the alert down to an exact host, user, process and time.
2. **Expand.** Look at everything that anchor did in a window around it (±30 minutes, then ±24 hours).
3. **Pivot.** Take each new indicator (hash, domain, IP, account) and search the whole estate for it.
4. **Scope.** Count the hosts and users touched. Decide whether it is one machine or a campaign.
5. **Explain.** Build the timeline and state what happened, how sure you are, and what is still unknown.

### Pivot ladder

| You have | Pivot to | Query starts with |
| --- | --- | --- |
| Hostname | Everything it did | `principal.hostname = "HOST" nocase` |
| Process | Its parent, children and network | `principal.process.pid` or `principal.process.product_specific_process_id` |
| Hash | Every host that ran it | `target.process.file.sha256 = "…"` or `hash = "…"` |
| Domain | Every host that resolved it, then the IPs | `network.dns.questions.name = "…"` |
| IP | Connections, logins from it, DNS answers | `ip = "…"` |
| User | Logins, hosts, cloud activity | `user = "…"` then exact fields |
| Email | Recipients, clicks, attachments | `network.email.from = "…"` |

### Rebuild a process tree

EDR sources usually expose a stable process ID in `product_specific_process_id`. Start from the suspicious process and walk up and down.

Children of a process:

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.hostname = "WKS-0142" nocase
principal.process.product_specific_process_id = "PROC-ID-FROM-ALERT"
```

Its parent (the alert's process appears as the target in the parent's launch event):

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.hostname = "WKS-0142" nocase
target.process.product_specific_process_id = "PROC-ID-FROM-ALERT"
```

Everything else the process touched:

```udm
principal.hostname = "WKS-0142" nocase
principal.process.product_specific_process_id = "PROC-ID-FROM-ALERT"
metadata.event_type != "PROCESS_LAUNCH"
```

> **Watch for:** Windows reuses PIDs. When the source only gives `pid`, always pair it with the hostname and a tight time window, and confirm the image path matches.

## Investigation playbooks

Each playbook gives a hunting query, a scoping query and what a real positive tends to look like. Swap the placeholders for the alert's values.

### Encoded or obfuscated PowerShell

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.full_path = /\\(powershell|pwsh)\.exe$/ nocase
(
  re.regex(target.process.command_line, `(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}`)
  OR target.process.command_line = /(iex|invoke-expression|downloadstring|frombase64string|-w(indowstyle)? h(idden)?)/ nocase
)
```

Scope by parent: PowerShell launched by an Office app, a browser or `wmiprvse.exe` matters far more than PowerShell launched by a management agent.

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.full_path = /\\(powershell|pwsh)\.exe$/ nocase
$parent = strings.to_lower(principal.process.file.full_path)
match:
  $parent
outcome:
  $hosts = count_distinct(principal.hostname)
  $launches = count(metadata.id)
order:
  $hosts asc
```

> **Defender view:** Decode the base64 (it is UTF-16LE) before deciding anything. A management agent's encoded command decodes to inventory scripts; a malicious one decodes to a download cradle or a reflective loader.

### Office application spawning a shell

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.process.file.full_path = /\\(winword|excel|powerpnt|outlook|onenote|msaccess)\.exe$/ nocase
target.process.file.full_path = /\\(cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|certutil|bitsadmin)\.exe$/ nocase
```

Then find the document. Look for files written by the Office process, and the email that delivered them, in the minutes before:

```udm
principal.hostname = "WKS-0142" nocase
principal.process.file.full_path = /\\(winword|excel|outlook)\.exe$/ nocase
metadata.event_type = "FILE_CREATION"
```

### Living-off-the-land binaries

```udm
metadata.event_type = "PROCESS_LAUNCH"
(
  (target.process.file.full_path = /\\certutil\.exe$/ nocase AND target.process.command_line = /(urlcache|verifyctl|-decode)/ nocase)
  OR (target.process.file.full_path = /\\mshta\.exe$/ nocase AND target.process.command_line = /(https?:|javascript:|vbscript:)/ nocase)
  OR (target.process.file.full_path = /\\rundll32\.exe$/ nocase AND target.process.command_line = /(javascript:|\\appdata\\|\\temp\\|,#\d+)/ nocase)
  OR (target.process.file.full_path = /\\regsvr32\.exe$/ nocase AND target.process.command_line = /\/i:https?:/ nocase)
  OR (target.process.file.full_path = /\\bitsadmin\.exe$/ nocase AND target.process.command_line = /\/transfer/ nocase)
)
```

### Credential access: LSASS

```udm
metadata.event_type = "PROCESS_OPEN"
target.process.file.full_path = /\\lsass\.exe$/ nocase
NOT principal.process.file.full_path = /\\(MsMpEng|csrss|wininit|svchost|lsm)\.exe$/ nocase
```

```udm
metadata.event_type = "PROCESS_LAUNCH"
(
  target.process.command_line = /comsvcs(\.dll)?.{0,40}minidump/ nocase
  OR target.process.command_line = /procdump.{0,80}lsass/ nocase
  OR target.process.command_line = /sekurlsa|lsadump|kerberos::/ nocase
)
```

> **Watch for:** Access rights matter more than access itself. Many tools open LSASS for harmless reasons; a dump needs `PROCESS_VM_READ`. If the source records access masks, filter on them.

### Password spraying and brute force

One source, many accounts, mostly failures: a spray.

```udm
metadata.event_type = "USER_LOGIN"
(security_result.action = "BLOCK" OR security_result.action = "FAIL")
$source = principal.ip
match:
  $source
outcome:
  $failures = count(metadata.id)
  $accounts = count_distinct(target.user.userid)
  $sample_accounts = array_distinct(target.user.userid)
order:
  $accounts desc
limit:
  50
```

One account, many failures, then a success: a brute force that worked. Check for a success from the same sources:

```udm
metadata.event_type = "USER_LOGIN"
target.user.userid = "j.smith" nocase
$result = security_result.action
$source = principal.ip
match:
  $source, $result
outcome:
  $count = count(metadata.id)
  $first = earliest(metadata.event_timestamp.seconds)
  $last = latest(metadata.event_timestamp.seconds)
order:
  $first asc
```

> **Note:** Parsers differ on failures. Some set `security_result.action = "BLOCK"`, some `"FAIL"`, and Windows sources also keep `metadata.product_event_type = "4625"`. Check which your sources use with a quick aggregation before trusting a count.

### Impossible travel and unusual sign-ins

```udm
metadata.event_type = "USER_LOGIN"
metadata.log_type = "AZURE_AD"
target.user.userid = "j.smith@example.com" nocase
$country = principal.location.country_or_region
match:
  $country
outcome:
  $logins = count(metadata.id)
  $ips = array_distinct(principal.ip)
  $apps = array_distinct(target.application)
  $first = earliest(metadata.event_timestamp.seconds)
  $last = latest(metadata.event_timestamp.seconds)
order:
  $first asc
```

Two countries with overlapping first and last times is the signal. Then check the user agent and whether MFA was satisfied before calling it.

### Lateral movement

Remote logons between workstations are rare in most estates. Workstation-to-workstation SMB, RDP or WinRM deserves a look.

```udm
metadata.event_type = "USER_LOGIN"
(extensions.auth.mechanism = "REMOTE_INTERACTIVE" OR extensions.auth.mechanism = "NETWORK")
target.hostname = /^WKS-/ nocase
principal.hostname = /^WKS-/ nocase
$pair = strings.concat(principal.hostname, " -> ", target.hostname)
match:
  $pair
outcome:
  $logons = count(metadata.id)
  $users = array_distinct(target.user.userid)
order:
  $logons desc
```

```udm
metadata.event_type = "NETWORK_CONNECTION"
(target.port = 445 OR target.port = 3389 OR target.port = 5985 OR target.port = 5986)
net.ip_in_range_cidr(principal.ip, "10.0.0.0/8")
net.ip_in_range_cidr(target.ip, "10.0.0.0/8")
$source = principal.hostname
match:
  $source
outcome:
  $targets = count_distinct(target.ip)
  $ports = array_distinct(target.port)
order:
  $targets desc
limit:
  25
```

One host touching dozens of others on 445 in a short window is either a scanner, a management server or someone enumerating. Know which hosts are the first two.

Remote execution leaves a trail on the target: services created with odd binaries (PsExec-style) and processes launched by `wmiprvse.exe` or `wsmprovhost.exe`.

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.process.file.full_path = /\\(wmiprvse|wsmprovhost|services)\.exe$/ nocase
target.process.file.full_path = /\\(cmd|powershell|pwsh|rundll32)\.exe$/ nocase
```

### Persistence

```udm
(
  metadata.event_type = "SCHEDULED_TASK_CREATION"
  OR (metadata.event_type = "PROCESS_LAUNCH" AND target.process.command_line = /schtasks(\.exe)?.{0,20}\/create/ nocase)
)
principal.hostname = "WKS-0142" nocase
```

```udm
(metadata.event_type = "REGISTRY_MODIFICATION" OR metadata.event_type = "REGISTRY_CREATION")
target.registry.registry_key = /\\(CurrentVersion\\(Run|RunOnce|Policies\\Explorer\\Run)|Winlogon|Image File Execution Options)/ nocase
NOT principal.process.file.full_path = /\\(msiexec|TrustedInstaller)\.exe$/ nocase
```

```udm
metadata.event_type = "SERVICE_CREATION"
NOT target.process.file.full_path = /^"?C:\\(Windows|Program Files)/ nocase
```

### Command and control: beaconing

Beacons call home on a schedule. Low variation in the gap between connections is the giveaway, but data volume and the destination's rarity carry as much weight.

```udm
(metadata.event_type = "NETWORK_HTTP" OR metadata.event_type = "NETWORK_CONNECTION")
NOT net.ip_in_range_cidr(target.ip, "10.0.0.0/8")
$host = principal.hostname
$dest = strings.coalesce(target.hostname, target.ip)
match:
  $host, $dest
outcome:
  $connections = count(metadata.id)
  $sent = sum(network.sent_bytes)
  $received = sum(network.received_bytes)
  $first = earliest(metadata.event_timestamp.seconds)
  $last = latest(metadata.event_timestamp.seconds)
order:
  $connections desc
limit:
  100
```

Read it with three questions: how many hosts talk to this destination (one is suspicious), do the connections run all day including nights, and are the byte counts small and repetitive?

DNS gives the same signal with less noise:

```udm
metadata.event_type = "NETWORK_DNS"
$domain = re.capture(network.dns.questions.name, `([^.]+\.[^.]+)$`)
match:
  $domain
outcome:
  $hosts = count_distinct(principal.hostname)
  $queries = count(metadata.id)
  $subdomains = count_distinct(network.dns.questions.name)
order:
  $hosts asc, $subdomains desc
limit:
  100
```

A parent domain with one or two hosts and hundreds of unique subdomains points to DNS tunnelling or DGA traffic.

### Data exfiltration

```udm
(metadata.event_type = "NETWORK_CONNECTION" OR metadata.event_type = "NETWORK_HTTP")
NOT net.ip_in_range_cidr(target.ip, "10.0.0.0/8")
NOT net.ip_in_range_cidr(target.ip, "172.16.0.0/12")
NOT net.ip_in_range_cidr(target.ip, "192.168.0.0/16")
$host = principal.hostname
match:
  $host
outcome:
  $sent_mb = sum(network.sent_bytes) / 1048576
  $destinations = count_distinct(target.ip)
order:
  $sent_mb desc
limit:
  25
```

Then look for staging on the host: archives created shortly before the upload.

```udm
metadata.event_type = "FILE_CREATION"
principal.hostname = "WKS-0142" nocase
target.file.full_path = /\.(zip|7z|rar|tar|gz)$/ nocase
```

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.command_line = /(7z|7za|rar|winrar)(\.exe)?\s+a\s|compress-archive|rclone|megacmd/ nocase
```

### Phishing

```udm
metadata.event_type = "EMAIL_TRANSACTION"
network.email.from = /@lookalike-domain\.com$/ nocase
$recipient = network.email.to
match:
  $recipient
outcome:
  $messages = count(metadata.id)
  $subjects = array_distinct(network.email.subject)
  $actions = array_distinct(security_result.action)
```

Then, for the recipients who received it, look for a click or a download: DNS or HTTP to the phishing domain from their hosts, in the hour after delivery.

```udm
(metadata.event_type = "NETWORK_DNS" OR metadata.event_type = "NETWORK_HTTP")
(network.dns.questions.name = /lookalike-domain\.com$/ nocase OR target.url = /lookalike-domain\.com/ nocase)
```

### Account and privilege changes

```udm
(metadata.event_type = "GROUP_MODIFICATION" OR metadata.event_type = "USER_CHANGE_PERMISSIONS")
target.group.group_display_name = /(domain admins|enterprise admins|administrators|global administrator)/ nocase
```

```udm
metadata.event_type = "USER_CREATION"
$creator = principal.user.userid
match:
  $creator
outcome:
  $created = count(metadata.id)
  $accounts = array_distinct(target.user.userid)
order:
  $created desc
```

## From search to detection: YARA-L 2.0

When a hunt finds something worth catching every time, turn it into a rule. YARA-L uses the same field paths with an event variable in front (`$e.`), plus sections for matching over time.

### Single-event rule

```yaral
rule office_spawns_shell {
  meta:
    author = "paracausal telemetry"
    description = "Office application launching a script host or shell"
    severity = "MEDIUM"
    mitre_attack_technique = "T1204.002"

  events:
    $e.metadata.event_type = "PROCESS_LAUNCH"
    $e.principal.process.file.full_path = /\\(winword|excel|powerpnt|outlook)\.exe$/ nocase
    $e.target.process.file.full_path = /\\(cmd|powershell|pwsh|wscript|cscript|mshta)\.exe$/ nocase
    $e.principal.hostname = $host

  match:
    $host over 10m

  outcome:
    $risk_score = 65
    $cmdlines = array_distinct($e.target.process.command_line)
    $principal_user = array_distinct($e.principal.user.userid)

  condition:
    $e
}
```

### Multi-event rule: failures then success

```yaral
rule brute_force_then_success {
  meta:
    description = "Ten or more failed logins for one account followed by a success from the same source"
    severity = "HIGH"

  events:
    $fail.metadata.event_type = "USER_LOGIN"
    $fail.security_result.action = "BLOCK"
    $fail.target.user.userid = $user
    $fail.principal.ip = $ip

    $ok.metadata.event_type = "USER_LOGIN"
    $ok.security_result.action = "ALLOW"
    $ok.target.user.userid = $user
    $ok.principal.ip = $ip

    $fail.metadata.event_timestamp.seconds < $ok.metadata.event_timestamp.seconds

  match:
    $user, $ip over 30m

  outcome:
    $failures = count_distinct($fail.metadata.id)
    $risk_score = 80

  condition:
    #fail >= 10 and $ok
}
```

### Rule-writing habits

- **Join on placeholders.** `$e.principal.hostname = $host` and `match: $host over 10m` group detections per host instead of firing per event.
- **Use `outcome:` for context.** Put the command lines, users and counts the next analyst needs in the detection itself.
- **Count with `#`.** `#e > 5` means more than five matching events in the window.
- **Use `!` for absence.** `$a and !$b` fires when the expected follow-up never came (an alert with no matching EDR response, for example).
- **Keep exclusions in reference lists.** Approved admin tools and scanners belong in `%lists`, not hard-coded into the rule.
- **Test before enabling.** Run the rule over 30 days of history and read every hit before switching alerting on.

## Gotchas

- **Event time and ingestion time differ.** A delayed log source can make an event appear "late". When an event seems missing, widen the search window by ingestion time.
- **Hostnames are not normalised.** `WKS-0142`, `wks-0142` and `wks-0142.corp.example` are three strings. Use `nocase` and a regex for the FQDN, or join on `principal.asset_id` where the source provides it.
- **NAT and proxies hide sources.** An egress IP is the firewall, not the user. Pivot through the proxy or NAT logs to reach the real host.
- **Parsers change.** A parser update can move a value to a different field. If a saved search stops returning results, check the raw log against the UDM event first.
- **Searches are capped.** Very broad searches return a sample, not everything. Aggregate instead of scrolling, and narrow with `metadata.event_type` and `metadata.log_type` first.
- **`!=` on a repeated field means "any value differs".** To exclude every value, use `all … !=` or a `NOT` on the positive match.
- **Enum values are upper case.** `"process_launch"` matches nothing.

## Writing it up

A Tier 2 handover answers five questions, in this order:

1. **What happened?** One or two sentences a manager can read.
2. **How sure are you?** Confirmed, likely or possible, and why.
3. **What is the scope?** Hosts, users, accounts and time range touched, with the queries that prove it.
4. **What is still unknown?** Gaps in the logs and questions you couldn't answer.
5. **What should happen next?** Containment, eradication, more collection, or close with a reason.

> **Tip:** Save each query you ran in the case notes alongside its time range. The next analyst, or you in three weeks, can rerun the investigation instead of rebuilding it.
