# Microsoft Graph

Visual reference for Microsoft Graph on cases: what it is, how apps get tokens, delegated versus application permissions, consent, which permissions are dangerous, the calls responders use, and the logs that show Graph abuse. Tenant, app and user IDs below are placeholders.

## The mental model

Graph is one API (`graph.microsoft.com`) in front of most of Microsoft 365. Anything that holds a Graph token with the right permission can read mail, files, users and logs, without ever touching Outlook or the admin portals.

```flow
App or script[app] --gets token--> Entra ID[security]{entra/entra-id} --access token--> Microsoft Graph[compute]
Microsoft Graph[compute] --> Exchange / SharePoint / Teams / Entra / Intune[storage]
```

```terms
App registration :: The app's definition in its home tenant: client ID (`appId`), redirect URIs, secrets and certificates.
Enterprise application / service principal :: The app's instance in a tenant: what gets consented and signs in.
Delegated permission :: The app acts **as a signed-in user**, limited to what that user can reach. Appears as `scp` in the token.
Application permission :: The app acts **as itself**, with no user, across the whole tenant. Appears as `roles`.
Consent :: A user or admin agreeing to give an app permissions. Admin consent covers the whole tenant.
Client secret / certificate :: The app's credentials. Whoever holds them can get tokens as the app.
Scope :: A permission name: `Mail.Read`, `Files.Read.All`, `User.Read`.
`.default` :: "All permissions already granted to this app": how app-only tokens are requested.
```

### What sits behind Graph

```layers
Callers :: Admin scripts[app]{function}, Line-of-business apps[app]{azure/app-registration}, Attacker's app[external]{alert}
API :: Microsoft Graph[compute]{globe}
Services :: Exchange Online[storage]{mail}, SharePoint and OneDrive[storage]{db}, Entra ID[security]{entra/entra-id}, Teams[app]{app}, Intune[mgmt]{azure/intune}
Admin scripts -> Microsoft Graph: app-only
Line-of-business apps -> Microsoft Graph: delegated
Attacker's app -> Microsoft Graph: consented token
Microsoft Graph -> Exchange Online
Microsoft Graph -> SharePoint and OneDrive
Microsoft Graph -> Entra ID
Microsoft Graph -> Teams
Microsoft Graph -> Intune
```

## How apps get a token

### Delegated (auth code)

```sequence
User[user] -> App[app]: Sign in
App --> User: Redirect to login.microsoftonline.com
User -> Entra ID[security]{entra/entra-id}: Authenticate, consent to scopes
Entra ID --> App: Auth code, exchanged for access and refresh tokens
App -> Graph[compute]: GET /me/messages (Bearer token, scp=Mail.Read)
note: The refresh token keeps access after the password changes, until sessions are revoked
```

### Application (client credentials)

```sequence
App[app] -> Entra ID[security]{entra/entra-id}: Client ID + secret or certificate, scope .default
Entra ID --> App: Access token (roles=Mail.Read)
App -> Graph[compute]: GET /users/{id}/messages for any mailbox
note: No user and no MFA: the secret is everything
```

## Tokens and URLs

### Graph token claims

| Claim | Means |
| --- | --- |
| `aud` | `https://graph.microsoft.com` (or `00000003-0000-0000-c000-000000000000`) |
| `tid` | Tenant ID |
| `appid` | Client ID of the app that got the token |
| `oid` / `upn` | The user (delegated) or the service principal (app-only) |
| `scp` | Delegated scopes, space-separated |
| `roles` | Application permissions |
| `amr` | Authentication methods (delegated only) |
| `exp` | Expiry: usually 60–90 minutes |

**Read:** `scp` means delegated, `roles` means app-only. That one claim tells you whether to chase a user or an app.

### Graph URL anatomy

```anatomy
https://graph.microsoft.com :: endpoint
/
v1.0 :: version: v1.0, or beta (preview)
/users/j.smith@example.com :: resource
/mailFolders/inbox/messageRules :: navigation path
?$select=displayName,actions :: OData query options
```

## Dangerous permissions

| Permission (application) | Lets the app |
| --- | --- |
| `Mail.Read` / `Mail.ReadWrite` | Read or change every mailbox |
| `Mail.Send` | Send as anyone |
| `Files.Read.All` / `Sites.Read.All` | Read every OneDrive and SharePoint file |
| `User.ReadWrite.All`, `Directory.ReadWrite.All` | Change users and the directory |
| `Application.ReadWrite.All` | Add secrets to **any** app, including more privileged ones |
| `AppRoleAssignment.ReadWrite.All` | Grant itself any application permission |
| `RoleManagement.ReadWrite.Directory` | Make anyone a Global Administrator |

**Read:** the last three are tenant takeover. Any app holding one needs an owner, a reason and monitoring.

## Attack patterns

### Illicit consent grant

```sequence
Attacker[external] --> User[user]: Phishing link to a real Microsoft consent page
User -> Entra ID[security]{entra/entra-id}: Accept "Mail.Read, offline_access" for an attacker's app
Entra ID --> Attacker: Tokens for the user's mailbox
Attacker -> Graph[compute]: Read mail, create rules, for as long as the refresh token lives
note: No password stolen, so password resets don't help. Remove the grant
```

### Backdooring an app

```flow
Compromised admin[user] --Add credentials--> Existing privileged app[app]{azure/app-registration} --client credentials--> Graph[compute] --> Every mailbox[storage]
```

**Watch for:** Entra audit "Update application – Certificates and secrets management" or "Add service principal credentials" on an app nobody touched in months.

## Responder calls

### A user's inbox rules (BEC)

```http
GET https://graph.microsoft.com/v1.0/users/j.smith@example.com/mailFolders/inbox/messageRules
```

### A user's MFA methods

```http
GET https://graph.microsoft.com/v1.0/users/j.smith@example.com/authentication/methods
```

### Recent sign-ins for a user

```http
GET https://graph.microsoft.com/v1.0/auditLogs/signIns?$filter=userPrincipalName eq 'j.smith@example.com'&$top=50
```

### Delegated grants an app holds

```http
GET https://graph.microsoft.com/v1.0/oauth2PermissionGrants?$filter=clientId eq '11111111-2222-3333-4444-555555555555'
```

### Application permissions an app holds

```http
GET https://graph.microsoft.com/v1.0/servicePrincipals/11111111-2222-3333-4444-555555555555/appRoleAssignments
```

### An app's secrets and certificates

```http
GET https://graph.microsoft.com/v1.0/applications(appId='66666666-7777-8888-9999-000000000000')?$select=displayName,passwordCredentials,keyCredentials
```

### Revoke a user's sessions and refresh tokens

```http
POST https://graph.microsoft.com/v1.0/users/j.smith@example.com/revokeSignInSessions
```

**Tune:** these need read permissions (`AuditLog.Read.All`, `Application.Read.All`, `MailboxSettings.Read`) on your own responder app, or run them from Graph Explorer as an admin.

## Logs that show Graph use

```flow
Graph request[app] --> MicrosoftGraphActivityLogs[mgmt] --> Log Analytics / Sentinel[data]{azure/sentinel}
Consent and app changes[user] --> Entra audit logs[security]{entra/entra-id}
Mailbox access[storage] --> Unified audit log[mgmt]
```

| Question | Log |
| --- | --- |
| Which app called which Graph URL, from where? | `MicrosoftGraphActivityLogs` (diagnostic setting needed) |
| Who consented to what? | Entra audit: "Consent to application" |
| Who added a secret or permission to an app? | Entra audit: "Add service principal credentials", "Add app role assignment to service principal" |
| Which app read which mail? | Unified audit log `MailItemsAccessed` (`ClientAppId`) |
| Which app signed in? | Entra service principal sign-in logs |

### KQL: apps reading mail through Graph

```kql
MicrosoftGraphActivityLogs
| where TimeGenerated > ago(7d)
| where RequestUri has "/messages" or RequestUri has "/mailFolders"
| summarize Calls = count(), Users = dcount(UserId), Ips = make_set(IPAddress, 10) by AppId
| order by Calls desc
```

### KQL: consent grants

```kql
AuditLogs
| where OperationName == "Consent to application"
| extend Actor = tostring(InitiatedBy.user.userPrincipalName), App = tostring(TargetResources[0].displayName)
| project TimeGenerated, Actor, App, Result
```

## Containment

| Situation | Do |
| --- | --- |
| Malicious consent | Remove the `oauth2PermissionGrant`, disable the service principal, then revoke the user's sessions |
| Backdoored app | Remove the added credentials, rotate the rest, review its permissions |
| Stolen user tokens | `revokeSignInSessions`, then reset password and MFA |
| Risky permission held by an unused app | Remove the app role assignment, or delete the app |

**Tune:** stop users granting consent to unverified publishers (Entra › Enterprise apps › Consent and permissions).
