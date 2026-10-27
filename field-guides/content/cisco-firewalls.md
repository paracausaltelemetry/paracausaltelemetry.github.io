# Cisco ASA and Firepower Threat Defense

Visual reference for Cisco firewalls on cases: ASA and Firepower Threat Defense (FTD) side by side, how a packet is handled, reading ASA syslog message IDs and FTD connection and intrusion events, the CLI checks responders run, VPN investigations, and the edge attacks that keep targeting these devices. IPs, users and object names below are placeholders.

## The mental model

**ASA** is the classic stateful firewall and remote access VPN (AnyConnect, now Cisco Secure Client), configured by CLI or ASDM. **FTD** runs the ASA data plane plus Snort for application control, URL filtering and intrusion prevention, managed by the Firewall Management Center (FMC) or the on-box Firewall Device Manager (FDM).

```layers
Users :: Remote users[user]{laptop}, Internal network[network]{switch}
Firewall :: VPN headend[network]{lock}, ASA data plane[network]{firewall}, Snort (FTD only)[security]{shield}
Management and logs :: ASDM / CLI[mgmt]{app}, Syslog to SIEM[data]{log}, FMC / FDM and events[mgmt]{db}
Remote users -> VPN headend: Secure Client / IPsec
Internal network -> ASA data plane
VPN headend -> ASA data plane
ASA data plane -> Snort (FTD only)
ASA data plane -> Syslog to SIEM
Snort (FTD only) -> FMC / FDM and events: connection, intrusion, file
```

```terms
Security level / nameif :: ASA interfaces have a name and a level (0 to 100). Traffic from higher to lower is allowed by default; everything else needs an ACL.
Access list (ACL) :: Ordered permit and deny rules, applied to an interface (`access-group`). Hit counts show in `show access-list`.
NAT :: Object NAT and twice NAT. Since ASA 8.3, ACLs use the **real** (untranslated) IP.
Connection (conn) :: One stateful flow. Each gets an ID that appears in its build and teardown messages.
Secure Client (AnyConnect) :: The remote access VPN client. Sessions use SSL/DTLS or IKEv2.
Tunnel group / group policy :: VPN connection profile (which authentication) and the settings applied to the user.
Access control policy (FTD) :: Rules matching zones, networks, users, applications and URLs, with intrusion and file policies attached.
Prefilter (FTD) :: Fast decisions before Snort: block, or fastpath traffic that doesn't need inspection.
Security Intelligence (FTD) :: IP, URL and DNS block lists applied before access control.
```

## How a packet is handled

```flow
Ingress[network]{router} --> Existing connection?[app]{switch} --> Un-NAT[network]{router} --> ACL / access control[security]{firewall} --> Inspection and Snort[security]{shield} --> NAT[network]{router} --> Route and egress[network]{globe}
```

**Read:** `packet-tracer` walks a made-up packet through exactly these phases and shows which ACL, NAT rule and route it hits. It's the quickest answer to "would this have been allowed?"

## ASA syslog

```anatomy
%ASA :: product (FTD sends %FTD)
-6- :: severity: 0 emergencies to 7 debugging
302013 :: message ID: the thing to filter on
: Built inbound TCP connection 51122 for outside:203.0.113.50/443 :: message text
```

### Message IDs worth knowing

| ID | Means |
| --- | --- |
| `302013` / `302014` | TCP connection built / torn down (teardown has duration and bytes) |
| `302015` / `302016` | UDP connection built / torn down |
| `106023` | Denied by an access list |
| `106100` | ACL hit with `log` enabled (permit or deny) |
| `106001` / `106015` | Inbound TCP denied / TCP without a connection |
| `305011` / `305012` | Dynamic NAT translation built / torn down |
| `113004` / `113005` | AAA authentication succeeded / rejected |
| `113015` | Local database authentication rejected |
| `113019` | VPN session disconnected, with duration, bytes and reason |
| `722022` / `722023` | Secure Client TCP or UDP connection established / terminated |
| `722051` | VPN address assigned to a user (who had which inside IP) |
| `716001` / `716002` | Clientless WebVPN session started / ended |
| `605004` / `605005` | Management login denied / permitted (SSH, ASDM, console) |
| `611101` / `611102` | Admin user authentication succeeded / failed |
| `111008` / `111010` | A user ran a command / made a configuration change |

**Read:** to answer "who was 10.20.30.5 on the VPN at 14:00?", find the `722051` that assigned that address before 14:00 and the `113019` that ended the session after it.

## FTD events

| Event | Syslog ID | Holds |
| --- | --- | --- |
| Connection start / end | `430002` / `430003` | Rule matched, action, application, URL, user, bytes, initiator and responder |
| Intrusion | `430001` | Snort signature (GID:SID), classification, priority, blocked or not |
| File / malware | `430004` / `430005` | File type, SHA-256, disposition (malware, clean, unknown), action |
| Security Intelligence | in connection events | `SecIntMatchingIP`, `URLSICategory`, `DNSSICategory` |

**Watch for:** FTD still sends classic ASA message IDs for the data plane (VPN, NAT, management) alongside the `4300xx` events. You usually need both.

## Responder CLI

```text
show version
show conn address 10.10.4.22
show vpn-sessiondb anyconnect filter name j.smith
show vpn-sessiondb detail anyconnect sort inactivity
packet-tracer input inside tcp 10.10.4.22 51515 203.0.113.7 443 detailed
show access-list | include hitcnt=[1-9]
show logging | include 113005
capture CAP interface outside match ip host 203.0.113.50 any
```

| Command | Answers |
| --- | --- |
| `show version` | Software version: compare with advisories first |
| `show conn address …` | What is this host connected to right now? |
| `show vpn-sessiondb anyconnect …` | Who's on the VPN, from which public IP, with which inside IP |
| `packet-tracer … detailed` | Which NAT, ACL and route a flow hits |
| `show access-list` | Rule hit counts: which rules are actually used |
| `capture` | A packet capture on the box (download it from `https://<asa>/admin/capture/CAP/pcap`) |

## VPN investigations

```decide
start :: Suspicious VPN session for a user
Did the session start from a new country or hosting provider ASN? :: yes :: Treat as compromised: log off, disable, reset
Were there many 113005 / 113015 failures for this user or from this IP first? :: yes :: Brute force or spray succeeded: log off, reset, block the source
Did the session reach servers the user never uses? :: yes :: Lateral movement: scope with 302013 and EDR on those hosts
end :: Confirm with the user out of band
```

| Signal | Where |
| --- | --- |
| Bursts of `113005` / `113015` from many IPs, few attempts each | Password spraying against the VPN (large campaigns hit ASA in 2024) |
| Logins with default or test account names (`admin`, `cisco`, `test`, `guest`) | Spraying, or an old account still enabled |
| A VPN session with no MFA where MFA is expected | Wrong tunnel group or a fallback profile |
| One account with sessions from two countries at once | Shared or stolen credentials |

## Edge attacks to watch for

| Campaign or flaw | Why |
| --- | --- |
| ArcaneDoor (CVE-2024-20353, CVE-2024-20359) | State-backed implants (Line Dancer, Line Runner) on ASA, surviving reboots via a persistence flaw |
| CVE-2025-20333, CVE-2025-20362 (2025) | ASA and FTD web services flaws chained for unauthenticated code execution; subject of a CISA emergency directive |
| CVE-2023-20269 | VPN brute force through unexpected tunnel groups; used by ransomware groups |
| Config change log: new local admin, new ACL permitting `any` from outside | Takeover of the management plane |
| Management (ASDM, SSH) reachable from the internet | Shouldn't be. Restrict to a management network |
| Version older than the latest advisory | Follow Cisco's forensic guidance before patching, so evidence isn't lost |

## Containment

| Goal | How |
| --- | --- |
| Block a source now | `shun 203.0.113.50` (temporary, cleared on reboot), then an ACL or FMC Security Intelligence entry |
| Kick a VPN user | `vpn-sessiondb logoff name j.smith noconfirm`, then disable the account |
| Block indicators across FTDs | Security Intelligence feed or list in FMC |
| Keep evidence | `show tech-support`, the running config and logs off the box before upgrading or rebooting |

## Queries

### VPN authentication failures by source (Splunk)

```spl
index=network sourcetype="cisco:asa" message_id IN (113005, 113015)
| stats count, dc(user) as users by src_ip
| where count > 20
| sort - count
```

### Who had an inside VPN address (Splunk)

```spl
index=network sourcetype="cisco:asa" message_id=722051 assigned_ip="10.20.30.5"
| table _time, user, src_ip, assigned_ip
```

### ACL denies from one host (SecOps)

```udm
metadata.vendor_name = "Cisco" nocase
metadata.product_name = /ASA|Firepower/ nocase
principal.ip = "10.10.4.22"
security_result.action = "BLOCK"
```

**Tune:** field names such as `message_id` and `assigned_ip` come from the Splunk add-on for Cisco ASA. Other collectors name them differently; check one event first.
