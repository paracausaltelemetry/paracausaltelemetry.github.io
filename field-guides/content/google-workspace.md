# Google Workspace audit logs

Visual reference for Google Workspace on cases: where audit events live and how long, the log applications that matter (login, admin, token, Drive, SAML, user accounts), the Reports API, account takeover, OAuth consent and Drive exfiltration investigations, and containment from the Admin console. Users, domains and IDs below are placeholders.

## The mental model

Every Workspace service writes **activity events**, grouped by **application** (login, admin, drive, token and so on). Admins read them in the Admin console under **Reporting > Audit and investigation**, or with the **Security investigation tool** on Enterprise editions. Your SIEM gets them from the **Reports API**, or from an export to **BigQuery**.

```layers
Users and apps :: User[user]{laptop}, Third-party app (OAuth)[external]{app}, Admin[mgmt]{user}
Workspace :: Google sign-in[security]{key}, Gmail and Drive[app]{mail}, Admin console[mgmt]{app}
Audit :: Activity events by application[data]{log}, Alert center[security]{alert}
Out :: Reports API[app]{function}, BigQuery export[data]{db}
User -> Google sign-in
Third-party app (OAuth) -> Gmail and Drive: token
Admin -> Admin console
Google sign-in -> Activity events by application
Gmail and Drive -> Activity events by application
Admin console -> Activity events by application
Activity events by application -> Alert center
Activity events by application -> Reports API: SIEM
Activity events by application -> BigQuery export
```

```terms
Application :: The log an event belongs to: `login`, `admin`, `token`, `drive`, `saml`, `user_accounts`, `groups`, `mobile`, `meet`, `chat`.
Event name :: What happened, inside the application: `login_failure`, `authorize`, `change_document_visibility`.
Parameters :: Name and value pairs on each event: the IP, the document, the OAuth scopes, the old and new setting.
Actor :: Who did it, by email and profile ID. For admin events, the admin.
Audit and investigation :: The Admin console's log search, one page per application.
Security investigation tool :: Enterprise and Education Plus: search across applications, and act (sign out, reset, delete mail) from the results.
Alert center :: Google's own alerts: suspicious logins, government-backed attacks, leaked passwords, phishing reclassified, device compromised.
Reports API :: `admin.googleapis.com/admin/reports/v1/activity/...`: how SIEM connectors read events.
BigQuery export :: Enterprise: all activity and Gmail log events copied to your own BigQuery dataset, kept as long as you like.
```

**Read:** retention in the Admin console is limited (about six months for most applications) and events can arrive minutes to hours late. Check Google's data retention and lag times page before you call a gap evidence.

## Log applications

| Application | Key events |
| --- | --- |
| `login` | `login_success`, `login_failure`, `login_challenge`, `logout`, `suspicious_login`, `gov_attack_warning` |
| `user_accounts` | Password changed, 2-Step Verification enrolled or turned off, recovery email or phone changed |
| `admin` | Users created, deleted or suspended; admin roles granted (`ASSIGN_ROLE`, `GRANT_ADMIN_PRIVILEGE`); passwords reset by an admin (`CHANGE_PASSWORD`); domain-wide delegation granted (`AUTHORIZE_API_CLIENT_ACCESS`); Gmail routing and security settings changed |
| `token` | `authorize` and `revoke` for OAuth apps, with the app name, client ID and scopes |
| `drive` | `view`, `download`, `copy`, `delete`, `change_user_access`, `change_document_visibility` (shared with a link or public) |
| `saml` | Sign-ins to SAML apps with Google as the identity provider |
| `groups` | Members added, group settings changed (a group opened to external posting) |
| `mobile` | Devices registered, compromised device alerts, remote wipes |

## Reports API

```text
GET https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/login?eventName=login_failure&startTime=2026-10-20T00:00:00Z
GET https://admin.googleapis.com/admin/reports/v1/activity/users/jsmith@example.com/applications/token
GET https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/admin?eventName=ASSIGN_ROLE
```

| Parameter | Use |
| --- | --- |
| `users/all` or `users/<email>` | Everyone, or one user |
| `eventName` | One event |
| `startTime`, `endTime` | RFC 3339 times |
| `filters` | Parameter conditions: `filters=doc_type==document` |
| `actorIpAddress` | Everything from one IP |

**Read:** the API needs an admin with the Reports privilege, or a service account with domain-wide delegation and the `admin.reports.audit.readonly` scope.

## Investigation: account takeover

```sequence
Attacker[external]{globe} -> Google sign-in[security]{key}: Signs in with a phished password and session
Google sign-in -> Alert center[security]{alert}: suspicious_login (maybe)
Attacker -> User accounts[app]{user}: Adds own recovery phone, disables 2SV
Attacker -> Gmail[app]{mail}: Forwarding, filters, reads mail
Attacker -> Third-party app[external]{app}: Grants an OAuth app mail access
note: Stolen session cookies skip the password and 2SV entirely
```

| Ask | Where |
| --- | --- |
| Which IPs signed in, and were any new? | `login` events for the user: `login_success`, `login_challenge`, `suspicious_login` |
| Did they change recovery or 2SV? | `user_accounts` events |
| Did they connect an app? | `token` events with `authorize` |
| Did they forward mail or add filters? | The user's Gmail settings (check directly), and Gmail log events if exported |
| What did they read or download? | `drive` events by the user and IP; Gmail log search for sent mail |

## Investigation: OAuth consent phishing

| Signal | What to look at |
| --- | --- |
| `authorize` for an app nobody has heard of | `app_name`, `client_id` and the `scope` values |
| Broad scopes | `https://mail.google.com/`, `gmail.readonly`, `drive`, `drive.readonly` |
| Many users granting the same client ID in a short window | A campaign: group `token` events by `client_id` |
| Grants straight after a phishing email | The email's link pointing at `accounts.google.com/o/oauth2` |

**Read:** an OAuth grant survives a password reset. Revoke the token and block the client ID, or the attacker keeps access to the mailbox.

## Investigation: Drive exfiltration

| Signal | Where |
| --- | --- |
| Downloads far above the user's normal | `drive` `download` events grouped by user and day |
| Files made public or shared to personal addresses | `change_document_visibility` (to `people_with_link` or `public_on_the_web`), `change_user_access` to an external domain |
| Takeout | Google Takeout use (an admin setting can turn it off per org unit) |
| Shared drive membership changes | `drive` membership events |

## Containment

| Goal | How (Admin console) |
| --- | --- |
| End sessions | User > Security > Sign-in cookies: Reset. Signs the user out everywhere |
| Lock the account | Reset password and require change, or Suspend the user |
| Remove attacker recovery | User > Security: remove recovery email and phone the user didn't set; revoke app passwords |
| Revoke an app | User > Security > Connected applications, or the `token` API; then Security > API controls > App access control: Blocked |
| Undo delegation | Security > API controls > Domain-wide delegation: delete clients you didn't add |
| Stop sharing | Drive sharing settings for the org unit; change ownership or visibility of the affected files |

## Queries

### Failed logins by IP (SecOps)

```udm
metadata.product_name = "Google Workspace" nocase
metadata.product_event_type = "login_failure"
$ip = principal.ip
match:
  $ip
outcome:
  $users = count_distinct(target.user.email_addresses)
  $failures = count(metadata.id)
order:
  $users desc
```

### OAuth grants with mail scopes (Splunk, Google Workspace add-on)

```spl
index=gws sourcetype="gws:reports:token" "events{}.name"=authorize "https://mail.google.com/"
| stats count, values(actor.email) as users, dc(actor.email) as user_count by "events{}.parameters{}.value"
| sort - user_count
```

### Files made public (Elastic)

```esql
FROM logs-google_workspace.drive-*
| WHERE @timestamp > NOW() - 7 days AND event.action == "change_document_visibility"
| KEEP @timestamp, user.email, source.ip, google_workspace.drive.title, google_workspace.drive.visibility
| SORT @timestamp DESC
```

**Tune:** each connector names fields its own way (raw `events{}.parameters{}` in Splunk, ECS plus `google_workspace.*` in Elastic, UDM in SecOps). Check one event first.
