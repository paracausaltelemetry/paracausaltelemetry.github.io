# SatComs: Starlink and satellite links

Visual reference for satellite internet on cases and in network design: how Starlink and the GEO, MEO and LEO alternatives move traffic, what CGNAT does to addresses and investigations, and how to put a satellite link behind a real firewall with failover, VPNs and segmentation. Every IP, site and hostname below is a placeholder.

## Orbits at a glance

| Orbit | Height | Round trip | Examples | What it means for you |
| --- | --- | --- | --- | --- |
| LEO | 340–1,200 km | 20–60 ms | Starlink, Eutelsat OneWeb, Iridium, Amazon Kuiper | Feels like broadband. Satellites move, so the link hands over constantly |
| MEO | ~8,000 km | ~150 ms | SES O3b mPOWER | Fibre-like throughput for remote sites and ships |
| GEO | 35,786 km | 600 ms or more | Viasat (incl. Inmarsat), HughesNet, VSAT | Fixed dish, slow round trip, TCP accelerators in the path |

```bars
LEO: Starlink :: 40 :: ms round trip
MEO: O3b mPOWER :: 150 :: ms round trip
GEO: VSAT :: 600 :: ms round trip
Fibre, same city :: 5 :: ms round trip
```

```terms
Bands :: L-band (1–2 GHz): small antennas, rain-proof, low bandwidth (Iridium, Inmarsat BGAN). Ku (12–18 GHz) and Ka (26–40 GHz): high bandwidth, hit by heavy rain ("rain fade").
User terminal :: The customer's antenna. Starlink's is an electronically steered phased array ("the dish").
Gateway / teleport :: The ground station linking satellites to terrestrial fibre.
PoP :: Point of presence: where your traffic actually reaches the internet, often hundreds of km from the dish.
Inter-satellite links :: Lasers between Starlink satellites, so traffic can cross oceans with no nearby gateway.
Obstruction :: Anything (trees, masts, superstructure) blocking the dish's view. Causes short outages.
Handover :: Switching satellites. Starlink reschedules every 15 seconds, so expect brief latency spikes.
VSAT :: Very small aperture terminal: a fixed GEO dish, common on ships, rigs and remote sites.
```

## Starlink end to end

```flow
Laptop[user]{laptop} --Wi-Fi--> Starlink router[network]{router} --cable / PoE--> Dish[compute]{dish} --Ku-band--> Satellite[compute]{satellite}
Satellite[compute]{satellite} --laser--> Satellite[compute]{satellite} --Ka-band--> Gateway[network]{tower} --fibre--> PoP[network]{globe} --> Internet[external]
```

```terms
Starlink router :: Wi-Fi, NAT and DHCP for the LAN (`192.168.1.0/24` by default). Can be put in bypass mode.
Bypass mode :: Turns off the Starlink router's routing so your own firewall takes the WAN directly.
Dish management IP :: `192.168.100.1`, reachable from the LAN. Serves a local status page and an API with no login.
Starlink account :: The web and app account that controls the service: plan, location, router settings. Protect it with MFA.
Roam / Maritime / Aviation plans :: Mobile use. The terminal reports its location to SpaceX, and some plans are fenced to a country.
Priority / business plans :: Better priority, and options such as public IPv4.
```

## Addresses: what CGNAT does

Most Starlink plans give your router a carrier-grade NAT address, not a public one. Every packet is translated twice before it reaches the internet.

```sequence
Laptop[user]{laptop} -> Your router[network]{router}: src 192.168.1.20 (your LAN)
Your router -> Starlink CGNAT[network]{globe}: src 100.64.12.34 (CGNAT range 100.64.0.0/10)
Starlink CGNAT -> Website[external]{cloud}: src 203.0.113.7:41522 (public, shared)
Website --> Starlink CGNAT: Reply to 203.0.113.7:41522
Starlink CGNAT --> Your router: Reply to 100.64.12.34
note: Nothing on the internet can start a connection to you over IPv4
```

```terms
`100.64.0.0/10` :: Shared address space for CGNAT (RFC 6598). On your firewall's WAN, it means "you are behind carrier NAT".
Shared public IP :: Many customers leave from the same public IP. IP blocklists and reputation catch the innocent too.
IPv6 :: Starlink hands out a routable IPv6 prefix (typically a /56). Devices are reachable directly, so your firewall must deny inbound IPv6.
Public IPv4 option :: On some business plans. Needed for inbound services without a tunnel.
```

### Reverse DNS anatomy

```anatomy
customer :: customer address
.
lndngbr1 :: PoP code: London, GB, site 1
.pop.starlinkisp.net :: Starlink's PoP domain
```

**Read:** the PoP, not the dish, decides where an IP geolocates. A vessel in the North Sea can appear in London, Frankfurt or Amsterdam as it moves.

## Investigating a satellite source

| You see | It means |
| --- | --- |
| ASN 14593 (SpaceX Services) | Starlink |
| ASN 7155 (Viasat) | Viasat GEO, including some in-flight Wi-Fi |
| ASN 6621 (Hughes Network Systems) | HughesNet GEO |
| "Impossible travel" from a satellite ASN | Usually PoP geolocation, not travel. Check the user's real location |
| Same public IP across unrelated users | CGNAT. Don't block it without thinking about collateral |
| Attribution request to the provider | They need the public IP, **source port** and exact timestamp to find a CGNAT customer |
| Sign-ins from Starlink for office-only staff | Possible shadow IT, or an attacker on a Starlink-routed VPS. Ask before assuming |

### Hunt: sign-ins over Starlink (Entra ID)

```kql
SigninLogs
| where TimeGenerated > ago(30d)
| where AutonomousSystemNumber == 14593
| summarize SignIns = count(), Ips = dcount(IPAddress), Countries = make_set(tostring(LocationDetails.countryOrRegion), 10) by UserPrincipalName
| order by SignIns desc
```

### Hunt: sign-ins over Starlink (Okta System Log)

```text
securityContext.asNumber eq 14593 and eventType eq "user.session.start"
```

### Hunt: Starlink sources in SecOps

```udm
principal.ip_geo_artifact.network.asn = "14593"
$user = principal.user.userid
match:
  $user
outcome:
  $events = count(metadata.id)
  $ips = array_distinct(principal.ip)
order:
  $events desc
```

**Tune:** check the enrichment field in the UDM viewer first. ASN fields only exist where geo enrichment has run.

## A complex site behind a firewall

A remote site, vessel or branch with Starlink as the primary link, cellular as the second, and GEO VSAT as the last resort, all behind one edge firewall.

```flow
Dish (bypass)[compute]{dish} --WAN1--> Edge firewall / SD-WAN[security]{firewall} --trunk--> Core switch[network]{switch} --VLANs--> Corporate / OT / Guest[app]
5G router[network]{tower} --WAN2--> Edge firewall / SD-WAN[security]{firewall} --IPsec or SASE--> HQ / cloud security[external]{cloud}
GEO VSAT modem[network]{satellite} --WAN3 backup--> Edge firewall / SD-WAN[security]{firewall}
```

```terms
SD-WAN steering :: Picks a WAN per application by latency, jitter and loss. Voice prefers Starlink, bulk sync waits.
Health checks :: Probes per WAN. Tune for Starlink's short drops (loss over a few seconds), or you'll flap.
Session stickiness :: Keeps a flow on one WAN. Moving an established session changes its public IP and breaks it.
Segmentation :: Corporate, OT and guest on separate VLANs and zones. Guest traffic can leave locally; OT never should.
Local breakout vs backhaul :: Send SaaS straight out (faster) or through HQ or SASE (inspected). Decide per zone.
```

### Firewall checklist

| Rule | Why |
| --- | --- |
| WAN1 on DHCP, expect `100.64.x.x` | Starlink CGNAT. Don't hard-code it |
| Static route `192.168.100.1/32` via WAN1, admin VLAN only | Dish stats from your network without exposing them |
| Deny all other LAN access to `192.168.100.1` | The dish API has no login: anyone on the LAN can read it, or reboot or stow the dish |
| Default deny inbound IPv6 on every WAN | Starlink IPv6 makes LAN devices globally reachable |
| Force internal DNS; block outbound DNS and known DoH elsewhere | Keeps DNS logging and filtering when the link changes |
| Clamp TCP MSS on tunnels (about 1360) | Avoids fragmentation and stalls over IPsec |
| Buffer logs locally, ship over the tunnel | You keep evidence through outages |
| Separate rule sets per WAN for guest traffic | Crew or guest browsing never touches the corporate tunnel |

## A global organisation on Starlink

How a company with offices, field teams, vehicles and vessels across several continents runs Starlink without losing control: every terminal is only transport, and security happens at a small number of central firewalls and SASE points of presence.

### The whole picture

```layers
People and sites :: Field engineer[user]{laptop}, Pop-up site[app]{building}, Branch office[app]{building}, Vessel[app]{ship}
Terminals :: Starlink Mini[compute]{dish}, Travel firewall[security]{firewall}, Branch firewall[security]{firewall}, Ship firewall[security]{firewall}
Transport :: Starlink network[network]{satellite}, Starlink PoPs[network]{globe}, 5G / LTE backup[network]{tower}
Security edge :: SASE / ZTNA PoPs[security]{shield}, Regional hub firewalls[security]{firewall}
Core :: SaaS and cloud[external]{cloud}, Data centre apps[compute]{server}, SOC and SIEM[mgmt]{radar}
Field engineer -> Starlink Mini: Wi-Fi + ZTNA agent
Pop-up site -> Travel firewall
Branch office -> Branch firewall
Vessel -> Ship firewall
Travel firewall -> Starlink Mini: WAN
Starlink Mini -> Starlink network
Branch firewall -> Starlink network
Ship firewall -> Starlink network
Branch firewall -> 5G / LTE backup: failover
Starlink network -> Starlink PoPs
Starlink PoPs -> SASE / ZTNA PoPs: agent tunnels
Starlink PoPs -> Regional hub firewalls: IPsec
5G / LTE backup -> Regional hub firewalls
SASE / ZTNA PoPs -> SaaS and cloud
Regional hub firewalls -> Data centre apps
Regional hub firewalls -> SOC and SIEM: logs
SASE / ZTNA PoPs -> SOC and SIEM: logs
```

**Read:** the Starlink layer carries traffic but enforces nothing. Policy, inspection and logging live in the security edge, so a terminal in Kenya and one in Norway get the same rules.

### Deployment patterns

| Pattern | Kit | Security comes from | Fits |
| --- | --- | --- | --- |
| Agent only | Starlink Mini + laptop | ZTNA / SASE agent on the device | One person, short trips, field engineers |
| Travel kit | Mini + small managed firewall | Firewall builds an IPsec or SD-WAN tunnel to the nearest hub | Pop-up sites, vehicles, small teams |
| Fixed site | Standard or business kit in bypass + edge firewall pair | SD-WAN to two hubs, 5G backup, local segmentation | Branches, depots, remote plants |
| Vessel | Maritime kit + ship firewall, GEO or L-band backup | Same as a fixed site, plus OT isolation | Fleets, rigs |

```terms
Starlink Mini :: A laptop-sized terminal with a built-in Wi-Fi router, running from vehicle DC power or a large USB-C power bank. Made for roaming.
Travel firewall :: A small managed firewall that takes the Mini as its WAN, so team devices never join the Mini's own Wi-Fi.
Regional hub :: A firewall cluster in each region (EMEA, AMER, APAC) that terminates site tunnels and does inspection.
SASE PoP :: The security provider's nearest point of presence. Agents and branch connectors tunnel to it.
Central firewall manager :: One console that pushes the same policy objects and rules to every hub and site firewall.
Fleet portal :: The Starlink business account view of every terminal: status, plan, location, and who can change them.
```

### A field engineer's request, hop by hop

```sequence
Laptop[user]{laptop} -> Starlink Mini[compute]{dish}: Wi-Fi, DHCP 192.168.1.x
Starlink Mini -> Starlink PoP[network]{globe}: Across the constellation, CGNAT to a shared public IP
Starlink PoP -> SASE PoP[security]{shield}: ZTNA tunnel from the laptop's agent
SASE PoP -> SASE PoP: Identity, device posture, policy, TLS inspection
SASE PoP -> App[external]{cloud}: Allowed request, from your fixed egress IP
note: "Nearest" SASE PoP means nearest to the Starlink PoP, not to the engineer
```

### Central firewalls: hub and spoke

```layers
Management :: Starlink fleet portal[mgmt]{dish}, Central firewall manager[mgmt]{app}, SIEM[mgmt]{radar}
Hubs :: EMEA hub[security]{firewall}, AMER hub[security]{firewall}, APAC hub[security]{firewall}
Spokes :: Sites and vessels[security]{firewall}, Travel kits[security]{firewall}, Branches[security]{firewall}
Central firewall manager --> EMEA hub: policy
Central firewall manager --> AMER hub: policy
Central firewall manager --> APAC hub: policy
Sites and vessels -> EMEA hub: IPsec
Travel kits -> AMER hub: IPsec
Branches -> APAC hub: IPsec
APAC hub -> SIEM: logs (every hub)
```

**Read:** dashed lines are the control plane (policy pushed from one place); solid lines carry traffic or logs.

**Tune:** spokes connect to two hubs (primary and secondary) through SD-WAN, so a hub outage or a PoP change only moves traffic, not breaks it.

### Picking the hub for each terminal

```flow
Terminal in Lagos[compute]{dish} --exits at--> Starlink PoP Lagos or Madrid[network]{globe} --closest--> EMEA hub[security]{firewall}
Vessel off Chile[compute]{ship} --exits at--> Starlink PoP Santiago[network]{globe} --closest--> AMER hub[security]{firewall}
```

**Read:** choose hubs by where the Starlink PoP is, not where the user is. Latency is dish to PoP to hub, and the PoP can change as a vehicle or ship moves.

### Rules for a global estate

| Decision | Do |
| --- | --- |
| Allowlisting | Never allowlist Starlink IPs: they are shared and change. Allowlist your hub and SASE egress IPs in SaaS and conditional access |
| Egress | Send all corporate traffic through hubs or SASE so every app sees the same egress IPs. Only guest traffic breaks out locally |
| Identity | Policy follows the user and device (ZTNA posture), not the network they're on |
| Inventory | Record every terminal: kit serial, Starlink account, assigned user or site, plan, country. Tie it to the CMDB |
| Account | One business account (or a few by region), admin roles, MFA, alerts on plan, location and router changes |
| Country rules | Starlink licensing differs by country, and some ban terminals outright. Check before you ship a Mini |
| Physical | Minis are small, valuable and portable. Asset-tag them, and plan for theft |
| Monitoring | Terminal status and obstruction into the NOC; tunnel status from the hubs; sign-in ASN in the SIEM |
| Updates | Starlink updates terminal firmware itself. Plan for brief reboots rather than change windows |
| Trust | Treat the satellite link as an untrusted network: everything rides an encrypted tunnel |

## VPNs through CGNAT

### Site-to-site IPsec from behind Starlink

```sequence
Site firewall[security]{firewall} -> Starlink CGNAT[network]{globe}: IKE_SA_INIT, UDP 500
Starlink CGNAT -> HQ firewall[security]{firewall}: Arrives from 203.0.113.7, random port
HQ firewall --> Site firewall: NAT detected (NAT-D payloads)
Site firewall -> HQ firewall: IKE_AUTH and ESP inside UDP 4500 (NAT-T)
Site firewall -> HQ firewall: Keepalives every 10–20 s hold the NAT mapping open
note: Only the site can bring the tunnel up. HQ must accept a dynamic peer
```

| Setting | Use |
| --- | --- |
| IKEv2 with NAT-T | Required: ESP can't cross NAT on its own |
| Peer identity by FQDN or certificate, not IP | The site's public IP changes |
| HQ as responder only, with a dynamic peer | HQ can't reach the site through CGNAT |
| DPD and NAT keepalives on | Recovers after handovers and outages |
| Route-based tunnel, with SD-WAN over several WANs | The tunnel follows the best link |

**Read:** for inbound access to a site (remote support, OT vendors) use outbound-only connectors: SASE or ZTNA agents, or a hub VPN. Avoid opening ports.

## GEO and VSAT gotchas

```sequence
Laptop[user]{laptop} -> PEP at the terminal[network]{router}: TCP handshake (answered locally)
PEP at the terminal -> PEP at the hub[network]{server}: Optimised satellite protocol
PEP at the hub -> Server[external]{cloud}: Real TCP connection
note: Encrypted VPNs hide TCP, so the PEP can't help: IPsec over GEO is slow
```

| Gotcha | Effect |
| --- | --- |
| 600 ms round trip | Chatty protocols (SMB, RDP over TCP, some SaaS) feel broken |
| PEP / TCP acceleration | Splits TCP: speeds up plain TLS sessions, does nothing for IPsec or QUIC |
| Rain fade (Ku / Ka) | Drops throughput or the link in heavy rain. L-band backup survives |
| Shared, contended capacity | Busy-hour slowdowns. QoS at the edge matters more than raw speed |
| Metered data on L-band | A misbehaving update can cost real money. Block bulk traffic on that WAN |

## Maritime and remote operations

```flow
Bridge and OT systems[mgmt]{ship} --isolated--> OT firewall[security]{firewall} --vendor ZTNA only--> Shore support[external]{building}
Crew Wi-Fi[user]{phone} --guest VLAN--> Edge firewall[security]{firewall} --local breakout--> Starlink[compute]{satellite}
Corporate VLAN[app]{laptop} --> Edge firewall[security]{firewall} --IPsec--> Shore office[external]{building}
```

```terms
IACS UR E26 / E27 :: Classification society cyber rules for ships contracted from July 2024: network segmentation, asset inventories, secure remote access.
Fleet Xpress / Certus :: Inmarsat Ka-band GEO with L-band backup, and Iridium L-band LEO. Common backup links alongside Starlink.
GNSS dependency :: Starlink terminals need satellite positioning. GPS jamming or spoofing can degrade service, and it shows in navigation systems too.
Crew welfare network :: Treat it as untrusted. It shares the dish, not the network.
```

## Watch for

| Signal | Why |
| --- | --- |
| A Starlink kit at a corporate site that nobody ordered | Shadow IT bypassing your firewall and logging |
| Endpoints whose gateway is `192.168.1.1` with "STARLINK" Wi-Fi | Directly on an unmanaged Starlink router |
| LAN hosts talking to `192.168.100.1` | Dish API access: monitoring tools, or someone probing |
| Starlink account changes (plan, location, router settings) | Account takeover can take a site offline |
| Inbound IPv6 accepted on a satellite WAN | Firewall gap that CGNAT on IPv4 was hiding |
| Repeated failover flaps in SD-WAN logs | Obstruction or bad health-check tuning: sessions keep breaking |
