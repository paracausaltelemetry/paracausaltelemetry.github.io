# Splunk

Visual reference for Splunk on cases: how data gets from a forwarder to a search head, what index, sourcetype and the CIM mean, how an SPL search runs, a cheat sheet of the commands you'll use daily, Enterprise Security notables and risk, and Tier 2 hunts. Hosts, users and indexes below are placeholders.

## The mental model

Forwarders send events to indexers, which store them in **indexes** as raw text with a timestamp. Search heads run SPL across the indexers and pull fields out **at search time**. Enterprise Security (ES) runs correlation searches on top and raises notables.

```layers
Sources :: Windows hosts[compute]{laptop}, Linux and syslog[compute]{server}, Cloud and SaaS APIs[external]{cloud}
Collection :: Universal forwarder[app]{log}, Heavy forwarder / syslog[network]{router}, HTTP Event Collector[app]{globe}
Indexing :: Indexer cluster[data]{db}
Search :: Search head[mgmt]{app}, Enterprise Security[security]{shield}
Windows hosts -> Universal forwarder
Linux and syslog -> Heavy forwarder / syslog
Cloud and SaaS APIs -> HTTP Event Collector
Universal forwarder -> Indexer cluster: 9997
Heavy forwarder / syslog -> Indexer cluster
HTTP Event Collector -> Indexer cluster
Search head -> Indexer cluster: distributed search
Enterprise Security -> Search head: correlation searches
```

```terms
Index :: Where events are stored, with its own retention and access. Name it in every search (`index=wineventlog`): it's the biggest speed-up there is.
Sourcetype :: The data's format (`XmlWinEventLog`, `pan:traffic`, `aws:cloudtrail`). It decides how fields are extracted.
host / source :: The machine an event came from, and the file, port or input that collected it.
_time / _raw :: The event's timestamp and its original text. Every other field is extracted from `_raw`.
Search-time extraction :: Fields are pulled out of `_raw` when you search, by the add-on (TA) for that sourcetype. No TA, no fields.
CIM :: Common Information Model: shared field names (`src`, `dest`, `user`, `action`) across vendors, grouped into data models.
Data model / tstats :: Accelerated summaries of CIM data. `tstats` searches them far faster than raw events.
Lookup :: A CSV or KV store table joined onto events: asset lists, allow-lists, threat intel.
Macro :: A saved piece of SPL, called by name between backticks in a search, such as `security_content_ctime(firstTime)`.
Notable / finding :: An ES alert from a correlation search, in the `notable` index. ES 8 calls them findings.
Risk-based alerting (RBA) :: Rules add risk to a user or host in the `risk` index instead of alerting; a notable fires when the total crosses a threshold.
```

## How a search runs

SPL is a pipeline. Each `|` passes a table of results to the next command.

```flow
Base search[data]{db} --events--> Filter and eval[app]{function} --rows--> stats / timechart[app]{radar} --table--> Sort and format[mgmt]{log}
```

```anatomy
index=wineventlog EventCode=4625 :: base search: runs on the indexers, so filter hard here
| stats count by src, user :: transforming command: turns events into a table
| where count > 20 :: filters the table
| sort - count :: orders it, biggest first
```

**Read:** everything before the first `|` runs on the indexers in parallel. Put the index, sourcetype, time range and literal terms there, and only reach for `where` and `regex` afterwards.

### Search modes

| Mode | Use |
| --- | --- |
| Fast | Only fields the search names. Quickest for big counts |
| Smart (default) | Extracts all fields for event searches, behaves like Fast for `stats` |
| Verbose | All fields, always. Use it when exploring a new sourcetype, then switch back |

## SPL cheat sheet

| Want | Write |
| --- | --- |
| Time window | `earliest=-24h latest=now` (or the time picker) |
| Field equals (case-insensitive) | `user=j.smith` |
| Exact case | `where user=="J.Smith"` |
| One of several | `EventCode IN (4624, 4625)` |
| Wildcard | `CommandLine="*-enc*"` (leading wildcards are slow) |
| Not | `NOT user=svc_*` |
| Count per group | `stats count by host` |
| Distinct count | `stats dc(user) as users by src` |
| List of values | `stats values(dest) as dests by user` |
| First and last seen | `stats min(_time) as first max(_time) as last by user` |
| Time buckets | `timechart span=1h count by action` |
| New field | `eval mb = round(bytes/1024/1024, 1)` |
| Extract with regex | `rex field=_raw "user=(?<user>\S+)"` |
| Remove duplicates | `dedup user, src` |
| Join a lookup | `lookup assets ip as src OUTPUT owner, criticality` |
| Read a lookup | `inputlookup vip_users.csv` |
| Accelerated search | `tstats count from datamodel=Authentication by Authentication.src` |
| Pick columns | `table _time, host, user, CommandLine` |
| Rare values | `rare limit=20 process_name` |

**Tune:** avoid `join` and `transaction` on big result sets. `stats` by a shared field (session ID, `src`) does the same job far faster.

## Where Windows lands

| Data | Typical sourcetype | Key fields |
| --- | --- | --- |
| Security log | `XmlWinEventLog` with `source="XmlWinEventLog:Security"` | `EventCode`, `user`, `src`, `Logon_Type` |
| Sysmon | `XmlWinEventLog` with `source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational"` | `EventCode`, `Image`, `CommandLine`, `ParentImage` |
| PowerShell | `source="XmlWinEventLog:Microsoft-Windows-PowerShell/Operational"` | `EventCode=4104`, `ScriptBlockText` |
| System log | `source="XmlWinEventLog:System"` | `EventCode=7045` (service installed) |

**Watch for:** older deployments use `WinEventLog` (classic format) rather than `XmlWinEventLog`. Field names are mostly the same; check one event first. Event IDs themselves are in the [Windows event IDs field guide](/field-guides/windows-events/).

## Enterprise Security

```flow
Correlation search[app]{function} --risk--> Risk index[data]{db} --threshold--> Risk notable[security]{alert} --> Analyst queue[user]{user}
Correlation search[app]{function} --notable--> Analyst queue[user]{user} --> Investigation[mgmt]{radar}
```

| Index or object | Holds |
| --- | --- |
| `notable` | Every notable (finding) with its rule, urgency, owner and status |
| `risk` | Risk events: `risk_object`, `risk_object_type`, `risk_score`, the rule that added it |
| Asset and identity lookups | Who owns a host or user and how critical they are. Urgency is severity multiplied by this |
| Incident Review | The analyst queue of notables in the ES app |

### Everything that added risk to one user

```spl
index=risk risk_object="j.smith" earliest=-7d
| stats sum(risk_score) as score, values(source) as rules, values(threat_object) as threats by risk_object
```

## Hunts

### Encoded PowerShell

```spl
index=wineventlog source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1
  Image IN ("*\\powershell.exe", "*\\pwsh.exe")
| regex CommandLine="(?i)\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{40,}"
| table _time, host, User, ParentImage, CommandLine
```

### Password spray: one source, many users

```spl
| tstats count, dc(Authentication.user) as users from datamodel=Authentication
  where Authentication.action=failure by Authentication.src
| where users > 10
| sort - users
```

### Rare processes across the estate

```spl
index=wineventlog source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1 earliest=-7d
| stats dc(host) as hosts, count, values(host) as seen_on by Image
| where hosts <= 2
| sort hosts
```

### Audit log cleared

```spl
index=wineventlog (EventCode=1102 source="XmlWinEventLog:Security") OR (EventCode=104 source="XmlWinEventLog:System")
| table _time, host, user, EventCode
```

The same hunts written in UDM search and KQL are side by side in the [query translator](/field-guides/query-translator/).

## When a search is slow or empty

| Symptom | Check |
| --- | --- |
| No results | Right index? Do you have access to it? Is the time range in the past and wide enough? |
| Fields missing | Is the add-on installed on the search head? Try Verbose mode |
| Events in the future or past | Timestamp parsing (`TIME_FORMAT`, time zone) on the forwarder or sourcetype |
| Slow | Name the index and sourcetype, use `tstats`, drop leading wildcards, `fields` early |
| A source went quiet | `| tstats latest(_time) as last where index=* by index, sourcetype, host` and look for gaps |

**Read:** the job inspector (Job ▸ Inspect Job) shows how long each phase took and how many events were scanned versus returned.
