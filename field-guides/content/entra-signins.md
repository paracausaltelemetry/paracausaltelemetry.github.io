# Entra ID sign-in logs

Visual reference for Microsoft Entra ID sign-in logs on cases: the four sign-in log types, the fields that matter, error codes and which "failures" are normal interrupts, Conditional Access results, tokens and sessions, and how adversary-in-the-middle phishing, token theft, device code phishing, password spray and MFA fatigue show up. Users, IPs and IDs below are placeholders. For what an attacker did after signing in, see the [Microsoft 365 unified audit log field guide](/field-guides/m365-audit/).

## The mental model

Every token Entra issues is a sign-in event. A person typing a password is an **interactive** sign-in; an app quietly refreshing a token is **non-interactive**, and those are usually far more numerous. Apps signing in as themselves are **service principal** sign-ins.

```layers
Who signs in :: User[user]{user}, Apps and services[app]{entra/workload-id}, Azure resources[compute]{azure/managed-identity}
Entra ID :: Authentication and MFA[security]{entra/entra-id}, Conditional Access[security]{lock}, Identity Protection[security]{azure/entra-id-protection}
Sign-in logs :: Interactive[data]{log}, Non-interactive[data]{log}, Service principal[data]{log}, Managed identity[data]{log}
User -> Authentication and MFA
Apps and services -> Authentication and MFA
Azure resources -> Authentication and MFA
Authentication and MFA -> Conditional Access
Conditional Access -> Identity Protection: risk
Authentication and MFA -> Interactive
Authentication and MFA -> Non-interactive: token refresh
Authentication and MFA -> Service principal
Authentication and MFA -> Managed identity
```

| Log | Sentinel table | Holds |
| --- | --- | --- |
| Interactive user sign-ins | `SigninLogs` | A user entered something: password, MFA, passkey |
| Non-interactive user sign-ins | `AADNonInteractiveUserSignInLogs` | Token refreshes and SSO done by a client for the user |
| Service principal sign-ins | `AADServicePrincipalSignInLogs` | Apps signing in with their own secret or certificate |
| Managed identity sign-ins | `AADManagedIdentitySignInLogs` | Azure resources signing in with a managed identity |

### How long they last

```bars
Entra admin center (P1 / P2) :: 30 :: days
Entra admin center (free) :: 7 :: days
Sentinel / Log Analytics :: 90 :: days
```

**Read:** export sign-in logs to Log Analytics, a storage account or a SIEM as soon as a tenant is onboarded. 30 days is often less than an incident needs. Sentinel's retention is whatever the workspace is set to; 90 days is included.

## The fields that matter

| Field | Use |
| --- | --- |
| `UserPrincipalName`, `UserId` | Who |
| `AppDisplayName`, `AppId` | Which app asked for the token (Outlook, OfficeHome, Azure CLI…) |
| `ResourceDisplayName` | What the token is for (Exchange Online, Microsoft Graph…) |
| `IPAddress`, `Location`, `AutonomousSystemNumber` | Where from. A hosting provider ASN for a normal user is a red flag |
| `UserAgent` | Browser or tool. `axios`, `python-requests` and headless browsers stand out |
| `ResultType`, `ResultDescription` | `0` is success; anything else is an error code (below) |
| `ClientAppUsed` | `Browser`, `Mobile Apps and Desktop clients`, or a legacy protocol (`IMAP4`, `POP3`, `Authenticated SMTP`, `Exchange ActiveSync`, `Other clients`) |
| `AuthenticationRequirement` | `singleFactorAuthentication` or `multiFactorAuthentication` |
| `AuthenticationDetails`, `MfaDetail` | Which methods were used, and whether MFA was satisfied by a claim in the token |
| `ConditionalAccessStatus`, `ConditionalAccessPolicies` | Overall CA result, and each policy's result |
| `DeviceDetail` | Device ID, OS, browser, `isCompliant`, `isManaged`, `trustType` |
| `RiskLevelDuringSignIn`, `RiskEventTypes_V2` | Identity Protection's view of this sign-in |
| `AuthenticationProtocol` | `deviceCode`, `ropc` and others: unusual flows used in phishing |
| `IncomingTokenType` | What was presented: `primaryRefreshToken`, `refreshToken`, `none`… |
| `SessionId` | Ties sign-ins from one session together. The same session from two places is token theft |
| `CorrelationId`, `UniqueTokenIdentifier` | Ties together the steps of one sign-in, and identifies one issued token |

## Error codes

| `ResultType` | Means | Normal? |
| --- | --- | --- |
| `0` | Success | |
| `50126` | Wrong username or password | In bulk across users: spray |
| `50034` | User doesn't exist in the tenant | In bulk: username enumeration |
| `50053` | Account locked (Smart Lockout), or sign-in from a known malicious IP | Investigate |
| `50057` | Account disabled | Disabled accounts being tried are worth a look |
| `50055` | Password expired | |
| `50074` | Strong authentication required: the user is being prompted for MFA | Interrupt, normal |
| `50076` | MFA required because of location, app or CA | Interrupt, normal |
| `50079` | User must register for MFA | Investigate if the account is old: an attacker may be about to register their own method |
| `50140` | "Stay signed in?" prompt | Interrupt, normal |
| `500121` | Strong authentication failed: MFA denied, timed out or wrong | Repeated then a success: MFA fatigue |
| `53003` | Blocked by Conditional Access | Read which policy |
| `53000` | Device doesn't meet a CA device requirement | |
| `50158` | External security challenge (a third-party MFA or CA provider) | Interrupt |
| `65001` / `90095` | App consent not granted / needs admin consent | Consent phishing attempts |
| `70043` / `70044` | Session expired by sign-in frequency / session expired | Normal |

**Read:** a stream of "failures" from one user's own devices is usually interrupts (`50074`, `50140`) and expired sessions. Filter those out before you count failures.

## Conditional Access results

```decide
start :: Sign-in after primary authentication
Any enabled policy apply to this user, app and context? :: no :: notApplied: no CA control
Did a policy's grant controls fail (block, MFA not done, device not compliant)? :: yes :: failure: blocked (53003 or 53000)
Did MFA come from a claim in an existing token? :: yes :: success: MFA satisfied by the token, no prompt
end :: success: all controls met
```

| Policy result | Means |
| --- | --- |
| `success` | The policy applied and its controls were met |
| `failure` | The policy applied and blocked the sign-in |
| `notApplied` | The policy's conditions didn't match |
| `notEnabled` | Policy is off |
| `reportOnlySuccess` / `reportOnlyFailure` / `reportOnlyNotApplied` / `reportOnlyInterrupted` | Report-only: what would have happened |

**Watch for:** a successful sign-in where every policy shows `notApplied`. Either the app or location is excluded, or there's a gap the attacker found.

## Tokens and sessions

```sequence
User[user]{laptop} -> Entra ID[security]{entra/entra-id}: Password + MFA (interactive sign-in)
Entra ID --> User: Access token (about 1 hour) + refresh token
User -> Entra ID: Refresh token, every hour (non-interactive sign-ins)
Entra ID --> User: New access token, same SessionId
note: A stolen refresh token or session cookie works from anywhere, MFA included
```

| Term | Means |
| --- | --- |
| Access token | Short-lived (around 60 to 90 minutes). Revoking sessions doesn't kill ones already issued unless the app supports continuous access evaluation |
| Refresh token | Long-lived, used to get new access tokens without the user. What token theft goes after |
| Primary refresh token (PRT) | The device-level token on Entra-joined or registered Windows, macOS and mobile devices |
| Continuous access evaluation (CAE) | Lets Exchange, SharePoint and Graph reject tokens soon after a revoke or a location change |
| Token protection | Binds sign-in tokens to the device, so a stolen one doesn't work elsewhere |

## Attacks and how they show up

### Adversary-in-the-middle phishing

```sequence
Attacker[external]{alert} -> User[user]{laptop}: Phishing link to a proxy page that looks like the Microsoft sign-in
User -> Proxy[external]{globe}: Password and MFA
Proxy -> Entra ID[security]{entra/entra-id}: Relays them: interactive sign-in from the proxy's IP, MFA satisfied
Entra ID --> Proxy: Session cookie, kept by the attacker
Attacker -> Entra ID: Uses the cookie: non-interactive sign-ins from another IP, same SessionId
note: Identity Protection may raise "Attacker in the Middle" or "Anomalous Token"
```

| Sign | Field |
| --- | --- |
| Successful MFA sign-in from a hosting provider or VPN ASN | `AutonomousSystemNumber`, `IPAddress` |
| App is OfficeHome or similar web portal, user agent unusual for this user | `AppDisplayName`, `UserAgent` |
| Same `SessionId` from two IPs or countries within minutes | `SessionId` across interactive and non-interactive logs |
| A new MFA method or inbox rule shortly after | `AuditLogs`, unified audit log |

### Other patterns

| Attack | Shows up as |
| --- | --- |
| Password spray | `50126` for many users from one IP or a small set of IPs, a few attempts each, often against legacy protocols |
| MFA fatigue | Many `500121` for one user, then a `0` |
| Device code phishing | `AuthenticationProtocol == "deviceCode"` for a user who never uses it, often from an unusual IP |
| Legacy auth abuse | `ClientAppUsed` of `IMAP4`, `POP3`, `Authenticated SMTP` or `Other clients`: no MFA possible |
| Token replay | Non-interactive sign-ins from a new IP, ASN or country with no interactive sign-in there |
| Consent phishing | `65001` / `90095`, then "Consent to application." in `AuditLogs` |
| Service principal abuse | `AADServicePrincipalSignInLogs` from new IPs, or a new credential on the app in `AuditLogs` |

## Containment

| Goal | How |
| --- | --- |
| Throw the attacker out | Revoke sessions (`Revoke-MgUserSignInSession`) and reset the password; with CAE, most services reject old tokens within minutes |
| Mark the account | "Confirm user compromised" in Identity Protection, so risk policies act on it |
| Remove their foothold | Delete MFA methods and devices they registered; remove app consents and inbox rules |
| Block the source | Named location for the IPs or ASN, with a block policy (expect them to move) |
| Stop it happening again | Phishing-resistant MFA (passkeys, Windows Hello), token protection, block legacy auth and device code flow where not needed |

## Queries

### Password spray (Sentinel)

```kql
SigninLogs
| where TimeGenerated > ago(1d)
| where ResultType == "50126"
| summarize attempts = count(), users = dcount(UserPrincipalName), apps = make_set(AppDisplayName, 5) by IPAddress, AutonomousSystemNumber
| where users > 10
| sort by users desc
```

### MFA fatigue: denials then success

```kql
SigninLogs
| where TimeGenerated > ago(1d)
| summarize denials = countif(ResultType == "500121"), successes = countif(ResultType == "0"), firstDenial = minif(TimeGenerated, ResultType == "500121"), lastSuccess = maxif(TimeGenerated, ResultType == "0") by UserPrincipalName
| where denials >= 5 and successes > 0 and lastSuccess > firstDenial
```

### One session, several IPs

```kql
union SigninLogs, AADNonInteractiveUserSignInLogs
| where TimeGenerated > ago(7d)
| where ResultType == "0" and isnotempty(SessionId)
| summarize ips = make_set(IPAddress, 10), countries = make_set(tostring(LocationDetails.countryOrRegion), 5), asns = dcount(AutonomousSystemNumber) by UserPrincipalName, SessionId
| where asns > 1
```

### Device code sign-ins

```kql
SigninLogs
| where TimeGenerated > ago(30d)
| where AuthenticationProtocol == "deviceCode"
| project TimeGenerated, UserPrincipalName, AppDisplayName, IPAddress, Location, ResultType, UserAgent
```

### Legacy authentication

```kql
SigninLogs
| where TimeGenerated > ago(7d)
| where ClientAppUsed in ("IMAP4", "POP3", "Authenticated SMTP", "Exchange ActiveSync", "Other clients", "MAPI Over HTTP", "Exchange Web Services")
| summarize attempts = count(), successes = countif(ResultType == "0") by UserPrincipalName, ClientAppUsed, IPAddress
```

### Spray in SecOps

```udm
metadata.event_type = "USER_LOGIN"
metadata.product_name = "Azure AD" nocase
security_result.action = "BLOCK"
$ip = principal.ip
match:
  $ip
outcome:
  $failures = count(metadata.id)
  $users = count_distinct(target.user.email_addresses)
order:
  $users desc
```

**Tune:** non-interactive sign-ins don't always reach SecOps or Splunk: check the feed includes them before concluding token replay didn't happen.
