# Cloudflare

Visual reference for Cloudflare on cases: how requests reach an origin through Cloudflare, the security layers (DDoS, WAF, bots, rate limiting), Zero Trust (Access, Gateway, Tunnel), the Logpush datasets and fields, reading a Ray ID, investigations for web attacks and account takeover of the Cloudflare account itself, and how attackers abuse Cloudflare services. Domains, IPs and IDs below are placeholders.

## The mental model

With the proxy on (the orange cloud), DNS for a hostname points at Cloudflare. Every request hits the nearest Cloudflare data centre, passes the security layers in order, and only then goes to your origin, from Cloudflare's IPs. Zero Trust uses the same network the other way round: users' traffic goes out through Gateway, and private apps are reached through Tunnel.

```layers
Clients :: Visitor[user]{laptop}, Attacker or bot[external]{alert}
Cloudflare edge :: DDoS protection[security]{shield}, WAF and custom rules[security]{firewall}, Bot management and rate limiting[security]{radar}
Origin and logs :: Logpush and Security Events[mgmt]{log}, Origin server or tunnel[compute]{server}
Visitor -> DDoS protection
Attacker or bot -> DDoS protection
DDoS protection -> WAF and custom rules
WAF and custom rules -> Bot management and rate limiting
Bot management and rate limiting -> Origin server or tunnel: allowed requests
WAF and custom rules -> Logpush and Security Events: every request
```

```terms
Proxied (orange cloud) :: DNS answers with Cloudflare's IPs and traffic goes through the edge. Grey cloud is DNS only: no protection, and the origin IP is public.
Zone :: A domain in a Cloudflare account. Most settings and logs are per zone.
WAF managed rules :: Cloudflare's and OWASP rule sets for common attacks. Each request also gets a WAF attack score (1 to 99; lower is more likely an attack).
Custom rules :: Your own expressions on request fields, with an action: block, managed challenge, JS challenge, log, skip.
Rate limiting rules :: Count requests per characteristic (IP, header, cookie) over a period and act above a threshold.
Bot score :: 1 to 99; low means likely automated. Bot Management (Enterprise) exposes it to rules and logs.
Ray ID :: The ID of one request through Cloudflare. Shown on block pages; the pivot for any "I was blocked" report.
Access :: Zero Trust access to apps: identity and device checks before the request reaches the app.
Gateway :: Secure web gateway and DNS filtering for users with the WARP client or DNS settings.
Tunnel (cloudflared) :: An outbound-only connector, so an origin needs no inbound ports open.
Logpush :: Ships log datasets to storage or a SIEM. Enterprise for most datasets.
```

## Reading a Ray ID

```anatomy
8d1e2f3a4b5c6d7e :: request ID
-LHR :: data centre that served it (airport code)
```

**Read:** search `RayID` in Logpush `http_requests` or `firewall_events` (or Security Events in the dashboard) to see exactly which rule acted and why.

## Logpush datasets

| Dataset | Holds |
| --- | --- |
| `http_requests` | Every request: client, host, path, status, cache, WAF and bot scores, security action |
| `firewall_events` | Every security action: rule, source (managed WAF, custom, rate limit, bot), action |
| `dns_logs` | Queries to Cloudflare authoritative DNS |
| `audit_logs` | Account changes: who changed DNS, rules, users and API tokens, from where |
| `access_requests` | Zero Trust Access decisions per user and app |
| `gateway_dns`, `gateway_http`, `gateway_network` | Gateway filtering decisions for your users |
| `workers_trace_events` | Worker invocations and exceptions |

### http_requests fields

| Field | Use |
| --- | --- |
| `ClientIP`, `ClientCountry`, `ClientASN` | Who |
| `ClientRequestHost`, `ClientRequestMethod`, `ClientRequestURI` | What they asked for |
| `ClientRequestUserAgent` | Tool or browser |
| `EdgeResponseStatus`, `OriginResponseStatus` | What Cloudflare returned, and what the origin returned (0 if it never reached it) |
| `SecurityAction`, `SecurityRuleID`, `SecuritySources` | Which security product acted, and the rule |
| `WAFAttackScore`, `WAFSQLiAttackScore`, `WAFXSSAttackScore`, `WAFRCEAttackScore` | How attack-like the request looked |
| `BotScore`, `BotScoreSrc` | How automated it looked |
| `CacheCacheStatus` | `hit`, `miss`, `dynamic`, `bypass` |
| `RayID`, `EdgeStartTimestamp` | Pivot and time |

### firewall_events actions

| Action | Means |
| --- | --- |
| `block` | Request refused |
| `managed_challenge` / `jschallenge` / `challenge` | Visitor had to pass a challenge; `challenge_solved` / `challenge_failed` follow |
| `log` | Matched, only logged |
| `skip` | Matched a rule that skips other security features (an exception) |
| `allow` | Allowed by an IP access rule or similar |

## Investigation: a web attack

```flow
Alert or origin errors[security]{alert} --> firewall_events by source[app]{log} --> What got through?[mgmt]{radar} --> Origin logs for those requests[compute]{server} --> Custom rule or rate limit[security]{shield}
```

| Ask | Where |
| --- | --- |
| Which IPs, ASNs and paths? | `http_requests` grouped by `ClientIP`, `ClientASN`, `ClientRequestURI` |
| Was it blocked? | `firewall_events` for the same IPs and paths |
| What reached the origin? | `OriginResponseStatus` not 0, or the origin's own access log for the same time |
| Low WAF scores that were allowed? | `WAFAttackScore` under 20 with no security action: candidates for a custom rule |
| Is the origin reachable directly? | Attackers who find the origin IP bypass Cloudflare entirely: see below |

**Watch for:** an origin that accepts connections from anywhere. Allow only Cloudflare's IP ranges (or use Tunnel and Authenticated Origin Pulls), or the WAF can be skipped by going straight to the origin.

## Investigation: the Cloudflare account itself

The account controls DNS for the whole domain. Taking it over means rerouting mail, websites and certificate issuance.

| Signal | Where |
| --- | --- |
| DNS record changes nobody planned (MX, A records, new subdomains) | `audit_logs`: `rec_set`, `rec_add`, `rec_del` actions |
| New API tokens, or the Global API Key viewed or rolled | `audit_logs` |
| New account members or changed roles | `audit_logs` |
| WAF rules, Access policies or Gateway rules disabled or loosened | `audit_logs` |
| Logins from new IPs; 2FA disabled | `audit_logs` login events, account security settings |

**Read:** prefer scoped API tokens to the Global API Key, which can do anything the user can. Treat a leaked Global API Key as a full account compromise.

## How attackers abuse Cloudflare

| Abuse | What it looks like |
| --- | --- |
| Phishing on `workers.dev` and `pages.dev` | Free hosting with a trusted domain and valid TLS. Proxies and email filters can't block the whole domain |
| Quick tunnels (`trycloudflare.com`) | Malware campaigns serve payloads or C2 through `cloudflared` quick tunnels: random subdomains of `trycloudflare.com` |
| `cloudflared` on a compromised host | A persistent tunnel out of the network for remote access, needing no inbound ports |
| Cloudflare in front of attacker infrastructure | The real server is hidden; IP blocks hit Cloudflare's shared IPs. Block by domain instead |

**Watch for:** `cloudflared.exe` or `cloudflared` running on hosts that don't publish services, and DNS lookups of `*.trycloudflare.com` or `*.argotunnel.com` from endpoints.

## Containment

| Goal | How |
| --- | --- |
| Block an attacker | Custom rule on IP, ASN, country, path or user agent (block or managed challenge) |
| Slow credential stuffing | Rate limiting rule on the login path, keyed on IP or a header; leaked credentials detection where available |
| Survive a flood | Under Attack mode for the zone, or a managed challenge on the targeted path |
| Lock the account | Remove unknown members, roll the Global API Key, revoke API tokens, force 2FA, check DNS against a known-good export |
| Revoke a user's Zero Trust sessions | Access: revoke the user's sessions; Gateway: block the device |

## Queries

### Top blocked sources (Splunk, Logpush firewall_events)

```spl
index=cloudflare sourcetype="cloudflare:json" Action=block
| stats count, values(ClientRequestPath) as paths, values(Source) as sources by ClientIP, ClientASNDescription
| sort - count
| head 20
```

### Attack-like requests that reached the origin (Splunk, http_requests)

```spl
index=cloudflare sourcetype="cloudflare:json" WAFAttackScore<20 OriginResponseStatus>0 NOT SecurityAction=block
| table _time, ClientIP, ClientRequestHost, ClientRequestURI, WAFAttackScore, OriginResponseStatus, RayID
```

### Quick tunnel lookups from endpoints (Defender Advanced Hunting)

```kql
DeviceNetworkEvents
| where Timestamp > ago(30d)
| where RemoteUrl endswith ".trycloudflare.com" or RemoteUrl endswith ".argotunnel.com"
| summarize count(), urls = make_set(RemoteUrl, 10) by DeviceName, InitiatingProcessFileName
```

### cloudflared running (SecOps)

```udm
metadata.event_type = "PROCESS_LAUNCH"
target.process.file.full_path = /cloudflared(\.exe)?$/ nocase
```

**Tune:** Logpush fields arrive as JSON; how your SIEM names the sourcetype or table depends on how the push is set up. Check one event first.
