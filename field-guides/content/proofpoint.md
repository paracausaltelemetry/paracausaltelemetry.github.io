# Proofpoint

Visual reference for Proofpoint email security on cases: the gateway and Targeted Attack Protection, how URL Defense rewrites links, the four TAP event types, how to trace a campaign and its clicks, and how TRAP pulls messages back. Addresses, domains and IDs below are placeholders.

## The mental model

Proofpoint Email Protection is the gateway (often Proofpoint on Demand, PoD). Targeted Attack Protection (TAP) adds URL Defense and Attachment Defense, and reports every threat delivered, blocked, clicked or stopped. TRAP pulls delivered threats back out of mailboxes.

```layers
Internet :: Sender[external]{mail}, Attacker[external]{alert}
Proofpoint :: Email Protection[security]{shield}, Attachment Defense[security]{log}, URL Defense[security]{globe}
Mailboxes :: Microsoft 365 / Exchange[app]{mail}, User[user]{laptop}
Response :: TAP dashboard and SIEM API[mgmt]{radar}, TRAP[mgmt]{alert}
Sender -> Email Protection: MX
Attacker -> Email Protection: MX
Email Protection -> Attachment Defense
Attachment Defense -> Microsoft 365 / Exchange: delivered, links rewritten
Microsoft 365 / Exchange -> User
User -> URL Defense: click
URL Defense -> TAP dashboard and SIEM API: click events
TAP dashboard and SIEM API -> TRAP: threat found later
TRAP -> Microsoft 365 / Exchange: pull message
```

```terms
Email Protection (PPS / PoD) :: The gateway: spam, virus, policy, impostor classification. Proofpoint on Demand is the hosted version.
TAP :: Targeted Attack Protection: URL Defense, Attachment Defense, and the dashboard and SIEM API that report threats.
URL Defense :: Rewrites URLs to `urldefense.com` and checks them at click time.
Attachment Defense :: Sandboxes attachments before or after delivery.
Threat ID :: A stable ID for one threat (a URL or attachment) in TAP. Pivot on it to find every message carrying it.
Classification :: `malware`, `phish`, `spam`, `impostor` (BEC).
VAP :: Very Attacked People: the users TAP sees targeted most. Watch their accounts harder.
TRAP :: Threat Response Auto-Pull: removes delivered messages that are later found malicious, and follows forwards.
Smart Search :: Message trace in the Email Protection console.
```

## A rewritten link

```anatomy
https://urldefense.com/v3/ :: URL Defense, version 3 format
__https://example-login.com/reset__ :: original URL, between double underscores
; :: 
!!AbCd!EfGhIj$ :: encoded characters and tracking tokens
```

**Read:** in v3 links the original URL is readable between the `__` markers. Some characters are moved into the token part, so decode with Proofpoint's decoder before searching on the exact URL.

### What happens on click

```sequence
User[user]{laptop} -> URL Defense[security]{globe}: Click the rewritten link
URL Defense -> URL Defense: Check the destination now
URL Defense --> User: Malicious: block page (a click blocked event)
URL Defense --> User: Clean or unknown: redirect (a click permitted event)
note: A click permitted on a URL later rated malicious is your most urgent TAP event
```

## TAP events

| Event (SIEM API) | Means |
| --- | --- |
| `messagesDelivered` | A message with a threat reached a mailbox |
| `messagesBlocked` | A message with a threat was stopped |
| `clicksPermitted` | Someone clicked a threat URL and was let through |
| `clicksBlocked` | Someone clicked and was stopped |

| Field | Use |
| --- | --- |
| `threatID`, `threatStatus` | Pivot to every message with the same threat, and whether it's active, cleared or a false positive |
| `classification` | `malware`, `phish`, `spam`, `impostor` |
| `recipient`, `sender`, `subject`, `messageID` | Find the message in Smart Search and the mailbox |
| `clickIP`, `clickTime`, `userAgent`, `url` | Who clicked, from where, with what |
| `GUID` | Proofpoint's ID for one message |

## Investigation flow

```flow
TAP alert[security]{alert} --> threatID: every message[app]{log} --> clicksPermitted[security]{globe} --> TRAP pull[mgmt]{mail} --> Endpoint and identity checks[user]{laptop}
```

| Step | Ask |
| --- | --- |
| threatID | Which messages and recipients carry this threat? Were any delivered? |
| Clicks | Any `clicksPermitted`? Which users, from which IPs and devices? |
| Smart Search | Same sender, subject or envelope across the organisation, including ones TAP didn't flag |
| TRAP | Pulled automatically? If not, pull manually, including forwarded copies |
| Endpoint | For anyone who clicked or opened: what ran next? |
| Identity | If it was a credential phish: sign-ins after `clickTime` from new IPs, MFA changes, inbox rules |

## Containment

| Goal | How |
| --- | --- |
| Pull delivered messages | TRAP (automatic, or a manual pull by message ID) |
| Stop more arriving | Block the sender or domain in an Email Protection policy |
| Stop clicks working | Block the URL or domain in URL Defense |
| Contain a compromised user | Reset password, revoke sessions, remove malicious inbox rules |

## Hunting in SecOps

### Permitted clicks

```udm
metadata.vendor_name = "Proofpoint" nocase
target.url != ""
security_result.action = "ALLOW"
$user = principal.user.email_addresses
match:
  $user
outcome:
  $clicks = count(metadata.id)
  $urls = array_distinct(target.url)
order:
  $clicks desc
```

### Delivered threats by classification

```udm
metadata.vendor_name = "Proofpoint" nocase
metadata.event_type = "EMAIL_TRANSACTION"
$class = security_result.category_details
match:
  $class
outcome:
  $messages = count(metadata.id)
```

**Tune:** TAP and the Email Protection message logs arrive as separate feeds in SecOps. Check one event of each in the UDM viewer first.
