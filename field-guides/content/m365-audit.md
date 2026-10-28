# Microsoft 365 unified audit log

Visual reference for the Microsoft 365 unified audit log (UAL) on business email compromise and data theft cases: where it comes from, how long it lasts, how to search it, the operations that matter for inbox rules, forwarding, mailbox access, file sharing and app consent, and how a BEC case reads end to end. Users, IPs and IDs below are placeholders.

## The mental model

Every Microsoft 365 workload writes audit records into one log: Exchange, SharePoint and OneDrive, Entra ID, Teams and more. You search it in the Purview portal, with PowerShell or through the Graph API, and Sentinel and Defender pick most of it up as `OfficeActivity` and `CloudAppEvents`.

```layers
Workloads :: Exchange Online[app]{mail}, SharePoint and OneDrive[storage]{bucket}, Entra ID[security]{entra/entra-id}, Teams[app]{user}
Audit :: Unified audit log[data]{log}
Read it with :: Purview Audit search[mgmt]{app}, PowerShell[mgmt]{function}, Graph API[mgmt]{globe}, Sentinel and Defender[data]{azure/sentinel}
Exchange Online -> Unified audit log
SharePoint and OneDrive -> Unified audit log
Entra ID -> Unified audit log
Teams -> Unified audit log
Unified audit log -> Purview Audit search
Unified audit log -> PowerShell
Unified audit log -> Graph API
Unified audit log -> Sentinel and Defender
```

### How long records last

```bars
Audit (Standard) :: 180 :: days
Audit (Premium) :: 365 :: days
```

**Read:** Premium's year covers Exchange, SharePoint and Entra records; a 10-year retention add-on exists. Check the tenant's licence before you scope. Records arrive 30 minutes to 24 hours after the event, so a fresh incident may not be fully there yet.

```terms
Record type / workload :: Which service wrote it: `ExchangeAdmin`, `ExchangeItem`, `SharePointFileOperation`, `AzureActiveDirectory`…
Operation :: What happened: `New-InboxRule`, `FileDownloaded`, `MailItemsAccessed`. The field you filter on most.
UserId :: Who did it (a UPN, or a service principal for apps).
ClientIP :: Where from. Can be IPv6, and may include a port.
AuditData :: The full record as JSON. Everything specific to the operation is in here.
Mailbox audit :: Exchange's own per-mailbox auditing (owner, delegate, admin actions). On by default, and feeds the UAL.
MailItemsAccessed :: Which messages were read or synced, and by which app. The answer to "what did the attacker read?"
SessionId :: Joins records from one sign-in session together. Useful when an attacker and the user are active at once.
```

## Searching it

```powershell
Connect-ExchangeOnline
Search-UnifiedAuditLog -StartDate 2026-10-01 -EndDate 2026-10-27 -UserIds j.smith@example.com -ResultSize 5000 -SessionCommand ReturnLargeSet -SessionId case1
Search-UnifiedAuditLog -StartDate 2026-10-01 -EndDate 2026-10-27 -Operations New-InboxRule,Set-InboxRule,UpdateInboxRules -ResultSize 5000
Search-UnifiedAuditLog -StartDate 2026-10-01 -EndDate 2026-10-27 -IPAddresses 203.0.113.50 -ResultSize 5000
```

| Tip | Why |
| --- | --- |
| Run with the same `-SessionId` and `ReturnLargeSet` until it returns nothing | One call returns at most 5,000 records; this pages through up to 50,000 |
| Convert each record's `AuditData` with `ConvertFrom-Json` | The useful fields are inside it |
| Narrow by user, operation or IP before widening the time range | Large searches time out |
| Use Purview Audit search for big exports | It runs as a background job and exports to CSV |

## The operations that matter

### Mail and mailbox

| Operation | Means |
| --- | --- |
| `New-InboxRule`, `Set-InboxRule` | Inbox rule created or changed from Outlook on the web or PowerShell |
| `UpdateInboxRules` | Inbox rule created or changed from the Outlook desktop client |
| `Set-Mailbox` with `ForwardingSmtpAddress` | Mailbox forwarding to an external address |
| `Add-MailboxPermission` | Someone given full access to a mailbox |
| `Add-RecipientPermission` | Someone given Send As |
| `MailItemsAccessed` | Messages read (`Bind`) or synced (`Sync`), with the app ID |
| `Send`, `SendAs`, `SendOnBehalf` | Messages sent |
| `SoftDelete`, `HardDelete`, `MoveToDeletedItems` | Messages deleted |
| `New-TransportRule` | Organisation-wide mail flow rule (admin). Attackers with admin rights use them to forward or hide mail |

### Files

| Operation | Means |
| --- | --- |
| `FileAccessed`, `FileDownloaded` | Opened / downloaded |
| `FileSyncDownloadedFull` | Synced down by the OneDrive client: bulk theft looks like this |
| `FileUploaded`, `FileModified`, `FileDeleted` | Changes |
| `SharingSet`, `SharingInvitationCreated` | Shared with someone |
| `AnonymousLinkCreated`, `AnonymousLinkUsed` | "Anyone with the link" shares, and their use |
| `SearchQueryPerformed` | Searches in SharePoint (when enabled): what was the attacker looking for? |

### Identity and apps

| Operation | Means |
| --- | --- |
| `UserLoggedIn`, `UserLoginFailed` | Sign-ins (Entra sign-in logs have more detail) |
| `Consent to application.` | A user or admin granted an app access |
| `Add delegated permission grant.` | The app's delegated permissions |
| `Add app role assignment to service principal.` | Application permissions (admin consent) |
| `Add service principal credentials.` | A new secret or certificate on an app: a persistence favourite |
| `Add member to role.` | Someone got an admin role |
| `Reset user password.`, `Update user.` | Password and account changes (MFA method changes show in `Update user.` details) |

## A BEC case, end to end

```sequence
Attacker[external]{alert} -> User[user]{laptop}: Phishing link to an adversary-in-the-middle page
User -> Attacker: Password and MFA, session cookie stolen
Attacker -> Exchange Online[app]{mail}: UserLoggedIn from a new IP (and MailItemsAccessed)
Attacker -> Exchange Online: New-InboxRule: move "invoice", "payment" to RSS Feeds
Attacker -> Exchange Online: Send: reply in an existing payment thread with new bank details
Attacker -> Exchange Online: Send: phish to the user's contacts
note: Every step after the sign-in is in the UAL. The sign-in itself is best read in Entra sign-in logs
```

How the stolen sign-in itself shows up is in the [Entra ID sign-in logs field guide](/field-guides/entra-signins/). Teams events and the external help desk phishing pattern are in the [Slack and Teams field guide](/field-guides/slack-teams/); the Google equivalent of this log is in the [Google Workspace field guide](/field-guides/google-workspace/).

### What a malicious inbox rule looks like

```anatomy
Name: "." :: names are often one character, or copy a real rule's
SubjectOrBodyContainsWords: invoice;payment;bank :: watches for money conversations
MoveToFolder: RSS Feeds :: or Archive, Conversation History: folders nobody checks
MarkAsRead: True :: so the user never sees the replies
StopProcessingRules: True :: so their own rules don't interfere
```

**Read:** the rule's details are in `AuditData.Parameters` as a list of name and value pairs. Also check `DeleteMessage` and `ForwardTo` / `RedirectTo` parameters.

### Scoping questions

| Ask | Look at |
| --- | --- |
| When did the attacker first get in? | Entra sign-in logs and `UserLoggedIn` from IPs and user agents the user never uses |
| What did they read? | `MailItemsAccessed` from the attacker's `SessionId` or IP |
| What did they change? | Inbox rules, forwarding, mailbox permissions, MFA methods, app consents |
| What did they send? | `Send` records, then message trace for recipients |
| What did they take? | `FileDownloaded`, `FileSyncDownloadedFull`, sharing and anonymous links |
| Did they persist? | New MFA methods, app consents, service principal credentials, new devices |

## Containment

| Goal | How |
| --- | --- |
| Throw the attacker out | Reset the password **and** revoke sessions (`Revoke-MgUserSignInSession`), then check the MFA methods |
| Undo their changes | Remove malicious inbox rules, forwarding, mailbox permissions, MFA methods and app consents |
| Stop the phish they sent | Search and purge the messages; warn the recipients |
| Stop it happening again | Phishing-resistant MFA, token protection, block external forwarding by default |

## Queries

### Inbox rules created or changed (Sentinel)

```kql
OfficeActivity
| where TimeGenerated > ago(30d)
| where Operation in ("New-InboxRule", "Set-InboxRule", "UpdateInboxRules")
| extend Params = tostring(Parameters)
| project TimeGenerated, UserId, ClientIP, Operation, Params
```

### Forwarding to external addresses (Defender Advanced Hunting)

```kql
CloudAppEvents
| where Timestamp > ago(30d)
| where ActionType in ("Set-Mailbox", "New-InboxRule", "Set-InboxRule")
| where RawEventData has_any ("ForwardingSmtpAddress", "ForwardTo", "RedirectTo")
| project Timestamp, AccountDisplayName, IPAddress, ActionType, RawEventData
```

### Bulk downloads by one user (Splunk)

```spl
index=o365 sourcetype="o365:management:activity" Operation IN ("FileDownloaded", "FileSyncDownloadedFull") earliest=-7d
| stats count, dc(ObjectId) as files, values(ClientIP) as ips by UserId
| where files > 200
| sort - files
```

### Inbox rules (SecOps)

```udm
metadata.product_name = "Office 365" nocase
metadata.product_event_type = /^(New-InboxRule|Set-InboxRule|UpdateInboxRules)$/
```

**Tune:** check how your SecOps feed names the product (`Office 365` or `Microsoft 365`) in the UDM viewer first.
