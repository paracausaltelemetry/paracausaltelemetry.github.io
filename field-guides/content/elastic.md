# Elastic Security

Visual reference for Elastic Security on cases: how Elastic Agent, Fleet, Elasticsearch and Kibana fit, data stream names and where each source lands, the Elastic Common Schema, the four query languages (and which KQL is which), ES|QL and EQL cheat sheets, alert triage, and Elastic Defend response actions. Hosts, users and IDs below are placeholders.

## The mental model

**Elastic Agent** runs on hosts and collectors, with one or more **integrations** (Windows, System, Elastic Defend, O365, Okta) set in an agent policy that **Fleet** manages. Each integration writes to its own **data streams** in **Elasticsearch**. **Kibana** sits on top: Discover for searching, the Security app for detection rules, alerts, timelines and cases.

```layers
Sources :: Endpoint with Elastic Agent[compute]{laptop}, Cloud and SaaS APIs[external]{cloud}, Syslog and firewalls[network]{firewall}
Ingest :: Integrations and ingest pipelines[app]{function}, Fleet and agent policies[mgmt]{app}
Elasticsearch :: Data streams (ECS)[data]{db}, Alerts index[security]{alert}
Kibana :: Discover and ES|QL[app]{radar}, Security app[security]{shield}
Endpoint with Elastic Agent -> Integrations and ingest pipelines
Cloud and SaaS APIs -> Integrations and ingest pipelines
Syslog and firewalls -> Integrations and ingest pipelines
Fleet and agent policies -> Integrations and ingest pipelines: policy
Integrations and ingest pipelines -> Data streams (ECS)
Data streams (ECS) -> Discover and ES|QL
Data streams (ECS) -> Alerts index: detection rules
Alerts index -> Security app
```

```terms
Elastic Agent :: One agent per host that runs integrations. Managed by Fleet, or standalone with a local policy file.
Integration :: A packaged collector, ingest pipeline, mappings and dashboards for one source (System, Windows, Okta, Palo Alto).
Elastic Defend :: The EDR integration: process, file, network and registry events, malware and behaviour protection, response actions.
Data stream :: Where events land, named type-dataset-namespace (`logs-system.security-default`). Backed by rolling hidden indices.
ECS :: Elastic Common Schema. One set of field names for every source: `host.name`, `user.name`, `source.ip`, `process.command_line`.
Data view :: A Kibana pattern over indices or data streams (`logs-*`) that Discover and rules search.
Detection rule :: Runs on a schedule and writes alerts. Types: custom query, EQL, ES|QL, threshold, new terms, indicator match, machine learning.
Prebuilt rules :: Elastic's own rule set, installed and updated from the Security app. Tune with exceptions rather than editing them.
Timeline :: A workspace for an investigation: events and alerts pinned together, with notes, saved with the case.
Case :: The ticket inside Kibana, with alerts attached. Can push to Jira, ServiceNow and others.
```

## Reading a data stream name

```anatomy
logs :: type: logs, metrics, traces
-windows.sysmon_operational :: dataset: integration and stream
-default :: namespace: your split (per customer, site or environment)
```

**Read:** in an MSSP stack the namespace is often the customer. Search `logs-*-acme` to stay inside one tenant.

## Where the data lands

| Source | Data stream pattern |
| --- | --- |
| Elastic Defend process events | `logs-endpoint.events.process-*` |
| Elastic Defend network, file, registry | `logs-endpoint.events.network-*`, `.file-*`, `.registry-*` |
| Elastic Defend alerts | `logs-endpoint.alerts-*` |
| Windows Security log | `logs-system.security-*` |
| Windows System log | `logs-system.system-*` |
| Sysmon | `logs-windows.sysmon_operational-*` |
| PowerShell script blocks | `logs-windows.powershell_operational-*` |
| Linux auth | `logs-system.auth-*` |
| Microsoft 365 audit | `logs-o365.audit-*` |
| Entra ID sign-ins | `logs-azure.signinlogs-*` |
| Okta | `logs-okta.system-*` |
| AWS CloudTrail | `logs-aws.cloudtrail-*` |
| Security alerts | `.alerts-security.alerts-*` |

## ECS fields you'll use most

| Field | Holds |
| --- | --- |
| `event.category`, `event.type` | What kind of event: `process` / `start`, `authentication` / `start`, `network` / `connection` |
| `event.action`, `event.code` | The source's own name or ID for it (`logged-in`, `4625`) |
| `event.outcome` | `success`, `failure`, `unknown` |
| `host.name`, `host.id` | The machine |
| `user.name`, `user.domain` | Who |
| `process.name`, `process.command_line`, `process.executable` | What ran |
| `process.parent.name`, `process.parent.command_line` | What started it |
| `process.entity_id` | A unique ID for one process; the key for the process tree |
| `source.ip`, `destination.ip`, `destination.port` | Network ends |
| `file.path`, `file.hash.sha256` | Files |
| `related.ip`, `related.user`, `related.hosts` | Every IP, user or host in the event, whichever field: the quickest pivot |

## Four query languages

| Language | Where | Looks like |
| --- | --- | --- |
| KQL (Kibana Query Language) | Search bars in Discover, dashboards, query rules | `process.name : "cmd.exe" and not user.name : "svc_*"` |
| Lucene | The older search bar syntax, still in some rules | `process.name:cmd.exe AND NOT user.name:svc_*` |
| EQL | Event correlation: sequences of events on the same host or process | `sequence by host.id [process where ...] [network where ...]` |
| ES\|QL | Piped queries with aggregation, in Discover and as a rule type | `FROM logs-* \| WHERE ... \| STATS ...` |

**Watch for:** Kibana's KQL is a filter syntax and has nothing to do with Microsoft's KQL (Kusto). A Sentinel query pasted into Kibana won't run. The [Query translator](/field-guides/query-translator/) has the same hunts in ES|QL and Kusto side by side.

## ES|QL cheat sheet

```flow
FROM data stream[data]{db} --> WHERE[app]{function} --> EVAL[app]{function} --> STATS ... BY[mgmt]{radar} --> SORT / LIMIT[mgmt]{log}
```

| Command | Does |
| --- | --- |
| `FROM logs-endpoint.events.process-*` | Choose data streams or indices (comma-separated, wildcards) |
| `WHERE event.code == "4625"` | Filter; `==`, `!=`, `IN (…)`, `LIKE "*x*"`, `RLIKE "re"`, `IS NULL` |
| `EVAL day = DATE_TRUNC(1 day, @timestamp)` | Add or change a column |
| `STATS c = COUNT(*), u = COUNT_DISTINCT(user.name) BY source.ip` | Aggregate |
| `KEEP @timestamp, host.name, process.command_line` | Choose columns (`DROP` removes them) |
| `SORT c DESC` / `LIMIT 100` | Order and cap. Results are capped at 1,000 rows unless you set `LIMIT` |
| `DISSECT message "%{a} %{b}"` / `GROK` | Pull fields out of a string at query time |
| `ENRICH policy ON field` / `LOOKUP JOIN index ON field` | Add columns from an enrich policy or a lookup index (asset lists, threat intel) |
| `MV_EXPAND related.ip` | One row per value of a multi-valued field |

**Tune:** `==` on text is case-sensitive. Wrap the field in `TO_LOWER()` when the case varies, and compare with lower-case values.

## EQL sequences

EQL finds events in order, joined on a field, within a time window. It's how Elastic's prebuilt rules catch "this, then that".

```eql
sequence by host.id with maxspan=1m
  [process where event.type == "start" and process.name : ("winword.exe", "excel.exe")]
  [process where event.type == "start" and process.name : ("powershell.exe", "cmd.exe")]
  [network where process.name : "powershell.exe" and destination.port in (80, 443)]
```

| Part | Means |
| --- | --- |
| `sequence by host.id` | Every event in the sequence shares this value |
| `with maxspan=1m` | The whole sequence fits in a minute |
| `[process where …]` | One step: an event category and a condition |
| `:` | Case-insensitive match, wildcards allowed |
| `until [...]` | Stop the sequence if this event happens first |

## Alert triage

```sequence
Analyst[user]{user} -> Alerts[security]{alert}: Opens the alert flyout
Alerts -> Analyzer[app]{radar}: Process tree around the alert
Analyst -> Timeline[app]{log}: Investigate in timeline, add related events
Analyst -> Response console[security]{shield}: Isolate, kill, get file
Analyst -> Case[mgmt]{app}: Attach alerts, notes and timeline
note: Session View shows Linux process sessions; Analyzer is per process tree
```

| Panel | Use |
| --- | --- |
| Alert flyout | Rule, reason, host and user risk, prevalence of the file or process, related alerts by session, ancestry and source event |
| Analyzer | The process tree from the alert's `process.entity_id`, with network and file events on each node |
| Session View | Linux and macOS interactive sessions, command by command |
| Timeline | Free search plus pinned events and notes; save it to the case |
| Entity analytics | Host and user risk scores from recent alerts |

**Read:** acknowledge alerts you're working and close with a reason. A rule whose alerts you always close is a rule to tune with an exception, not to ignore.

## Response actions (Elastic Defend)

| Command | Does |
| --- | --- |
| `isolate` / `release` | Cut the host off the network, except from Elastic |
| `processes` | List running processes |
| `kill-process --pid 4120` / `suspend-process` | Stop or pause a process |
| `get-file --path "C:\Users\Public\a.exe"` | Pull a file back as a password-protected zip |
| `execute --command "ipconfig /all"` | Run a shell command and collect the output |
| `upload --file` | Send a file (a script or tool) to the host |
| `scan --path` | Run a malware scan on a file or folder |

**Watch for:** most response actions need an Enterprise licence (or the matching Serverless tier), and all of them need Elastic Defend on the host. Check what the customer's subscription allows before you promise a containment step.

## Queries

### Failed logons by source (ES|QL)

```esql
FROM logs-system.security-*
| WHERE @timestamp > NOW() - 1 day AND event.code == "4625"
| STATS failures = COUNT(*), users = COUNT_DISTINCT(user.name) BY source.ip
| WHERE failures > 20
| SORT failures DESC
```

### First time a process was seen in the estate (ES|QL)

```esql
FROM logs-endpoint.events.process-*
| WHERE @timestamp > NOW() - 30 days AND event.type == "start"
| STATS first_seen = MIN(@timestamp), hosts = COUNT_DISTINCT(host.id) BY process.executable
| WHERE first_seen > NOW() - 1 day
| SORT hosts DESC
```

### Alerts by rule this week (ES|QL)

```esql
FROM .alerts-security.alerts-*
| WHERE @timestamp > NOW() - 7 days
| STATS alerts = COUNT(*), hosts = COUNT_DISTINCT(host.name) BY kibana.alert.rule.name, kibana.alert.severity
| SORT alerts DESC
```

### LSASS access by an unusual process (EQL)

```eql
process where event.type == "start" and process.name : ("procdump*.exe", "rundll32.exe")
  and process.command_line : ("*lsass*", "*comsvcs*MiniDump*")
```

**Tune:** integrations differ in which ECS fields they fill. Open one event in Discover and check before you rely on a field.
