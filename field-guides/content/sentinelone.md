# SentinelOne Singularity

Visual reference for SentinelOne on cases: how the agent, the console and the data lake fit together, what Storylines are, how to read a threat, the mitigation actions and when to use each, and Deep Visibility hunting in S1QL and PowerQuery. Hosts, users and IDs below are placeholders.

## The mental model

The agent detects and responds **on the host**, even offline, using static and behavioural AI. It streams telemetry to the Singularity Data Lake, where you hunt, and raises threats and alerts in the management console.

```layers
Endpoints :: Windows[compute]{laptop}, macOS[compute]{laptop}, Linux and cloud workloads[compute]{server}
Agent :: Static AI[security]{shield}, Behavioral AI[security]{radar}, Storyline[app]{log}
Cloud :: Management console[mgmt]{app}, Singularity Data Lake[data]{db}, Purple AI[app]{radar}
Response :: Mitigation actions[security]{alert}, Remote Shell / RemoteOps[mgmt]{app}
Windows -> Static AI
macOS -> Static AI
Linux and cloud workloads -> Behavioral AI
Static AI -> Storyline
Behavioral AI -> Storyline
Storyline -> Management console: threats
Storyline -> Singularity Data Lake: telemetry
Purple AI -> Singularity Data Lake
Management console -> Mitigation actions
Management console -> Remote Shell / RemoteOps
```

```terms
Account / Site / Group :: The console hierarchy. Policies inherit downward; most MSSP tenants are one account with a site per customer.
Agent :: The endpoint agent. Protected by anti-tamper: uninstalling or unloading it needs a passphrase from the console.
Policy mode :: Detect (alert only) or Protect (mitigate automatically), set separately for threats and suspicious detections.
Static AI :: Pre-execution file classification.
Behavioral AI :: On-execution detection of what processes do: injection, credential theft, ransomware behaviour.
Storyline :: SentinelOne's ID for a chain of related activity (a process, its children and what they did). One ID ties the whole story together.
Threat :: A detection on a file or process, with a confidence level (malicious or suspicious) and the engine that found it.
Alert :: A detection from STAR custom rules or other sources that isn't tied to one malicious file.
STAR rules :: Custom detection rules that run against incoming telemetry and can trigger mitigation.
Deep Visibility / Event Search :: Searching raw telemetry in the data lake.
Exclusion :: Path, hash, certificate or browser exclusions. Interoperability exclusions can blind the agent: guard them.
```

## Reading a threat

```flow
Detection[security]{alert} --> Threat details[app]{log} --> Storyline graph[app]{radar} --> Verdict and status[mgmt]{user} --> Mitigation[security]{shield}
```

| Field | Means |
| --- | --- |
| Confidence level | `Malicious` (blocked or would be in Protect) or `Suspicious` (worth a look) |
| Detecting engine | Which engine fired: SentinelOne Cloud (reputation), On-Write Static AI, Behavioral AI, Documents and Scripts, Lateral Movement, Anti-Exploitation… |
| Initiated by | Agent policy, a user, a STAR rule, a console action |
| Mitigation status | Not mitigated, mitigated, marked as benign, pending reboot |
| Analyst verdict | True positive, suspicious, false positive or undefined. Set it: it drives reporting |
| Incident status | Unresolved, in progress, resolved |
| Storyline ID | Pivot into Deep Visibility to see every event in the chain |

**Read:** a threat that says **Not mitigated** while the policy is in Protect usually means the action failed (file in use, reboot needed) or the policy is in Detect for that confidence level. Check the mitigation status before you close it.

## Mitigation actions

On a confirmed threat the actions are usually applied in this order, each going further than the last:

```flow
Disconnect from network[network]{router} --> Kill[security]{alert} --> Quarantine[storage]{lock} --> Remediate[app]{function} --> Rollback[data]{db}
```

| Action | Does |
| --- | --- |
| Kill | Ends every process in the threat's chain |
| Quarantine | Encrypts and moves the file so it can't run (it can be restored) |
| Remediate | Undoes the changes the threat made: files, registry keys, scheduled tasks |
| Rollback | Restores files from Volume Shadow Copies (Windows only). The ransomware answer |
| Disconnect from network | Network quarantine: the host can only talk to the SentinelOne cloud |
| Blocklist / add to exclusions | Block a hash across a scope, or allow a false positive |

**Watch for:** rollback needs VSS snapshots, which ransomware deletes first. SentinelOne protects its own snapshots, but check the threat shows rollback as available before you promise it.

## Hunting: S1QL

S1QL is the classic Deep Visibility query language: a filter on event fields, with `AND`, `OR`, `In Contains`, `ContainsCIS` and friends.

| Field | Holds |
| --- | --- |
| `event.type` | `Process Creation`, `File Creation`, `IP Connect`, `DNS Resolved`, `Login`, `Registry Value Modified`… |
| `endpoint.name` | Host name |
| `src.process.name`, `src.process.cmdline` | The process that did it |
| `src.process.parent.name` | Its parent |
| `tgt.process.name`, `tgt.process.cmdline` | The process it started (on process creation) |
| `tgt.file.path`, `tgt.file.sha256` | A file it created, changed or deleted |
| `dst.ip.address`, `dst.port.number` | Where it connected |
| `event.dns.request` | The domain it looked up |
| `src.process.user` | The user it ran as |
| `src.process.storyline.id` | Its Storyline |

### Encoded PowerShell

```text
event.type = "Process Creation" AND tgt.process.name In Contains Anycase ("powershell.exe", "pwsh.exe") AND tgt.process.cmdline ContainsCIS " -enc"
```

### Office spawning a shell

```text
src.process.name In Contains Anycase ("winword.exe", "excel.exe", "outlook.exe") AND tgt.process.name In Contains Anycase ("cmd.exe", "powershell.exe", "wscript.exe", "mshta.exe")
```

## Hunting: PowerQuery

PowerQuery adds a pipeline to the filter, like KQL or SPL: `| filter`, `| group … by`, `| sort`, `| columns`, `| limit`.

### Rare processes making network connections

```text
event.type = "IP Connect" AND dst.ip.address != "127.0.0.1"
| group hosts = estimate_distinct(endpoint.name), connections = count() by src.process.name
| filter hosts <= 2
| sort hosts
```

### Everything in one Storyline

```text
src.process.storyline.id = "ABCDEF0123456789"
| columns event.time, endpoint.name, event.type, src.process.name, tgt.process.name, tgt.file.path, dst.ip.address
| sort event.time
```

**Tune:** field names and functions vary between the older Deep Visibility schema and the current data lake. Check one event in the event viewer before you trust a hunt.

## On the host

```text
"C:\Program Files\SentinelOne\Sentinel Agent <version>\SentinelCtl.exe" status
"C:\Program Files\SentinelOne\Sentinel Agent <version>\SentinelCtl.exe" agent_id
sentinelctl management status
```

| Command | Answers |
| --- | --- |
| `SentinelCtl.exe status` (Windows) | Is the agent loaded and protecting? |
| `SentinelCtl.exe agent_id` | Which console entry is this host? |
| `sentinelctl management status` (Linux, macOS) | Is it connected to the console? |

## Containment

| Goal | How |
| --- | --- |
| Isolate a host | Disconnect from network: remove it in the console when done |
| Investigate live | Remote Shell (needs a role allowing it and two-factor), or RemoteOps scripts |
| Block a hash everywhere | Blocklist at account or site scope |
| Hunt for more hosts | Deep Visibility on the hash, domain or command line, then mitigate in bulk |
| Watch for tampering | Agent uninstalled, unloaded or anti-tamper disabled: treat as hostile until proven otherwise |

## Hunting in SecOps

```udm
metadata.vendor_name = "SentinelOne" nocase
metadata.event_type = "PROCESS_LAUNCH"
target.process.command_line = /\s-e(nc|ncodedcommand)?\s/ nocase
```

**Tune:** SentinelOne arrives in SecOps from the Cloud Funnel or the API, and the two map differently. Check one event in the UDM viewer first.
