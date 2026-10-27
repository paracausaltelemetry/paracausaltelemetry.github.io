# Palo Alto Networks firewalls

Visual reference for PAN-OS on cases: how a session flows through the firewall, what zones, App-ID and security profiles mean, how to read traffic and threat logs, the CLI checks responders run, and the edge attacks to watch for. IPs, users and rule names below are placeholders.

## The mental model

Policy is written between **zones**, matches on **application** (App-ID) rather than port, can match on **users** (User-ID), and allowed traffic is inspected by **security profiles** (Content-ID). Panorama manages fleets, and logs go to Panorama, Strata Logging Service or a SIEM.

```layers
Users and networks :: Users[user]{laptop}, Trust zone[network]{switch}, DMZ[network]{server}
Firewall :: Zones and NAT[network]{router}, Security policy[security]{firewall}, App-ID / User-ID[app]{app}, Content-ID profiles[security]{shield}
Management and logs :: Panorama[mgmt]{app}, Strata Logging Service[data]{db}, SIEM[mgmt]{log}
Users -> Zones and NAT
Trust zone -> Zones and NAT
DMZ -> Zones and NAT
Zones and NAT -> Security policy
Security policy -> App-ID / User-ID
App-ID / User-ID -> Content-ID profiles
Security policy -> Panorama: config and logs
Panorama -> Strata Logging Service
Strata Logging Service -> SIEM: syslog / API
```

```terms
Zone :: A group of interfaces with the same trust level (`trust`, `untrust`, `dmz`). Rules are written from zone to zone.
Security rule :: Source and destination zones, addresses, users, applications, service, action. Evaluated top down, first match wins.
App-ID :: Identifies the application from the traffic itself (`ssl`, `ms-rdp`, `teamviewer`), whatever the port.
User-ID :: Maps IPs to usernames (from AD, GlobalProtect, captive portal) so logs and rules show people.
Content-ID / security profiles :: Antivirus, anti-spyware, vulnerability protection, URL filtering, file blocking and WildFire, attached to allow rules.
WildFire :: Cloud sandbox for unknown files. Verdicts: benign, grayware, phishing, malicious.
External dynamic list (EDL) :: A URL, domain or IP list the firewall pulls from a URL. The fast way to block indicators.
Panorama :: Central management: device groups (policy) and templates (network config).
GlobalProtect :: The VPN: portal (config) and gateway (tunnel). Internet-facing, and a frequent target.
Decryption :: TLS inspection. Without it, Content-ID only sees the TLS handshake (SNI and certificate).
```

## How a packet is handled

```flow
Ingress[network]{router} --> Session lookup[app]{switch} --> NAT policy[network]{router} --> Security policy[security]{firewall} --> App-ID[app]{app} --> Content-ID[security]{shield} --> Egress[network]{globe}
```

**Read:** security rules match the **pre-NAT IP** but the **post-NAT zone**. A rule for inbound NAT to a DMZ server names the server's public IP, with the DMZ as the destination zone.

### Session end, as the logs show it

```sequence
Client[user]{laptop} -> Firewall[security]{firewall}: SYN to 203.0.113.7:443
Firewall -> Firewall: Rule "allow-web" matches as app "incomplete", then "ssl"
Firewall -> Server[external]{cloud}: Allowed, NAT to the egress IP
Server --> Client: Data, inspected by the attached profiles
Firewall -> Firewall: Session ends: one traffic log with bytes, rule and end reason
note: A threat found mid-session adds a threat log with the same session ID
```

## Traffic log

| Field | Use |
| --- | --- |
| `src`, `dst`, `natsrc`, `natdst` | Real and translated addresses |
| `from`, `to` | Source and destination zones |
| `rule` | Which security rule matched |
| `srcuser` | User-ID username, if mapped |
| `app` | App-ID application (`ssl`, `web-browsing`, `unknown-tcp`) |
| `action` | `allow`, `deny`, `drop`, `reset-client`, `reset-server`, `reset-both` |
| `session_end_reason` | `tcp-fin`, `aged-out`, `threat`, `policy-deny`… |
| `bytes_sent`, `bytes_received` | Volume, from the client's point of view |
| `category` | URL category, when URL filtering ran |
| `sessionid` | Joins traffic and threat logs for one session |

**Watch for:** `app` of `unknown-tcp` or `unknown-udp` leaving the network. Custom tunnels and C2 often show up that way.

## Threat log

| Subtype | Means |
| --- | --- |
| `vulnerability` | Exploit attempt matched an IPS signature |
| `spyware` | C2 or spyware signature (anti-spyware profile) |
| `virus` | Antivirus signature on a file in transit |
| `wildfire-virus` | File WildFire judged malicious |
| `url` | URL filtering hit (also in the URL log) |
| `file` | File blocking or file-type log |
| `scan` / `flood` | Zone protection: reconnaissance and DoS |

### Threat name anatomy

```anatomy
Microsoft Windows SMB Remote Code Execution Vulnerability :: signature name
( :: 
32424 :: threat ID
) :: 
```

**Read:** the threat ID is the stable pivot. Look it up in Palo Alto's threat vault to see exactly what the signature matches.

## Responder CLI

```text
show session all filter source 10.10.4.22
show session id 123456
show user ip-user-mapping ip 10.10.4.22
test security-policy-match from trust to untrust source 10.10.4.22 destination 203.0.113.7 destination-port 443 protocol 6 application ssl
show log threat direction equal backward
show log traffic src in 10.10.4.22
```

| Command | Answers |
| --- | --- |
| `show session all filter …` | What is this host connected to right now? |
| `show user ip-user-mapping ip …` | Who is on this IP? |
| `test security-policy-match …` | Which rule would allow or block this exact flow? |
| `show log …` | Recent logs on the box, when the SIEM is behind |

## Edge attacks to watch for

| Signal | Why |
| --- | --- |
| GlobalProtect portal or gateway exploits, e.g. CVE-2024-3400 | Pre-auth remote code execution on the firewall itself. Patch fast and hunt for implants |
| Bursts of GlobalProtect auth failures from many IPs | Password spraying the VPN |
| Admin logins from a new IP, or outside hours | Account takeover of the management plane |
| Config log: new rule with `any` source and `any` application | Backdoor rule |
| Config log: security profiles removed from an allow rule | Inspection quietly switched off |
| Management interface reachable from the internet | Shouldn't be. Restrict it to a management network |

## Containment

| Goal | How |
| --- | --- |
| Block indicators everywhere | Add them to an EDL the deny rule references |
| Isolate a host | Tag its IP into a dynamic address group used by a block rule |
| Stop a user | User-ID based deny rule, or end their GlobalProtect session |
| Keep evidence | Export logs and the running config before you change anything |

## Hunting in SecOps

### Denied traffic from one host

```udm
metadata.vendor_name = "Palo Alto Networks" nocase
principal.ip = "10.10.4.22"
security_result.action = "BLOCK"
```

### Threat log hits by signature

```udm
metadata.vendor_name = "Palo Alto Networks" nocase
security_result.threat_name != ""
$threat = security_result.threat_name
match:
  $threat
outcome:
  $hits = count(metadata.id)
  $hosts = count_distinct(principal.ip)
order:
  $hits desc
```

**Tune:** PAN-OS syslog and CEF parse differently. Check where your feed puts the rule and threat name in the UDM viewer first.
