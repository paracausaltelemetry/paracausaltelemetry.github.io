# Rapid7 InsightIDR

Visual reference for Rapid7 InsightIDR on cases: how the Insight Agent, Collector and cloud fit, how user and asset attribution works, the log sets, LEQL for Log Search, detection rule types (ABA, UBA, custom), investigations, deception, and containment with the agent and InsightConnect. Hosts, users and IPs below are placeholders.

## The mental model

Logs come in two ways: the **Insight Agent** on endpoints, and **event sources** (domain controllers, DHCP, firewalls, VPN, cloud apps) read by an on-premises **Collector** or pulled from cloud APIs. InsightIDR's cloud parses each event into a **log set**, then **attributes** it: which asset had that IP at that time (from DHCP and agent data), and which user was on that asset (from authentication). Detections and searches run on the attributed data.

```layers
Sources :: Endpoints[compute]{laptop}, Domain controllers and DHCP[compute]{server}, Firewalls VPN and proxies[network]{firewall}, Cloud services[external]{cloud}
Collection :: Insight Agent[app]{sensor}, Collector[app]{router}, Cloud event sources[app]{cloud}
InsightIDR :: Log sets and Log Search[data]{log}, Asset and user attribution[mgmt]{user}, Detection rules[security]{radar}
Response :: InsightConnect workflows[mgmt]{function}, Investigations[security]{alert}
Endpoints -> Insight Agent
Domain controllers and DHCP -> Collector
Firewalls VPN and proxies -> Collector
Cloud services -> Cloud event sources
Insight Agent -> Log sets and Log Search
Collector -> Log sets and Log Search
Cloud event sources -> Log sets and Log Search
Log sets and Log Search -> Asset and user attribution
Asset and user attribution -> Detection rules
Detection rules -> Investigations
Investigations -> InsightConnect workflows: automation
```

```terms
Insight Agent :: The endpoint agent shared with InsightVM. Sends process starts, logons and endpoint events, and runs containment jobs.
Collector :: An on-premises server that receives syslog and polls event sources, then forwards to the cloud.
Event source :: One configured feed: a DC's security log, a DHCP server, a firewall, a cloud app.
Log set :: The parsed category events land in (Asset Authentication, Firewall Activity). Searches start from one or more log sets.
Attribution :: Linking an IP to an asset (DHCP, agent) and an asset to a user (logons). Wrong or missing DHCP data makes alerts land on the wrong person.
ABA :: Attacker Behaviour Analytics: Rapid7's detections for attacker techniques, mostly on endpoint and network data.
UBA :: User Behaviour Analytics: detections on user activity (new country, impossible travel, spoofed domain, privilege changes).
Detection rule actions :: Each rule creates investigations, only alerts, or is off, with a priority you can tune per rule.
Investigation :: The case: alerts, evidence, assignee, status (Open, Investigating, Waiting, Closed) and a disposition.
Deception :: Honeypots, honey users, honey credentials and honey files. Any touch is a high-confidence alert.
```

## Log sets

| Log set | Holds |
| --- | --- |
| Asset Authentication | Logons to machines: user, source and destination asset, logon type, result |
| Ingress Authentication | Logons from outside: VPN, Microsoft 365, Okta, Entra ID |
| Active Directory Admin Activity | Account and group changes on domain controllers |
| Process Start Events | Processes from the Insight Agent: name, path, command line, parent, hash |
| DNS Query | DNS lookups from DNS servers or the agent |
| Firewall Activity | Allowed and denied connections |
| Web Proxy Activity | URLs from proxies and secure web gateways |
| Cloud Service Activity / Admin Activity | SaaS and cloud provider logs |
| File Access Activity | File reads and changes from file servers |
| Raw Log | Events InsightIDR couldn't parse. Still searchable |

**Read:** if a log set is empty, the event source behind it is down or misparsed. Check Data Collection before you trust a search that finds nothing.

## LEQL for Log Search

```flow
Log sets and time range[data]{log} --> where(...)[app]{function} --> groupby(...)[app]{function} --> calculate(...)[mgmt]{radar} --> sort / limit[mgmt]{log}
```

| Want | LEQL |
| --- | --- |
| Equals | `where(destination_account = "jsmith")` |
| Case-insensitive | `where(destination_account = NOCASE("JSmith"))` |
| One of several | `where(process.name IIN ["cmd.exe", "powershell.exe"])` |
| Contains | `where(process.cmd_line ICONTAINS "-enc")` |
| Starts with | `where(destination_asset STARTS-WITH "srv-")` |
| Regex | `where(process.cmd_line = /.*\s-e(nc)?\s.*/i)` (a field regex must match the whole value; `where(/x/i)` searches the whole event) |
| Not | `where(result != "SUCCESS")` or `where(NOT ...)` |
| Count by group | `groupby(source_ip) calculate(count)` |
| Distinct count | `groupby(source_ip) calculate(unique:destination_account)` |
| Over time | `calculate(count) timeslice(1h)` |
| Top values | `groupby(destination_asset) limit(20)` |
| Sort | `sort(desc)` (on the calculated value) |

**Tune:** field names come from the parsed event, so they differ between log sets. Open one event in Log Search and click a field to add it to the query rather than typing it.

## Detections

| Type | Examples | Tune with |
| --- | --- | --- |
| ABA (attacker behaviour) | Suspicious PowerShell, credential dumping, persistence | Exceptions on the rule: user, asset, process, command line |
| UBA (user behaviour) | Ingress from a new country, account authenticated to a honeypot, privilege escalation | Rule priority and action; trusted networks and countries |
| Custom detection rules | Your own LEQL query on a schedule | The query itself |
| Deception | Honeypot scanned, honey credential used | Rarely needed: nobody has a reason to touch them |

```sequence
Detection rule[security]{radar} -> Investigation[security]{alert}: Creates, with priority
Analyst[user]{user} -> Investigation: Assigns, sets Investigating
Analyst -> Log Search[data]{log}: Pivots on user, asset, IP
Analyst -> Agent[compute]{laptop}: Quarantine or kill process
Analyst -> Investigation: Closes with a disposition
note: Comments and evidence stay on the investigation for the customer report
```

## Containment

| Goal | How |
| --- | --- |
| Isolate a host | Quarantine the asset (Insight Agent). It keeps talking to Rapid7 only. Unquarantine from the same place |
| Stop a process | Kill process from the investigation or the asset page (Insight Agent) |
| Collect evidence | Velociraptor (integrated with the agent) or an InsightConnect collection workflow |
| Disable a user | InsightConnect workflow to Active Directory, Entra ID or Okta: disable, reset password, revoke sessions |
| Block an indicator | InsightConnect workflow to the firewall, proxy or EDR; add it to a threat feed in InsightIDR |

**Watch for:** quarantine needs a healthy agent. A host whose agent stopped checking in won't receive the job; check the asset's last seen time first.

## Queries

### Password spray: many users from one source (Ingress Authentication)

```leql
where(result != "SUCCESS")
groupby(source_ip)
calculate(unique:user)
sort(desc)
limit(20)
```

### Encoded PowerShell (Process Start Events)

```leql
where(process.name IIN ["powershell.exe", "pwsh.exe"] AND process.cmd_line = /.*\s-e(nc|ncodedcommand)?\s+[A-Za-z0-9+\/=]{40,}.*/i)
```

### Logons to many hosts from one account (Asset Authentication)

```leql
where(result = "SUCCESS" AND logon_type IIN ["NETWORK", "REMOTE_INTERACTIVE"])
groupby(destination_account)
calculate(unique:destination_asset)
sort(desc)
```

### Rare processes (Process Start Events)

```leql
groupby(process.exe_path)
calculate(unique:hostname)
sort(asc)
limit(50)
```

**Tune:** check the exact field names (`user` or `destination_account`, `hostname` or `asset`) on one event in your log set first: they differ between event sources.
