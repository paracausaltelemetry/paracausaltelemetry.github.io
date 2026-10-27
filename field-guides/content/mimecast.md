# Mimecast

Visual reference for Mimecast email security on cases: where it sits in mail flow, what each protection layer does, how URL rewriting works, how to trace a message and its clicks, and how to pull a bad message back out. Addresses, domains and IDs below are placeholders.

## The mental model

MX records point at Mimecast, so every inbound message passes its gateway policies before it reaches Microsoft 365 or Exchange. Targeted Threat Protection (TTP) keeps protecting after delivery: links are rewritten and checked on click, and attachments are sandboxed.

```layers
Internet :: Sender[external]{mail}, Attacker[external]{alert}
Mimecast gateway :: Policies[security]{shield}, Anti-spam and AV[security]{shield}, Impersonation Protect[security]{user}, Attachment Protect[security]{log}
Mailboxes :: Microsoft 365 / Exchange[app]{mail}, User[user]{laptop}
After delivery :: URL Protect[security]{globe}, Threat Remediation[mgmt]{alert}
Sender -> Policies: MX
Attacker -> Policies: MX
Policies -> Anti-spam and AV
Anti-spam and AV -> Impersonation Protect
Impersonation Protect -> Attachment Protect
Attachment Protect -> Microsoft 365 / Exchange: delivered
Microsoft 365 / Exchange -> User
User -> URL Protect: clicks a rewritten link
Threat Remediation -> Microsoft 365 / Exchange: remove message
```

```terms
Secure Email Gateway :: Mimecast as your MX: inbound and outbound mail passes its policies.
URL Protect (TTP) :: Rewrites links in mail and checks the destination each time someone clicks.
Attachment Protect (TTP) :: Sandboxes attachments, or delivers a safe converted copy while the original is checked.
Impersonation Protect (TTP) :: Scores mail for lookalike domains, display-name spoofing and other BEC signs.
Internal Email Protect :: Scans internal and outbound mail, to catch a compromised account sending phish.
Held / hold for review :: Messages a policy stopped. Admins (and sometimes users) release or reject them.
Message tracking :: Search one message's route: received, processed, held, rejected, delivered.
Threat Remediation :: Removes a delivered message from every mailbox it reached, and can restore it.
```

## A rewritten link

```anatomy
https://protect-eu.mimecast.com :: URL Protect service (region)
/s/ :: 
AbCdEfGhIjK :: tracking ID for this link in this message
?domain=example-login.com :: original destination domain
```

**Read:** the rewritten link holds no full destination, only the domain. To see the real URL and who clicked it, open the TTP URL logs.

### What happens on click

```sequence
User[user]{laptop} -> URL Protect[security]{globe}: Click the rewritten link
URL Protect -> URL Protect: Scan the destination now (not at delivery)
URL Protect --> User: Malicious: block page. Unknown: warning or user awareness prompt
URL Protect --> User: Clean: redirect to the real URL
note: Every click is logged with user, URL, time and verdict in the TTP URL logs
```

## Investigation flow

```flow
Report or alert[user]{alert} --> Message tracking[app]{log} --> TTP URL and attachment logs[security]{shield} --> Threat Remediation[mgmt]{mail} --> Block sender / domain[security]{firewall}
```

| Step | Ask |
| --- | --- |
| Message tracking | Who sent it, to whom, and what happened: delivered, held, rejected? Search by sender, subject or message ID |
| Other recipients | Search the same sender, subject or attachment hash across the whole organisation |
| TTP URL logs | Did anyone click? When, from which IP, and was it allowed? |
| TTP attachment logs | Was the attachment sandboxed? Malicious or clean? |
| Impersonation logs | Which BEC signs fired: new domain, similar domain, display name? |
| Endpoint | For anyone who clicked or opened: what ran next on their device? |

## Log types (API and SIEM)

| Log | Holds |
| --- | --- |
| Receipt | Connection and acceptance at the gateway: sender IP, envelope, rejection reasons |
| Process | Policy decisions: held, bounced, actions taken |
| Delivery | Hand-off to the mailbox server, and its result |
| TTP URL | Every click on a rewritten link, with verdict |
| TTP Attachment | Sandbox results |
| TTP Impersonation | BEC detections and their hit reasons |
| Audit | Admin actions: policy changes, releases, permitted senders |

**Watch for:** in the audit log, new permitted senders or bypass policies, and admins releasing held messages that were held for malware or impersonation.

## Containment

| Goal | How |
| --- | --- |
| Pull a delivered phish | Threat Remediation: remove by message ID, sender or attachment hash |
| Stop more arriving | Blocked senders policy for the address or domain |
| Stop clicks working | Add the URL or domain to the managed URL block list |
| Contain a compromised user | Reset password, revoke sessions (Entra), check their outbound mail in Internal Email Protect |

## Hunting in SecOps

### Mimecast deliveries from a sender

```udm
metadata.vendor_name = "Mimecast" nocase
network.email.from = /@lookalike-domain\.example$/ nocase
```

### Clicks allowed on rewritten links

```udm
metadata.vendor_name = "Mimecast" nocase
target.url != ""
security_result.action = "ALLOW"
$user = principal.user.email_addresses
match:
  $user
outcome:
  $clicks = count(metadata.id)
  $urls = array_distinct(target.url)
```

**Tune:** Mimecast log types map to different UDM event types (email vs URL clicks). Check one event of each in the UDM viewer first.
