# Darktrace

Visual reference for Darktrace on cases: how it learns "normal", what a model breach and an AI Analyst incident are, how to read scores and model names, how to search the raw metadata, and what autonomous response did. Devices and IPs below are placeholders.

## The mental model

Darktrace watches traffic and SaaS activity, learns each device's pattern of life, and raises a model breach when behaviour departs from it. AI Analyst then stitches breaches into incidents, and RESPOND (formerly Antigena) can act on its own.

```flow
SPAN / TAP / vSensor[network] --traffic--> Darktrace master[data] --pattern of life--> Model breach[security]
Model breach[security] --groups--> AI Analyst incident[app] --> Analyst[user]
Model breach[security] --triggers--> RESPOND action[security] --block--> Device[compute]
```

```terms
Probe / vSensor :: Collects traffic: a physical probe on a SPAN or TAP, or a virtual sensor in a cloud or on a host.
Master :: The appliance or cloud instance that analyses everything and runs the Threat Visualizer UI.
Pattern of life :: The learned baseline per device, per user, per subnet, and for the whole network.
Device :: Anything with an IP or identity Darktrace tracks. Has a type, tags, and a credential history.
Model :: Detection logic: conditions plus thresholds, grouped by category. Can be edited or cloned.
Model breach :: One firing of a model for a device, with a breach score.
AI Analyst incident :: Related breaches investigated and summarised into incident events.
RESPOND / Antigena :: Autonomous response: block connections, enforce the pattern of life, quarantine a device.
Rarity :: How unusual a destination is for the whole network: "rare" means few devices have ever visited it.
Tags :: Labels on devices (`Admin`, `Server`, `Antigena All`) that models and response key off.
```

## Products

| Product (current name) | Watches |
| --- | --- |
| Darktrace / NETWORK | On-premises and cloud network traffic |
| Darktrace / EMAIL | Inbound and outbound email (Microsoft 365, Google Workspace) |
| Darktrace / IDENTITY | SaaS and identity: Microsoft 365, Okta, Google, Salesforce |
| Darktrace / CLOUD | AWS, Azure and GCP control planes |
| Darktrace / ENDPOINT | Endpoint agents (cSensor) |
| Darktrace / OT | Industrial networks |

## Reading a breach

### Model name anatomy

```anatomy
Anomalous Connection :: category
 / 
Data Sent to Rare Domain :: behaviour
```

| Category | Usually means |
| --- | --- |
| `Compromise` | Strong signs of infection: beaconing, C2, known-bad |
| `Anomalous Connection` | Unusual destinations, ports or volumes |
| `Anomalous File` | Unusual downloads or uploads (EXEs, scripts, archives) |
| `Anomalous Server Activity` | A server behaving out of character |
| `Device` | A device's own behaviour changed: new activity, scanning |
| `Unusual Activity` | Lower-confidence deviations |
| `User` | Credential and account behaviour |
| `Compliance` | Policy issues: cleartext passwords, remote access tools, Tor |
| `Antigena` / `RESPOND` | Autonomous response fired |

### Scores

```terms
Breach score :: How strongly this one breach deviates, as a percentage. High doesn't always mean malicious.
Model priority :: How important the model's author thinks it is (0–5).
Incident score :: AI Analyst's confidence in an incident. Triage by this first.
Device score :: How much a device is currently breaching. A rising score means investigate the device, not one breach.
```

## Triage workflow

```flow
AI Analyst incident[app] --> Model breaches[security] --> Device event log[mgmt] --> Advanced Search[data] --> PCAP[network]
```

| Step | Ask |
| --- | --- |
| Incident | What does AI Analyst say happened? Which devices, which period? |
| Breaches | Which models fired, in what order? `Compromise` first |
| Device event log | What else did the device do around then? New destinations? |
| Advanced Search | Raw connections, DNS, HTTP, SMB and Kerberos for the device |
| Rarity / first seen | Has anything else on the network ever talked to this destination? |
| RESPOND history | Did it block anything already? Is the device still restricted? |

## Advanced Search

Lucene-style queries over the parsed protocol metadata. `@type` picks the protocol log, and `@fields.*` the values.

```text
@type:conn AND @fields.source_ip:10.10.4.22 AND @fields.dest_port:445
```

```text
@type:dns AND @fields.query:*.example-cdn.top
```

```text
@type:http AND @fields.host:files.example.com AND @fields.method:POST
```

```text
@type:ssl AND @fields.server_name:*duckdns.org
```

```text
@type:smb AND @fields.source_ip:10.10.4.22 AND @fields.action:write
```

| `@type` | Has |
| --- | --- |
| `conn` | Every connection: IPs, ports, protocol, bytes, duration |
| `dns` | Queries and answers |
| `http` | Host, URI, method, user agent, status |
| `ssl` | SNI (`server_name`), certificate, JA3 |
| `smb`, `dcerpc` | File shares and remote procedure calls |
| `kerberos`, `ntlm` | Authentication, with usernames |

**Tune:** field names vary by version. Open a result and click a field to filter on it rather than typing names from memory.

## Autonomous response

```sequence
Device[compute] -> Darktrace[data]: Unusual SMB writes to 40 servers
Darktrace -> Darktrace: Model breach: Device / SMB Ransomware Activity
Darktrace -> Firewall / host[network]: RESPOND: block matching connections
Darktrace --> Analyst[user]: Notification, and the action in the RESPOND log
note: Actions expire after a set time unless confirmed or extended
```

| Action | Effect |
| --- | --- |
| Block matching connections | Stops this specific behaviour (destination and port) |
| Enforce pattern of life | Allows only what the device normally does |
| Quarantine device | Cuts all traffic to and from the device |
| Block connections to destination | Stops every device reaching a domain or IP |
| Human confirmation mode | Actions wait for an analyst to approve |

**Read:** check whether RESPOND is in autonomous or human-confirmation mode for the device. Many "it should have blocked this" cases are that setting.

## Watch for

| Signal | Why |
| --- | --- |
| `Compromise / Beaconing Activity To External Rare` | Regular C2 check-ins |
| `Anomalous Connection / Data Sent to Rare Domain` | Possible exfiltration |
| `Device / Network Scan`, `Device / Anomalous SMB Followed By Multiple Model Breaches` | Lateral movement starting |
| `Compliance / Remote Management Tool On Server` | AnyDesk-style tooling attackers love |
| A device going quiet after breaches | Isolated by someone, or the attacker moved on |
| RESPOND actions on servers | Check business impact; they may need extending or lifting |

## Hunting in SecOps

### Darktrace model breaches by device

```udm
metadata.vendor_name = "Darktrace" nocase
$host = principal.hostname
match:
  $host
outcome:
  $breaches = count(metadata.id)
  $models = array_distinct(security_result.rule_name)
order:
  $breaches desc
```

**Tune:** check where your Darktrace feed puts the model name (`rule_name` or `summary`) in the UDM viewer first.
