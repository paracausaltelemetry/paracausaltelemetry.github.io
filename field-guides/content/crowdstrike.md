# CrowdStrike Falcon

Visual reference for Falcon on cases: how the sensor, Threat Graph and the console fit together, what the IDs and event names mean, how events link into a process tree, and how to query and respond. IDs, hosts and hashes below are placeholders.

## The mental model

The sensor watches the host at kernel level and streams events to the cloud. Threat Graph correlates them into detections, and every raw event stays searchable.

```flow
Falcon sensor[compute] --events--> Threat Graph[data] --detections--> Falcon console[mgmt] --> Analyst / OverWatch[user]
Threat Graph[data] --raw events--> Event search / NG-SIEM[app]
Falcon console[mgmt] --RTR / containment--> Falcon sensor[compute]
```

```terms
CID :: Customer ID: your tenant. Every sensor installs against one.
AID :: Agent ID: one per sensor install, so effectively one per host. Every event carries it.
Sensor :: The kernel-mode agent on Windows, macOS and Linux.
Prevention policy :: What the sensor blocks: ML levels, behaviour-based prevention, exploit and script controls.
Detection :: A raised finding with tactic, technique, severity and a process tree.
Incident :: Detections grouped by host and time into one story, with a score.
IOA :: Indicator of attack. Behaviour patterns, not hashes. Custom IOA rules add your own.
IOC :: Indicator of compromise: hash, domain or IP you upload to block or detect.
OverWatch :: CrowdStrike's managed threat hunting. Their detections show "OverWatch" as the source.
Exclusions :: ML, IOA and sensor visibility exclusions. Visibility exclusions blind the sensor completely: guard them.
Network containment :: Cuts the host off the network except to the Falcon cloud.
RTR :: Real Time Response: a remote shell over the sensor.
Maintenance token :: Needed to uninstall or downgrade the sensor when uninstall protection is on.
```

## How events link into a process tree

Each process gets a unique ID (`TargetProcessId`) in its `ProcessRollup2` event. Everything the process later does carries that value as `ContextProcessId`.

```flow
ProcessRollup2 parent[compute] --ParentProcessId--> ProcessRollup2 child[compute]
ProcessRollup2 child[compute] --TargetProcessId = ContextProcessId--> DnsRequest[network]
ProcessRollup2 child[compute] --TargetProcessId = ContextProcessId--> NetworkConnectIP4[network]
ProcessRollup2 child[compute] --TargetProcessId = ContextProcessId--> NewExecutableWritten[storage]
```

**Read:** always join on `aid` as well. Process IDs are only unique per host.

### Event names

| `event_simpleName` | What |
| --- | --- |
| `ProcessRollup2` | Process started: `ImageFileName`, `CommandLine`, `SHA256HashData`, `ParentBaseFileName` |
| `SyntheticProcessRollup2` | A process the sensor saw already running |
| `DnsRequest` | DNS lookup: `DomainName` |
| `NetworkConnectIP4` / `NetworkAcceptIP4` | Outbound / inbound connection: `RemoteAddressIP4`, `RemotePort` |
| `UserLogon` / `UserLogonFailed2` | Logons: `UserName`, `LogonType` |
| `NewExecutableWritten` / `PeFileWritten` | Executable dropped to disk |
| `AsepValueUpdate` | Autostart registry value changed: persistence |
| `ScheduledTaskRegistered` | New scheduled task |
| `ScriptControlScanTelemetry` | Script content seen by AMSI (PowerShell, VBA) |
| `CommandHistory` | Commands typed in a console window |

## Reading a detection

```anatomy
Credential Access :: tactic (ATT&CK)
 via 
OS Credential Dumping :: technique
 · 
High :: severity
 · 
Prevented :: action taken
```

```terms
Objective :: CrowdStrike's own grouping: Gain Access, Keep Access, Explore, Follow Through, Falcon Detection Method.
Pattern ID :: The ID of the IOA logic that fired. Look it up to see what the rule watches.
Action taken :: Detected only, process killed, or operation blocked. "Detected" means it still ran.
Process tree :: Parent, grandparent and children, with command lines and hashes. Start every triage here.
```

## Queries

### NG-SIEM / LogScale (CQL): encoded PowerShell

```cql
#event_simpleName=ProcessRollup2
| ImageFileName=/\\(powershell|pwsh)\.exe$/i
| CommandLine=/\s-e(nc|ncodedcommand)?\s/i
| table([@timestamp, ComputerName, UserName, ParentBaseFileName, CommandLine])
```

### CQL: what a process resolved

```cql
#event_simpleName=DnsRequest aid=0123456789abcdef0123456789abcdef ContextProcessId=123456789012
| groupBy([DomainName], function=count())
```

### CQL: rarest executables in the estate

```cql
#event_simpleName=ProcessRollup2
| groupBy([SHA256HashData, ImageFileName], function=[count(aid, distinct=true, as=hosts), count(as=runs)])
| sort(hosts, order=asc, limit=100)
```

### Legacy Event Search (SPL): same hunt

```spl
event_simpleName=ProcessRollup2 FileName IN ("powershell.exe","pwsh.exe") CommandLine="*-enc*"
| table _time ComputerName UserName ParentBaseFileName CommandLine
```

**Tune:** the CQL field names above match current Falcon data. Older tenants and custom parsers can differ, so check one event first.

## Real Time Response

| Command | Does |
| --- | --- |
| `ps`, `netstat` | Running processes, connections |
| `ls`, `cd`, `filehash` | Browse files, hash one |
| `reg query` | Read registry keys (autoruns) |
| `get <path>` | Collect a file (needs Active Responder) |
| `memdump <pid>` | Dump process memory |
| `kill <pid>`, `rm <path>` | Contain on the host |
| `runscript -Raw=` | Run PowerShell (needs RTR Admin) |
| `put` / `run` | Upload and run a tool from the library (RTR Admin) |

**Watch for:** RTR sessions are audited. An RTR Admin session nobody on your team opened is an incident on its own.

## Response

```sequence
Analyst[user] -> Falcon console[mgmt]: Network contain host
Falcon console -> Sensor[compute]: Contain
Sensor -> Sensor: Drop all traffic except to the Falcon cloud
Analyst -> Falcon console: RTR: collect, kill, remove
Falcon console -> Sensor: RTR commands
note: Lift containment only once the root cause is understood
```

## Watch for

| Signal | Why |
| --- | --- |
| Sensor offline or "reduced functionality mode" | Tampered with, or a kernel update broke it |
| Uninstall or downgrade attempts, maintenance token requests | EDR removal before ransomware |
| New sensor visibility exclusions | Total blind spot. Check who created it in the audit log |
| New IOC "allow" entries | Attacker or admin whitelisting their tooling |
| Detections with action "Detected" on prevention-capable hosts | The policy isn't blocking. Review the prevention policy |
| `UserLogon` with `LogonType` 10 between workstations | RDP lateral movement |

## Hunting in SecOps

### Falcon process events for a host

```udm
metadata.log_type = "CS_EDR"
metadata.product_event_type = "ProcessRollup2"
principal.hostname = "WKS-0142" nocase
```

**Tune:** `CS_EDR` is the Falcon Data Replicator feed. Detection summaries arrive under a separate log type.
