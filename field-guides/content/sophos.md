# Sophos Central and Intercept X

Visual reference for Sophos on cases: how the agent, Central, the Data Lake and the firewall fit together, what the protection features are called, how to read a detection, and how to query and respond. Hostnames and hashes below are placeholders.

## The mental model

The endpoint agent protects and records locally, reports to Sophos Central, and sends telemetry to the Data Lake. The firewall and endpoints share health over Security Heartbeat.

```flow
Intercept X agent[compute] --events--> Sophos Central[mgmt] --cases--> Analyst / MDR[user]
Intercept X agent[compute] --telemetry--> Data Lake[data] --SQL--> XDR queries[app]
Intercept X agent[compute] --Heartbeat--> Sophos Firewall[network]
```

```terms
Sophos Central :: The cloud console for every product: policies, alerts, cases, response actions.
Intercept X :: The endpoint and server protection agent (EDR and XDR features depend on licence).
Detection / alert / case :: A detection is a single finding. Alerts notify you. Cases (threat cases) group related detections for investigation.
Root cause analysis :: The visual chain of processes, files and connections behind a detection.
Data Lake :: Cloud store of endpoint, server, firewall and email telemetry, queried with SQL across the estate.
Live Discover :: osquery SQL run on online devices, or on the Data Lake for offline ones.
Live Response :: A remote command shell on a device, from Central.
Security Heartbeat :: Endpoint health (green, yellow, red) shared with Sophos Firewall, which can restrict red devices.
Tamper protection :: Stops local admins and malware changing or removing the agent. Disabling it needs Central or the device's password.
MDR :: Sophos Managed Detection and Response: their analysts hunting in your estate.
```

## Protection layers

| Feature | Stops | Detection looks like |
| --- | --- | --- |
| Deep learning | Unknown malicious executables before they run | `ML/PE-A` |
| Signature and reputation | Known malware, PUAs | `Troj/…`, `Mal/…`, PUA names |
| Behaviour detection | Malicious actions at runtime, mapped to ATT&CK | `Creds_1a`, `Exec_8b` style rule names |
| AMSI protection | Malicious scripts in memory (PowerShell, VBA, JS) | `AMSI/…` |
| Exploit prevention | Memory exploits, process hollowing, credential theft from LSASS | Mitigation name, e.g. `CredGuard`, `StackPivot` |
| CryptoGuard | Mass file encryption, local or over a share. Rolls files back | "CryptoGuard detected ransomware" |
| Adaptive attack protection | Turns on stricter rules when an active attack is seen | "Adaptive attack protection enabled" |
| Web / application / peripheral control | Policy violations | Category or app name |
| Lateral movement protection | A red-health device reaching others | Isolation or Heartbeat events |

### Detection name anatomy

```anatomy
Troj :: type: Troj trojan, Mal generic malware, ML machine learning, ATK attack tool, AMSI script
/
Agent :: family
-
BHPZ :: variant
```

**Read:** `ML/PE-A` means the deep learning model flagged a Windows executable, with no signature. Check the hash and the root cause before calling it a false positive.

## Security Heartbeat

```sequence
Endpoint[compute] -> Sophos Firewall[network]: Heartbeat: green
Endpoint -> Endpoint: Active malware detected
Endpoint -> Sophos Firewall: Heartbeat: red
Sophos Firewall -> Endpoint: Restrict traffic per firewall rule
Sophos Firewall -> Other endpoints[compute]: Ignore the red device (lateral movement protection)
note: Back to green once the agent cleans up, or an admin intervenes
```

## Investigating a detection

```flow
Detection[security] --> Root cause analysis[app] --> Device timeline[mgmt] --> Live Discover / Data Lake[data] --> Response action[security]
```

| Question | Where |
| --- | --- |
| What started it? | Root cause analysis: the beacon (start point) and parent chain |
| Did anything run, write or connect? | Root cause graph nodes, or Data Lake process, file and network queries |
| Is it elsewhere? | Data Lake query by SHA-256 or command line across all devices |
| Is it still running? | Live Discover on the online device |
| Was it cleaned? | The device's event log and the detection's "cleaned up" state |

## Live Discover queries (osquery SQL)

### Processes running from user-writable paths

```sql
SELECT pid, name, path, cmdline, parent
FROM processes
WHERE path LIKE 'C:\Users\%\AppData\%' OR path LIKE 'C:\ProgramData\%' OR path LIKE 'C:\Windows\Temp\%';
```

### Who is talking out, and which process

```sql
SELECT p.name, p.path, s.remote_address, s.remote_port
FROM process_open_sockets s
JOIN processes p USING (pid)
WHERE s.remote_address NOT IN ('', '0.0.0.0', '127.0.0.1', '::', '::1') AND s.remote_port != 0;
```

### Scheduled tasks running scripts

```sql
SELECT name, action, path, enabled, last_run_time
FROM scheduled_tasks
WHERE action LIKE '%powershell%' OR action LIKE '%cmd.exe%' OR action LIKE '%\AppData\%';
```

### Services outside Windows and Program Files

```sql
SELECT name, display_name, path, start_type, user_account
FROM services
WHERE path NOT LIKE 'C:\Windows\%' AND path NOT LIKE '"C:\Windows\%' AND path NOT LIKE '%Program Files%';
```

### Autostart entries

```sql
SELECT name, path, source FROM autoexec WHERE path LIKE '%\AppData\%' OR path LIKE '%\Temp\%';
```

**Tune:** Sophos also ships its own Data Lake and journal tables (process, file, network history). Start from the built-in query library in Central, which matches your agent version.

## Response actions

| Action | Effect | Use when |
| --- | --- | --- |
| Isolate device | Cuts the network except to Central | Active compromise, before you know more |
| Scan / clean up | Runs a scan and removes what it finds | Detection left artefacts |
| Live Response | Remote shell | Collect files, inspect, kill processes |
| Forensic snapshot | Collects device telemetry for offline analysis | Preserve evidence before you clean |
| Block item (SHA-256) | Blocks the file across the estate | Confirmed malicious hash |
| Allow item / exclusion | Stops detections on it | Only for confirmed false positives |
| Reset tamper protection password | Lets local changes happen | Rarely, and audit who did it |

## Watch for

| Signal | Why |
| --- | --- |
| Tamper protection turned off, or the agent uninstalled | Attackers disable EDR before ransomware |
| Sophos services stopped, or a safe mode boot | Classic evasion to get around tamper protection |
| New global exclusions or allowed items | Attacker (or a careless admin) carving out a blind spot |
| Device gone quiet ("not communicating") | Agent killed, or the device isolated by someone else |
| CryptoGuard detections on a file server, from a remote host | Encryption over a share: the source is the other host |
| Repeated `Creds_` behaviour detections | Credential dumping attempts |

## Hunting in SecOps

### Sophos detections by device

```udm
metadata.vendor_name = "Sophos" nocase
$host = principal.hostname
match:
  $host
outcome:
  $events = count(metadata.id)
  $names = array_distinct(security_result.threat_name)
order:
  $events desc
```

**Tune:** the Sophos log type name and the threat field depend on your feed (Central API or syslog). Check one event in the UDM viewer first.
