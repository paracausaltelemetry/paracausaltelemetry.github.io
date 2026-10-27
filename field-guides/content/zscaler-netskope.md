# Zscaler and Netskope

Visual reference for cloud proxies (SSE) on cases: how traffic is steered to Zscaler or Netskope, what the web, CASB and private access logs hold, how to read a proxy log line, investigations for phishing clicks and data exfiltration, and the bypasses to look for. Users, domains and IPs below are placeholders.

## The mental model

An agent on the device (or a tunnel from the office) sends web traffic to the vendor's nearest data centre. The proxy decrypts it, applies URL, threat, cloud app and DLP policy, and logs every transaction. Private apps are reached through connectors inside your network, never by exposing them.

```layers
Users :: Laptop with agent[user]{laptop}, Office via GRE / IPsec[network]{building}
Security cloud :: SSL inspection[security]{lock}, Policy engine[security]{shield}, Sandbox[security]{radar}
Destinations :: Private apps via connector[compute]{server}, Internet and SaaS[external]{globe}
Logs :: Log streaming to SIEM[mgmt]{db}
Laptop with agent -> SSL inspection
Office via GRE / IPsec -> SSL inspection
SSL inspection -> Policy engine
Policy engine -> Sandbox: unknown files
Policy engine -> Internet and SaaS
Policy engine -> Private apps via connector: ZTNA
Policy engine -> Log streaming to SIEM: every transaction
```

### The same pieces, by vendor

| Job | Zscaler | Netskope |
| --- | --- | --- |
| Web proxy (SWG) | ZIA (Zscaler Internet Access) | Next Gen SWG |
| Private access (ZTNA) | ZPA, with App Connectors | Netskope Private Access (NPA), with Publishers |
| Endpoint agent | Zscaler Client Connector (ZCC) | Netskope Client |
| SaaS API scanning | CASB (out of band) | API-enabled Protection / CASB |
| Log export | Nanolog Streaming Service (NSS, Cloud NSS) | Log Streaming, Cloud Log Shipper, REST API v2 |
| Data centres | Zscaler cloud (`zscaler.net`, `zscalertwo.net`…) | NewEdge |

```terms
Steering :: Which traffic goes to the proxy: everything, or only web, with some apps bypassed. A bypass means no inspection and no logs.
SSL inspection :: The proxy decrypts TLS with its own CA, trusted by your devices. Without it, policy only sees the domain (SNI).
URL category :: The proxy's classification of a site: Newly Registered Domains, Phishing, File Sharing…
Cloud app / CCI :: The proxy's catalogue of SaaS apps with a risk score: Zscaler's risk index, Netskope's Cloud Confidence Index (CCI).
Instance :: Which tenant of a SaaS app a user is in: the company's OneDrive or a personal one. The key fact in an exfiltration case.
Activity :: What the user did in an app: login, upload, download, share, post, edit.
Isolation :: Browser isolation: risky sites render in a remote browser and only pixels reach the user.
```

## Reading a web log

### Zscaler ZIA (NSS web feed)

| Field | Use |
| --- | --- |
| `login` | User |
| `cintip` / `cip` | Device's internal IP / public IP the traffic came from |
| `url`, `host`, `reqmethod`, `respcode` | What was requested and what came back |
| `action` | `Allowed` or `Blocked` |
| `urlcat`, `urlclass` | URL category and its class |
| `appname`, `appclass` | Cloud app, if recognised |
| `threatname`, `riskscore` | Threat found, and Zscaler's page risk score |
| `reqsize`, `respsize` | Bytes up and down (`reqsize` is what matters for uploads) |
| `filetype`, `bamd5` | File type, and the MD5 sent to the sandbox |
| `ua`, `devicehostname` | User agent and device name |

### Netskope (page and application events)

| Field | Use |
| --- | --- |
| `user`, `srcip`, `hostname` | User, source IP and device |
| `url`, `site`, `domain` | Destination |
| `app`, `appcategory`, `ccl` | Cloud app, its category and its Cloud Confidence Level |
| `activity` | Login, Upload, Download, Share, Post… |
| `instance_id` | Which tenant of the app (corporate or personal) |
| `action` | Allow, block, alert, useralert (coached) |
| `policy` | Which policy decided it |
| `alert_type` | On alerts: DLP, Malware, Malsite, policy, uba, Compromised Credential… |
| `file_type`, `file_size`, `md5` | For file activities |

**Read:** Netskope splits logs into **page events** (one per web page or connection) and **application events** (one per recognised activity in a cloud app). Exfiltration answers are in application events.

## Investigation: a phishing click

```flow
Email alert[security]{mail} --> Proxy log for the URL[app]{log} --> Allowed or blocked?[mgmt]{radar} --> Who else visited?[user]{user} --> Block URL and domain[security]{shield}
```

| Ask | Where |
| --- | --- |
| Did the user reach the page? | Web log for the URL or domain: `action`, `respcode` |
| Did they submit anything? | A `POST` to the same host after the page loaded |
| Did they download anything? | Same host, `filetype` or `file_type`, and the sandbox verdict |
| Who else visited? | The domain across all users, in the last 30 days |
| What category was it? | Newly registered and uncategorised domains are common for phishing. Consider blocking or isolating them by policy |

## Investigation: data exfiltration

```decide
start :: User suspected of taking data (leaver, insider alert)
Uploads to an unmanaged or personal app instance? :: yes :: Exfiltration likely: scope files and size
Large uploads to unknown or low-risk-score destinations? :: yes :: Exfiltration likely: scope files and size
Activity from traffic that bypasses the proxy? :: yes :: Gap: check endpoint and firewall logs
DLP alerts in the period? :: yes :: Review the matched files
end :: No proxy evidence: check endpoint, USB and email
```

### Uploads by destination (Zscaler, in Splunk)

```spl
index=zscaler sourcetype="zscalernss-web" login="j.smith@example.com" reqmethod=POST earliest=-30d
| stats sum(reqsize) as bytes_up, count by host, appname, urlcat
| eval mb_up = round(bytes_up/1024/1024, 1)
| sort - mb_up
```

### Uploads to personal app instances (Netskope, in Splunk)

```spl
index=netskope sourcetype="netskope:application" activity=Upload user="j.smith@example.com" earliest=-30d
| stats count, values(file_type) as types by app, instance_id
| sort - count
```

## Bypasses to look for

| Signal | Why |
| --- | --- |
| Agent disabled, logged out or uninstalled | Users or malware turning the proxy off. Both agents log their state; check it's locked with a password |
| A device that stopped appearing in proxy logs | Traffic is leaving another way |
| Direct traffic to the internet on the firewall from steered devices | A bypass or broken steering |
| Broad SSL inspection exemptions | Every exempt domain is a blind spot. Attackers host payloads on popular, often-exempt services |
| Custom proxy or tunnel apps (`unknown`, VPN categories) | Users or malware tunnelling out |
| Admin audit log: new bypass, exemption or policy change | Check who made it and why |

## Private access (ZPA and NPA)

| Log | Holds |
| --- | --- |
| ZPA User Activity / NPA events | User, application, connector or publisher, server IP and port, bytes, result |
| ZPA User Status / client status | Client connects, disconnects, posture results |

**Watch for:** a user reaching many private apps they've never used, often after their account was phished. Private access is still lateral movement.

## Hunting in SecOps

### Blocked threats by user

```udm
metadata.vendor_name = "Zscaler" nocase
security_result.action = "BLOCK"
security_result.threat_name != ""
$user = principal.user.userid
match:
  $user
outcome:
  $blocks = count(metadata.id)
  $threats = array_distinct(security_result.threat_name)
order:
  $blocks desc
```

**Tune:** web, firewall and DNS logs arrive as separate feeds and parse differently. Check one event of each in the UDM viewer first.
