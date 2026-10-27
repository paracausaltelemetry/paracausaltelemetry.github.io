# Fortinet FortiGate

Visual reference for FortiOS on cases: how policies, VDOMs and security profiles fit together, how to read FortiGate's key=value logs, the debug commands responders run, and the edge attacks that keep hitting FortiGate VPNs. IPs, users and policy IDs below are placeholders.

## The mental model

Firewall policies are written between **interfaces or zones**, evaluated top down by **policy ID**, and allowed traffic is inspected by **security profiles**. FortiManager manages fleets, FortiAnalyzer stores and correlates logs, and FortiClient EMS manages endpoints.

```layers
Networks :: LAN[network]{switch}, DMZ[network]{server}, Remote users[user]{laptop}
FortiGate :: VDOM[network]{router}, Firewall policy[security]{firewall}, Security profiles[security]{shield}, VPN[network]{lock}
Fabric :: FortiManager[mgmt]{app}, FortiAnalyzer[data]{db}, FortiClient EMS[mgmt]{laptop}, SIEM[mgmt]{log}
LAN -> Firewall policy
DMZ -> Firewall policy
Remote users -> VPN: IPsec / SSL VPN
VPN -> Firewall policy
Firewall policy -> Security profiles
VDOM -> Firewall policy
Firewall policy -> FortiAnalyzer: logs
FortiManager -> VDOM: policy
FortiAnalyzer -> SIEM: syslog
```

```terms
VDOM :: Virtual domain: an independent firewall inside one FortiGate, with its own interfaces, policies and logs (`vd=` in logs).
Firewall policy :: Incoming and outgoing interface, source, destination, service, schedule, action. Evaluated top down; the `policyid` is in every traffic log.
Security profiles :: Antivirus, IPS, web filter, application control, DNS filter, attached to a policy. Logged as UTM subtypes.
SSL inspection :: Certificate inspection (SNI only) or deep inspection (full decryption). Without deep inspection, profiles can't see inside TLS.
SSL VPN / IPsec dial-up :: Remote access. Fortinet is moving remote users from SSL VPN tunnel mode to IPsec and ZTNA in FortiOS 7.6.
FortiAnalyzer :: Log store and reporting, with event correlation.
FortiManager :: Central policy and config for many FortiGates.
Security Fabric :: FortiGates, switches, APs, EMS and FortiAnalyzer sharing telemetry and automation.
```

## How a packet is handled

```flow
Ingress[network]{router} --> Session lookup[app]{switch} --> Destination NAT[network]{router} --> Routing[network]{globe} --> Firewall policy[security]{firewall} --> Security profiles[security]{shield} --> Source NAT[network]{router} --> Egress[network]{globe}
```

**Read:** routing happens before the policy check, so the outgoing interface (and the policy that matches) depends on the route. `diagnose debug flow` shows each of these steps for one connection.

## Reading a log line

FortiGate logs are key=value pairs. Every line has a type, a subtype and a `logid`.

### logid anatomy

```anatomy
00 :: type: 00 traffic, 01 event, 02+ UTM
00 :: subtype
000013 :: message ID
```

**Read:** `logid="0000000013"` is a forward traffic log, the one you'll see most. For anything else, filter on `type`, `subtype` and `logdesc` rather than memorising IDs.

### Traffic log fields

| Field | Use |
| --- | --- |
| `srcip`, `dstip`, `srcport`, `dstport` | The flow |
| `srcintf`, `dstintf` | Incoming and outgoing interfaces |
| `policyid` | Which policy matched (`0` is the implicit deny) |
| `action` | `accept`, `deny`, `close`, `timeout`, `client-rst`, `server-rst` |
| `service`, `app`, `appcat` | Port-based service and application control results |
| `sentbyte`, `rcvdbyte` | Volume |
| `utmaction` | What a security profile did (`block`, `allow`, `passthrough`) |
| `user`, `group` | Firewall or VPN user, if authenticated |
| `vd`, `devname` | Which VDOM and which FortiGate |

### Log types worth filtering on

| type / subtype | Means |
| --- | --- |
| `traffic` / `forward` | Traffic through the firewall |
| `traffic` / `local` | Traffic to the FortiGate itself (admin, VPN) |
| `event` / `system` | Admin logins, config changes, reboots |
| `event` / `vpn` | IPsec and SSL VPN tunnels and logins |
| `utm` / `ips` | IPS signature hits |
| `utm` / `virus` | Antivirus detections |
| `utm` / `webfilter` | Web filter decisions |
| `utm` / `app-ctrl` | Application control |

## Responder CLI

```text
diagnose sys session filter src 10.10.4.22
diagnose sys session list
diagnose vpn ssl list
diagnose debug flow filter addr 10.10.4.22
diagnose debug flow trace start 20
diagnose debug enable
get system status
```

| Command | Answers |
| --- | --- |
| `diagnose sys session filter …` then `list` | What is this host connected to right now? |
| `diagnose vpn ssl list` | Who is connected to SSL VPN, from where? |
| `diagnose debug flow …` | Which route, NAT and policy one connection hits (stop it with `diagnose debug disable`) |
| `get system status` | Firmware version: check it against advisories first |

## Edge attacks to watch for

FortiGate VPNs have been a favourite initial access route for years.

| Signal | Why |
| --- | --- |
| SSL VPN exploits (CVE-2018-13379, CVE-2022-42475, CVE-2024-21762) | Credential theft and pre-auth code execution on the firewall |
| Many SSL VPN login failures (`action="ssl-login-fail"`) from many IPs | Password spraying |
| Admin login from an unusual IP, or a new local admin | Management-plane takeover |
| Config change adding an allow policy from WAN | Backdoor |
| Unexpected files or links on the box after patching | Fortinet found attackers using a symlink to keep read access after patches (2025) |
| Firmware older than the latest advisory | Assume compromise was possible and hunt |

## Containment

| Goal | How |
| --- | --- |
| Block indicators | Add them to an external threat feed (IP or domain list) used by a deny policy |
| Isolate a host | Quarantine it in the Security Fabric, or a deny policy on its address |
| Kick a VPN user | End the session and disable the account |
| Keep evidence | Back up the config and pull logs from FortiAnalyzer before changes |

## Hunting in SecOps

### Denies from one host

```udm
metadata.vendor_name = "Fortinet" nocase
principal.ip = "10.10.4.22"
security_result.action = "BLOCK"
```

### SSL VPN login failures by source

```udm
metadata.vendor_name = "Fortinet" nocase
metadata.event_type = "USER_LOGIN"
security_result.action = "BLOCK"
$source = principal.ip
match:
  $source
outcome:
  $failures = count(metadata.id)
  $users = count_distinct(target.user.userid)
order:
  $failures desc
```

**Tune:** FortiGate syslog parsing differs between feeds. Check one event in the UDM viewer first, and confirm how failed VPN logins map.
