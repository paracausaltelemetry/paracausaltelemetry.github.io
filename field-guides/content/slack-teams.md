# Slack and Microsoft Teams

Visual reference for chat platforms on cases: where Slack and Teams keep their audit logs, Slack token types and what a leaked one gives away, Teams external access and the help desk phishing pattern, the events that matter on each, and containment. Users, workspaces and tenants below are placeholders.

## The mental model

Both are now a way in, not only a place to talk. Attackers message staff directly as "IT support" from outside the organisation, steal session tokens to read channels, and install apps that keep access. **Slack** keeps its own audit logs (the full Audit Logs API is Enterprise only). **Teams** is part of Microsoft 365: its events are in the unified audit log, its messages are stored in Exchange, and its sign-ins are Entra ID's.

```layers
People and apps :: Apps and tokens[app]{key}, Staff[user]{laptop}, External sender[external]{alert}
Platforms :: Slack workspace or org[app]{app}, Microsoft Teams[app]{app}
Logs :: Slack audit and access logs[data]{log}, Unified audit log[data]{db}
Apps and tokens -> Slack workspace or org: API
Staff -> Slack workspace or org
Staff -> Microsoft Teams
External sender -> Microsoft Teams: external chat
Slack workspace or org -> Slack audit and access logs
Microsoft Teams -> Unified audit log
```

```terms
Slack Audit Logs API :: Enterprise Grid (Enterprise) only: `api.slack.com/audit/v1/logs`, every action across the org. Needs an org-level token with `auditlogs:read`.
Access logs :: Per workspace, any paid plan: each user's sign-ins with IP, user agent and date (`team.accessLogs`).
Integration logs :: Which apps and bots were added or removed, by whom.
Slack Connect :: Channels shared with other organisations: a route in from outside.
Teams external access :: Chat with users in other Microsoft 365 tenants (federation), and with personal Teams accounts if allowed.
Teams guest access :: Outsiders added to a team as Entra guest accounts.
Unified audit log :: Microsoft 365's audit store. Teams events have the `MicrosoftTeams` workload.
Message storage :: Teams chat messages are kept in hidden folders of the users' Exchange mailboxes, found with Purview eDiscovery.
```

## Slack tokens

| Prefix | What it is | If leaked |
| --- | --- | --- |
| `xoxb-` | Bot token for an installed app | Everything the app's scopes allow, in every channel it's in |
| `xoxp-` | User token from an OAuth install | Acts as that user with the granted scopes |
| `xoxe-` | Refresh token (token rotation on) | New access tokens until revoked |
| `xoxc-` with the `d` cookie (`xoxd-`) | The browser or desktop client's session | Full access as the user, from anywhere, no password or MFA |
| `hooks.slack.com/services/T…/B…/…` | Incoming webhook URL | Post messages into a channel (phishing from a trusted bot) |

**Watch for:** tokens in code repositories, CI logs and pasted config. A `d` cookie stolen by an infostealer is a full session; it's how most Slack account takeovers happen.

## Slack audit events

| Action | Means |
| --- | --- |
| `user_login`, `user_logout` | Sign-ins, with IP and user agent in `context` |
| `user_session_reset_by_admin` | An admin signed the user out |
| `anomaly` | Slack's own detections: unexpected client, Tor exit, new ASN or IP in a session, unusual downloads |
| `file_downloaded`, `file_public_link_created` | File access and public sharing |
| `app_installed`, `app_scopes_expanded`, `app_uninstalled` | Apps added or given more access |
| `role_change_to_admin`, `role_change_to_owner` | Privilege changes |
| `user_channel_join` | Someone joined a channel (watch private and sensitive channels) |

## Teams: the help desk phishing pattern

Ransomware crews and state actors message staff in Teams from their own Microsoft 365 tenant, named to look like IT support, often right after flooding the target with spam email.

```sequence
Attacker[external]{alert} -> Staff[user]{laptop}: Email bomb: thousands of sign-up mails
Attacker -> Staff: Teams chat from "Help Desk" in another tenant
Staff -> Attacker: Accepts the chat
Attacker -> Staff: "Let me fix it": Quick Assist or a remote tool
Attacker -> Staff: Runs a loader, steals credentials
note: The chat is from outside the tenant: Teams labels it External
```

| Signal | Where |
| --- | --- |
| One-to-one chat started by an outside tenant | Unified audit log `ChatCreated` with `ParticipantInfo.HasForeignTenantUsers` true and `CommunicationType` `OneOnOne` |
| Display name like "Help Desk", "IT Support", "Security Team" from an `onmicrosoft.com` tenant | The chat's participant details |
| Quick Assist, AnyDesk or similar starting soon after | Endpoint process events on the user's device |
| A burst of newsletter and sign-up emails just before | Email logs for the user |

## Teams audit events

| Operation | Means |
| --- | --- |
| `ChatCreated` | A new chat, with participant tenants |
| `MessageCreatedHasLink`, `MessageEditedHasLink` | A message with a URL (the URL is in the record) |
| `TeamCreated`, `TeamDeleted`, `ChannelAdded` | Structure changes |
| `MemberAdded`, `MemberRemoved`, `MemberRoleChanged` | Membership and owner changes, including guests |
| `AppInstalled`, `BotAddedToTeam` | Apps and bots added |
| `TeamsSessionStarted` | A user signed in to the Teams client |
| `FileDownloaded`, `FileAccessed` | Files in Teams live in SharePoint and OneDrive: their events are there |

## Containment

| Goal | Slack | Teams |
| --- | --- | --- |
| End sessions | Admin: user's account, sign out of all sessions (`user_session_reset_by_admin`) | Entra ID: revoke sessions, reset password |
| Lock the account | Deactivate the user | Block sign-in in Entra ID |
| Remove an app | Uninstall it; revoke its tokens (`auth.revoke`); regenerate the signing secret | Teams admin centre: block the app org-wide |
| Kill a leaked webhook | Remove or regenerate the incoming webhook | Remove the connector or workflow |
| Block an outside sender | Disconnect the Slack Connect channel or organisation | Add the domain to the external access block list, or allow-list only partner domains |
| Remove a message | Delete it (admins can delete any message) | Purview: search for and delete the message |

**Read:** for Teams, the strongest fix for help desk phishing is external access set to an allow list of partner domains, and chat with unmanaged personal accounts turned off.

## Queries

### External tenants starting chats (Defender Advanced Hunting)

```kql
CloudAppEvents
| where Timestamp > ago(7d)
| where Application == "Microsoft Teams" and ActionType == "ChatCreated"
| extend Raw = parse_json(RawEventData)
| where tostring(Raw.ParticipantInfo.HasForeignTenantUsers) == "true"
| where tostring(Raw.CommunicationType) == "OneOnOne"
| project Timestamp, AccountDisplayName, Members = Raw.Members, ChatThreadId = tostring(Raw.ChatThreadId)
```

### Members, guests and apps added to teams (Sentinel)

```kql
OfficeActivity
| where TimeGenerated > ago(7d)
| where OfficeWorkload == "MicrosoftTeams"
| where Operation in ("MemberAdded", "MemberRoleChanged", "AppInstalled", "BotAddedToTeam")
| project TimeGenerated, UserId, Operation, TeamName, Members, AddOnName
```

### Slack sign-ins from new countries (Splunk, Slack audit logs)

```spl
index=slack action=user_login
| iplocation context.ip_address
| stats earliest(_time) as first_seen, values(Country) as countries by actor.user.email, Country
| where first_seen > relative_time(now(), "-1d")
```

### Slack anomaly events (Splunk)

```spl
index=slack action=anomaly
| table _time, actor.user.email, details.reason{}, context.ip_address, context.ua
```

**Tune:** Slack field names depend on how the audit logs are ingested; Teams fields in `OfficeActivity` may sit in `RawEventData` or their own columns depending on the connector version. Check one event first.
