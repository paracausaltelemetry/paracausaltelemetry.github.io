# Google SecOps: UDM search quick reference

Find the task, copy the query, swap the placeholders (every host, user, IP and domain below is one). Google SecOps was formerly Chronicle.

## Where the data comes from

```layers
Sources :: EDR[compute]{laptop}, Firewalls and proxies[security]{firewall}, Cloud audit logs[external]{cloud}, Identity[security]{key}
Ingestion :: Forwarders and feeds[network]{router}, Parsers[app]{function}
Platform{gcp/secops} :: UDM events[data]{db}, Entity graph[data]{globe}
Use :: UDM search[app]{app}, YARA-L rules[security]{shield}, Cases and SOAR[mgmt]{alert}
EDR -> Forwarders and feeds
Firewalls and proxies -> Forwarders and feeds
Cloud audit logs -> Forwarders and feeds: API feeds
Identity -> Forwarders and feeds
Forwarders and feeds -> Parsers: raw logs
Parsers -> UDM events: normalised
Parsers -> Entity graph: context
UDM events -> UDM search
UDM events -> YARA-L rules
Entity graph -> YARA-L rules
YARA-L rules -> Cases and SOAR: detections
```

**Read:** everything below works on UDM events, so a bad parser (wrong field, `GENERIC_EVENT`) breaks searches and rules alike. When a query looks wrong, check the parser before the query.

## Syntax cheat sheet

Coming from KQL or SPL? The [query translator](/field-guides/query-translator/) has the same operations and hunts in all three.

| Want | Write |
| --- | --- |
| Exact match | `principal.hostname = "WKS-0142"` |
| Ignore case | `principal.user.userid = "j.smith" nocase` |
| Not equal | `security_result.action != "ALLOW"` |
| Field is populated | `target.ip != ""` |
| Regex | `target.process.file.full_path = /\\cmd\.exe$/ nocase` |
| Regex (function) | `re.regex(target.process.command_line, pattern)` |
| Either value | `(target.port = 3389 OR target.port = 5985)` |
| Exclude | `NOT principal.process.file.full_path = /\\MsMpEng\.exe$/ nocase` |
| Greater / less than | `target.port > 1024`, `principal.session.duration_seconds <= 3600` |
| Time (epoch seconds) | `metadata.event_timestamp.seconds >= 1729728000` |
| No repeated value is X | `NOT principal.ip = "10.0.0.5"` |
| Any noun at once | `ip = "203.0.113.45"`, `hostname = "wks-0142" nocase` |
| IP in range | `net.ip_in_range_cidr(target.ip, "10.0.0.0/8")` |
| In a reference list | `principal.hostname in %domain_controllers` |
| Regex list | `network.dns.questions.name in regex %bad_tlds` |
| CIDR list | `target.ip in cidr %client_egress` |
| Cap the rows | `limit:` then `25` on the next line |

Rules of thumb:

- Separate lines are joined with `AND` (writing `AND` also works). **Bracket every `OR`.**
- Enum values are upper case: `"PROCESS_LAUNCH"`, `"BLOCK"`.
- Enum fields (`metadata.event_type`, `security_result.action`) take no regex. `OR` the values instead.
- Repeated fields (`principal.ip`, `target.user.email_addresses`) match if **any** value matches, and search has no `all`. So `principal.ip != "10.0.0.5"` still returns a host that also has `10.0.0.5`. Use `NOT principal.ip = "10.0.0.5"`.
- Field types: string, integer, float, boolean (`true` / `false` only), timestamp (epoch seconds).
- Results default to 30,000 rows. Raise it to 1,000,000 in Search Settings, or aggregate.
- Escape backslashes in paths: `\\Windows\\System32\\`.
- Anchor regex with `$` or `^`. It is faster and stops false matches.
- Filter on `metadata.event_type` first, every time.

Grouped fields (search all nouns at once): `ip`, `hostname`, `user`, `email`, `domain`, `hash`, `file_path`.

## Statistics template

```udm
metadata.event_type = "PROCESS_LAUNCH"
$key = principal.hostname
match:
  $key
outcome:
  $events = count(metadata.id)
  $distinct = count_distinct(target.process.file.full_path)
  $values = array_distinct(target.process.command_line)
  $first = earliest(metadata.event_timestamp.seconds)
  $last = latest(metadata.event_timestamp.seconds)
order:
  $events desc
limit:
  50
```

| Function | Gives |
| --- | --- |
| `count(metadata.id)` | Events |
| `count_distinct(f)` | Distinct values |
| `sum(f)` `avg(f)` `min(f)` `max(f)` | Numbers |
| `stddev(f)` | Spread (steady beacons have little) |
| `array(f)` `array_distinct(f)` | The values themselves |
| `earliest(f)` `latest(f)` | First and last seen |
| `strings.to_lower(f)` | Normalise before grouping |
| `strings.concat(a, " -> ", b)` | Build a pair key |
| `strings.coalesce(a, b)` | First populated value |
| `re.capture(f, pattern)` | Pull part of a value out |
| `timestamp.get_hour(seconds, "Europe/London")` | Hour of day |
| `timestamp.get_day_of_week(seconds)` | Day (1 = Sunday) |

## Field map

| Question | Field |
| --- | --- |
| What happened? | `metadata.event_type` |
| Which source? | `metadata.log_type`, `metadata.product_name` |
| Vendor event ID | `metadata.product_event_type` (e.g. `4625`) |
| Which host? | `principal.hostname`, `principal.ip`, `principal.asset_id` |
| Which user did it? | `principal.user.userid` |
| Which account was logged in to? | `target.user.userid` |
| Parent process | `principal.process.file.full_path`, `principal.process.command_line` |
| Child process | `target.process.file.full_path`, `target.process.command_line` |
| Process ID (EDR) | `principal.process.product_specific_process_id` |
| Hash | `target.process.file.sha256`, `target.file.sha256` |
| File written | `target.file.full_path` |
| Registry key | `target.registry.registry_key`, `target.registry.registry_value_data` |
| Destination | `target.ip`, `target.port`, `target.hostname` |
| DNS query | `network.dns.questions.name` |
| URL | `target.url` |
| Bytes | `network.sent_bytes`, `network.received_bytes` |
| Verdict | `security_result.action`, `security_result.severity`, `security_result.rule_name` |
| Logon type | `extensions.auth.mechanism` |
| Country | `principal.location.country_or_region` |
| Email | `network.email.from`, `network.email.to`, `network.email.subject` |
| Event time / arrival time | `metadata.event_timestamp`, `metadata.ingested_timestamp` |

`principal` did it, `target` had it done to it, `observer` reported it, `intermediary` sat in the middle.

## Event types

| Event type | From |
| --- | --- |
| `PROCESS_LAUNCH` | Sysmon 1, 4688, EDR |
| `PROCESS_OPEN` | Handle access (LSASS) |
| `PROCESS_INJECTION` / `PROCESS_MODULE_LOAD` | Injection, DLL loads |
| `NETWORK_CONNECTION` | Firewall, Sysmon 3, EDR |
| `NETWORK_DNS` | DNS |
| `NETWORK_HTTP` | Proxy, web |
| `USER_LOGIN` / `USER_LOGOUT` | 4624, 4625, cloud sign-ins, VPN |
| `USER_CREATION` / `GROUP_MODIFICATION` / `USER_CHANGE_PERMISSIONS` | Account changes |
| `FILE_CREATION` / `FILE_MODIFICATION` / `FILE_DELETION` | Files |
| `REGISTRY_CREATION` / `REGISTRY_MODIFICATION` | Registry |
| `SCHEDULED_TASK_CREATION` / `SERVICE_CREATION` | Persistence |
| `EMAIL_TRANSACTION` | Mail gateway, M365 trace |
| `GENERIC_EVENT` / `STATUS_UPDATE` | Unclassified: filter on `metadata.product_event_type` instead |

### Logon types

| Windows type | `extensions.auth.mechanism` |
| --- | --- |
| 2 | `INTERACTIVE` |
| 3 | `NETWORK` |
| 4 / 5 | `BATCH` / `SERVICE` |
| 7 | `UNLOCK` |
| 9 | `NEW_CREDENTIALS` (runas /netonly) |
| 10 | `REMOTE_INTERACTIVE` (RDP) |
| 11 | `CACHED_INTERACTIVE` |

## Know your data

### What sources does the tenant have?

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

### Which hosts send command lines and hashes?

```udm
metadata.event_type = "PROCESS_LAUNCH"
$host = principal.hostname
match:
  $host
outcome:
  $events = count(metadata.id)
  $sources = array_distinct(metadata.log_type)
  $cmdlines = count_distinct(target.process.command_line)
  $hashes = count_distinct(target.process.file.sha256)
order:
  $events desc
```

**Read:** zero hashes means you can't pivot on hash for that host.

### Which value does this source use for a failed logon?

```udm
metadata.event_type = "USER_LOGIN"
$source = metadata.log_type
$action = security_result.action
match:
  $source, $action
outcome:
  $events = count(metadata.id)
```

## Scoping an alert

### Everything a host did

```udm
hostname = "WKS-0142" nocase
```

**Then:** aggregate by `metadata.event_type`, and narrow the time range to ±30 minutes around the alert.

### Everywhere an indicator appears

```udm
ip = "203.0.113.45"
```

```udm
hash = "SHA256-FROM-ALERT"
```

```udm
domain = "bad-domain.example"
```

### How many hosts ran a hash?

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.sha256 = "SHA256-FROM-ALERT"
$host = principal.hostname
match:
  $host
outcome:
  $runs = count(metadata.id)
  $first = earliest(metadata.event_timestamp.seconds)
  $paths = array_distinct(target.process.file.full_path)
order:
  $first asc
```

**Read:** the earliest `$first` is patient zero.

### Everything a user did

```udm
user = "j.smith" nocase
$type = metadata.event_type
$host = strings.coalesce(principal.hostname, target.hostname)
match:
  $type, $host
outcome:
  $events = count(metadata.id)
  $first = earliest(metadata.event_timestamp.seconds)
order:
  $first asc
```

## Raw log search

Use it when UDM looks wrong: a field is empty or missing, and you need to know whether the raw log has it (a parser gap) or not (a logging gap).

### Find a string in raw logs

```udm
raw = "203.0.113.45"
```

**Then:** pick the log types in the drop-down that opens under the search box, and keep the time range tight.

### Regex over raw logs

```udm
raw = /(?i)powershell.{0,40}-e(nc|ncodedcommand)?\s/
```

**Then:** if the raw log has the value and UDM doesn't, fix it with a parser extension, not in your query.

## Process trees

### Children of a process

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.hostname = "WKS-0142" nocase
principal.process.product_specific_process_id = "PROC-ID"
```

### Parent of a process

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.hostname = "WKS-0142" nocase
target.process.product_specific_process_id = "PROC-ID"
```

### Everything else the process did

```udm
principal.hostname = "WKS-0142" nocase
principal.process.product_specific_process_id = "PROC-ID"
metadata.event_type != "PROCESS_LAUNCH"
```

**Tune:** only `pid`? Pair it with the hostname and a tight time window, because Windows reuses PIDs.

### Rarest binaries in the estate

```udm
metadata.event_type = "PROCESS_LAUNCH"
$path = strings.to_lower(target.process.file.full_path)
match:
  $path
outcome:
  $hosts = count_distinct(principal.hostname)
  $runs = count(metadata.id)
  $cmdlines = array_distinct(target.process.command_line)
order:
  $hosts asc, $runs asc
limit:
  100
```

## Execution

### Encoded or obfuscated PowerShell

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.full_path = /\\(powershell|pwsh)\.exe$/ nocase
(
  re.regex(target.process.command_line, `(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}`)
  OR target.process.command_line = /(iex|invoke-expression|downloadstring|frombase64string|-w(indowstyle)? h(idden)?)/ nocase
)
```

**Tune:** decode the base64 (UTF-16LE). Exclude your RMM agent by its parent path.

### PowerShell by parent

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

**Read:** Office, a browser or `wmiprvse.exe` as the parent matters most.

### Office spawning a shell

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.process.file.full_path = /\\(winword|excel|powerpnt|outlook|onenote|msaccess)\.exe$/ nocase
target.process.file.full_path = /\\(cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|certutil|bitsadmin)\.exe$/ nocase
```

**Then:** find the document. `FILE_CREATION` by the Office process on the same host, in the minutes before.

### LOLBins

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

### Execution from user-writable paths

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.full_path = /\\(Users\\[^\\]+\\(AppData|Downloads|Desktop)|ProgramData|Windows\\Temp)\\[^\\]+\.(exe|scr|com)$/ nocase
$path = strings.to_lower(target.process.file.full_path)
match:
  $path
outcome:
  $hosts = count_distinct(principal.hostname)
order:
  $hosts asc
```

## Credential access

### LSASS handle access

```udm
metadata.event_type = "PROCESS_OPEN"
target.process.file.full_path = /\\lsass\.exe$/ nocase
NOT principal.process.file.full_path = /\\(MsMpEng|csrss|wininit|svchost|lsm)\.exe$/ nocase
```

**Tune:** a dump needs `PROCESS_VM_READ`. Filter on the access mask if the source records it.

### LSASS dump commands

```udm
metadata.event_type = "PROCESS_LAUNCH"
(
  target.process.command_line = /comsvcs(\.dll)?.{0,40}minidump/ nocase
  OR target.process.command_line = /procdump.{0,80}lsass/ nocase
  OR target.process.command_line = /sekurlsa|lsadump|kerberos::/ nocase
)
```

### Password spray: one source, many accounts

```udm
metadata.event_type = "USER_LOGIN"
(security_result.action = "BLOCK" OR security_result.action = "FAIL")
$source = principal.ip
match:
  $source
outcome:
  $failures = count(metadata.id)
  $accounts = count_distinct(target.user.userid)
  $sample = array_distinct(target.user.userid)
order:
  $accounts desc
limit:
  50
```

### Brute force that worked

```udm
metadata.event_type = "USER_LOGIN"
target.user.userid = "j.smith" nocase
$source = principal.ip
$result = security_result.action
match:
  $source, $result
outcome:
  $count = count(metadata.id)
  $first = earliest(metadata.event_timestamp.seconds)
  $last = latest(metadata.event_timestamp.seconds)
order:
  $first asc
```

**Read:** many `BLOCK` rows, then an `ALLOW` from the same source.

## Identity and cloud

### Sign-ins by country

```udm
metadata.event_type = "USER_LOGIN"
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

**Read:** two countries with overlapping first and last times. Then check the user agent and MFA.

### Out-of-hours logins

```udm
metadata.event_type = "USER_LOGIN"
security_result.action = "ALLOW"
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

### Added to a privileged group

```udm
(metadata.event_type = "GROUP_MODIFICATION" OR metadata.event_type = "USER_CHANGE_PERMISSIONS")
target.group.group_display_name = /(domain admins|enterprise admins|administrators|global administrator)/ nocase
```

### Who is creating accounts?

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

## Lateral movement

### Workstation-to-workstation logons

```udm
metadata.event_type = "USER_LOGIN"
(extensions.auth.mechanism = "REMOTE_INTERACTIVE" OR extensions.auth.mechanism = "NETWORK")
principal.hostname = /^WKS-/ nocase
target.hostname = /^WKS-/ nocase
$pair = strings.concat(principal.hostname, " -> ", target.hostname)
match:
  $pair
outcome:
  $logons = count(metadata.id)
  $users = array_distinct(target.user.userid)
order:
  $logons desc
```

### One host fanning out on admin ports

```udm
metadata.event_type = "NETWORK_CONNECTION"
(target.port = 445 OR target.port = 3389 OR target.port = 5985 OR target.port = 5986)
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

**Tune:** put scanners and management servers in a reference list and exclude it.

### Remote execution on the target

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.process.file.full_path = /\\(wmiprvse|wsmprovhost|services)\.exe$/ nocase
target.process.file.full_path = /\\(cmd|powershell|pwsh|rundll32)\.exe$/ nocase
```

### Explicit credentials (runas, pass-the-hash tooling)

```udm
metadata.event_type = "USER_LOGIN"
extensions.auth.mechanism = "NEW_CREDENTIALS"
```

## Persistence

### Scheduled tasks

```udm
(
  metadata.event_type = "SCHEDULED_TASK_CREATION"
  OR (metadata.event_type = "PROCESS_LAUNCH" AND target.process.command_line = /schtasks(\.exe)?.{0,20}\/create/ nocase)
)
```

### Run keys, Winlogon, IFEO

```udm
(metadata.event_type = "REGISTRY_MODIFICATION" OR metadata.event_type = "REGISTRY_CREATION")
target.registry.registry_key = /\\(CurrentVersion\\(Run|RunOnce|Policies\\Explorer\\Run)|Winlogon|Image File Execution Options)/ nocase
NOT principal.process.file.full_path = /\\(msiexec|TrustedInstaller)\.exe$/ nocase
```

### Services outside Windows and Program Files

```udm
metadata.event_type = "SERVICE_CREATION"
NOT target.process.file.full_path = /^"?C:\\(Windows|Program Files)/ nocase
```

## Command and control

### Talkative destinations

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

**Read:** one host, all day and night, small and regular byte counts.

### DNS tunnelling and DGA

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

**Read:** one or two hosts and hundreds of unique subdomains.

### Who resolved a domain first?

```udm
metadata.event_type = "NETWORK_DNS"
network.dns.questions.name = /(^|\.)bad-domain\.example$/ nocase
$host = principal.hostname
match:
  $host
outcome:
  $queries = count(metadata.id)
  $first = earliest(metadata.event_timestamp.seconds)
order:
  $first asc
```

## Exfiltration

### Top uploaders to the internet

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

### Staging: archives created

```udm
metadata.event_type = "FILE_CREATION"
principal.hostname = "WKS-0142" nocase
target.file.full_path = /\.(zip|7z|rar|tar|gz)$/ nocase
```

### Archivers and sync tools

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.command_line = /(7z|7za|rar|winrar)(\.exe)?\s+a\s|compress-archive|rclone|megacmd/ nocase
```

## Email

### Who received it?

```udm
metadata.event_type = "EMAIL_TRANSACTION"
network.email.from = /@lookalike-domain\.example$/ nocase
$recipient = network.email.to
match:
  $recipient
outcome:
  $messages = count(metadata.id)
  $subjects = array_distinct(network.email.subject)
  $actions = array_distinct(security_result.action)
```

### Who clicked?

```udm
(metadata.event_type = "NETWORK_DNS" OR metadata.event_type = "NETWORK_HTTP")
(network.dns.questions.name = /lookalike-domain\.example$/ nocase OR target.url = /lookalike-domain\.example/ nocase)
```

## YARA-L rules

Same field paths as search, prefixed with an event variable (`$e.`). Only YARA-L 2.0 runs in SecOps.

### Rule skeleton

```yaral
rule descriptive_rule_name {
  meta:
    author = "analyst@example.com"
    description = "What it detects and why"
    severity = "Medium"

  events:
    $e.metadata.event_type = "USER_LOGIN"
    $e.principal.user.userid = $user

  match:
    $user over 10m

  outcome:
    $risk_score = 50
    $hosts = array_distinct($e.principal.hostname)

  condition:
    $e

  options:
    allow_zero_values = false
}
```

| Section | Holds | Required |
| --- | --- | --- |
| `meta` | `key = "value"` pairs about the rule | Yes |
| `events` | Filters, placeholder assignments, joins | Yes |
| `match` | Placeholders to group by, and the window (1m to 48h) | No |
| `outcome` | Up to 20 values stored on the detection | No |
| `condition` | What must be true to fire | Yes |
| `options` | `allow_zero_values`, `suppression_window` | No |

### Meta keys

| Key | Value |
| --- | --- |
| `author` | Name or email |
| `description` | What it detects |
| `rule_id` | `mr_` + a UUIDv4 |
| `rule_name` | Short, unique, human-friendly |
| `severity` / `priority` | Info, Low, Medium, High, Critical |
| `platform` | Only if platform-specific, e.g. GCP |
| `data_source` | Logs it runs on and can be tested with |
| `reference` | Vendor docs, write-up, internal KB |
| `tags` | Free keywords |
| `mitre_attack_tactic`, `mitre_attack_technique`, `mitre_attack_url`, `mitre_attack_version` | ATT&CK mapping |

### Variables and joins

| Want | Write |
| --- | --- |
| Event variable (filter) | `$login.metadata.event_type = "USER_LOGIN"` |
| Placeholder (capture a value) | `$login.principal.ip = $src_ip` |
| Direct join | `$a.principal.hostname = $b.src.hostname` (no arithmetic) |
| Transitive join | `$a.principal.ip = $ip` and `$b.target.ip = $ip` |
| Exclude a list | `not $e.principal.hostname in %approved_admin_hosts` |

Lines on the same event variable are joined with `AND`. Name event variables after what they hold (`$fail`, `$ok`, `$login`).

### Match windows

| Want | Write |
| --- | --- |
| Group, order doesn't matter (hop window) | `$user over 30m` |
| B must follow A (sliding window) | `$user over 30m after $fail` |
| B must come before A | `$user over 30m before $ok` |

**Tune:** sliding windows are slower. Use them only for ordering or for "didn't happen" rules, with tight event filters.

### Outcome

| Want | Write |
| --- | --- |
| Static value | `$mitre = "T1110"` |
| Count | `$failures = count($fail.metadata.id)` |
| List of values | `$ips = array_distinct($e.principal.ip)` |
| Conditional | `$severity = if($failures > 20, "HIGH", "MEDIUM")` |
| Numeric conditional (false gives 0) | `$encoded = if(re.regex($e.target.process.command_line, "-enc"), 1)` |
| Risk score | `$risk_score = if($failures > 50, 90, 70)` |
| Maths | `$mb = sum($e.network.sent_bytes) / 1048576` (`%` on integers only) |

- Aggregate repeated fields in single-event rules, and every field in multi-event rules.
- `array()` and `array_distinct()` keep 25 values at most.
- An outcome can use an earlier outcome, but not inside an aggregation, `arrays.length()`, or with `any` / `all`.
- `$risk_score` defaults to 40 when the rule alerts and 15 when it doesn't. Agree a scale with your team.

### Condition

| Want | Write |
| --- | --- |
| Single event | `$e` |
| Count threshold | `#fail >= 10` |
| Both happened | `#fail >= 10 and $ok` |
| Didn't happen (needs a sliding window) | `$a and !$b` |
| Either value | `$ip or $hostname` (same event variable only) |

### Options and suppression

```yaral
  outcome:
    $suppression_key = $user
  options:
    suppression_window = 1h
```

`suppression_window` only works on single-event rules. `$suppression_key` limits the suppression to repeats of the same value.

### Zero values

Placeholders in `match` skip empty values by default: `""`, `0`, `false`, and an enum's first (unspecified) value. Two catches:

- A placeholder built from a function (`strings.to_lower(...)`) is **not** filtered. Add `$x != ""` yourself.
- `allow_zero_values = true` turns the filtering off.

### Template: Office spawning a shell

```yaral
rule office_spawns_shell {
  meta:
    description = "Office application launching a script host or shell"
    severity = "Medium"
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

  condition:
    $e
}
```

### Template: failures then success

```yaral
rule brute_force_then_success {
  meta:
    severity = "High"

  events:
    $fail.metadata.event_type = "USER_LOGIN"
    $fail.security_result.action = "BLOCK"
    $fail.target.user.userid = $user

    $ok.metadata.event_type = "USER_LOGIN"
    $ok.security_result.action = "ALLOW"
    $ok.target.user.userid = $user

  match:
    $user over 30m after $fail

  outcome:
    $failures = count($fail.metadata.id)
    $sources = array_distinct($fail.principal.ip)
    $risk_score = if($failures > 50, 90, 70)

  condition:
    #fail >= 10 and $ok
}
```

**Before enabling:** run it over 30 days of history and read every hit.

## Gotchas

| Symptom | Cause |
| --- | --- |
| Query returns nothing | Field not populated for that source. Check with [Know your data](#know-your-data) |
| Event seems missing | Late ingestion. Compare `metadata.ingested_timestamp` |
| Same host counted twice | `WKS-0142` vs `wks-0142.corp.example`. Use `nocase` and a regex, or `principal.asset_id` |
| Egress IP is the firewall | NAT. Pivot through proxy or NAT logs to the real host |
| Saved search stopped working | Parser update moved the field. Compare raw log and UDM |
| Broad search looks incomplete | 30,000-row default. Raise it in Search Settings, or aggregate |
| `!=` doesn't exclude | Repeated field (implicit any). Use `NOT field = "value"` |
| Regex on `metadata.event_type` errors | Enum field. `OR` the values |
| Rule fires on blank values | Placeholder from a function skips zero handling. Add `$x != ""` |
| Sequence rule never fires | Hop window split the events. Use `over 30m after $e` |
| Enum matches nothing | Lower case. Use `"PROCESS_LAUNCH"` |
| `OR` matches too much | Missing brackets |

## Handover template

```text
WHAT:        One or two sentences.
CONFIDENCE:  Confirmed / likely / possible, and why.
SCOPE:       Hosts, users, accounts, time range (queries attached).
UNKNOWN:     Log gaps, open questions.
NEXT:        Contain / eradicate / collect more / close (reason).
```
