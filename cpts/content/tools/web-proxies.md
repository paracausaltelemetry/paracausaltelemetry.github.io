---
tool: Web proxies (Burp & ZAP)
slug: web-proxies
kind: technique
stages: [pre-compromise]
targets: [windows, linux]
category: Intercept, repeat, fuzz and encode HTTP
platforms: [web, linux]
services: [http, https]
ports: [80, 443, 8080, 8443]
tags: [burp, zap, proxy, intercept, repeater, intruder, fuzzer, decoder, foxyproxy]
attack: [T1557, T1040]
summary: An intercepting proxy sits between the browser and the app so you can read, edit and replay every request. Burp Suite and OWASP ZAP are the two to know: intercept and tamper, replay in Repeater, brute positions in Intruder, and encode or decode payloads. The backbone of hands-on web testing.
references:
  - PortSwigger: Burp Suite documentation | https://portswigger.net/burp/documentation
  - OWASP ZAP documentation | https://www.zaproxy.org/docs/
---

## When to reach for it

Any web target, as soon as you have a browser pointed at it. The proxy turns an opaque web app into something you can read and rewrite request by request: change a parameter the UI will not let you change, replay a login a hundred times, slip a payload past client-side validation. Burp is the industry default; ZAP is the free, scriptable alternative. Learn one well and the other follows.

## Set up the proxy

Point the browser (or any tool) at the proxy listener on `127.0.0.1:8080`, then trust its CA so HTTPS does not warn. In the proxied browser, open `burp` (or ZAP's equivalent) to download the CA certificate and import it into the browser's trust store. `FoxyProxy` makes flipping the proxy on and off one click.

```text
Browser proxy -> 127.0.0.1:8080  (Burp default) / 127.0.0.1:8080 (ZAP)
Import the proxy CA cert so HTTPS is not flagged
FoxyProxy preset: 127.0.0.1 : 8080
```

## Proxy other tools through Burp

Most CLI tools can route through the proxy so their traffic shows up in the history, ready to replay or scope.

```bash
curl -x 127.0.0.1:8080 -k https://TARGET/           # curl through the proxy
export HTTP_PROXY=127.0.0.1:8080 HTTPS_PROXY=127.0.0.1:8080
# msfconsole modules:
#   set PROXIES HTTP:127.0.0.1:8080
```

For tools that only speak SOCKS, point Burp's upstream at them, or chain `proxychains` in front.

## Repeater and Intruder

`Repeater` replays one request you can edit freely: send to Repeater, change a value, resend, read the response. The workhorse for manual testing. `Intruder` automates it, marking payload positions with `§...§` and iterating a payload set:

- **Sniper** — one payload set, one position at a time (the default; fuzz a single field).
- **Battering ram** — one set, same payload in every position at once.
- **Pitchfork** — multiple sets in lockstep (e.g. matched user/password pairs).
- **Cluster bomb** — multiple sets, every combination (credential brute force).

Use the Grep-Match and response-length columns to spot the anomalous response. The community edition throttles Intruder, so a wordlist attack is often faster with `ffuf` against the same request.

## Decode and encode (Decoder / Inspector)

Payloads often need encoding to survive transit, URL, Base64, HTML-entity, hex. Burp's `Decoder` (and the `Inspector` panel on newer builds) encodes and decodes in place, and will "smart decode" a blob it recognises. `Comparer` diffs two responses to see what a change actually altered.

## OWASP ZAP

ZAP covers the same ground, free and scriptable. The `HUD` overlays controls on the page itself; the `Manual Request Editor` is the Repeater equivalent; the `Fuzzer` is Intruder; `Spider` and `Active Scan` crawl and test automatically. It also runs headless for automation.

```bash
zaproxy                                              # GUI
zap.sh -cmd -quickurl https://TARGET -quickout /tmp/zap.html   # headless quick scan
```

## Notes

A proxy records and can replay everything the browser does, so treat the captured history as sensitive and stay within the engagement scope. Active Scan and Intruder send real, sometimes destructive, requests to the target, run them only against systems you are authorised to test, and never point an automated scanner at third-party or shared infrastructure.
