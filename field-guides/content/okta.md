# Okta

Visual reference for Okta on cases: how sign-in and SSO work, what the policies and factors are, how to read the System Log, and what account takeover, MFA fatigue and session hijacking look like. Users, IPs and IDs below are placeholders.

## The mental model

Okta is the front door. A user authenticates once to Okta (password plus factors, as policy demands), gets an Okta session, and Okta vouches for them to every app over SAML or OIDC.

```flow
User[user] --password + MFA--> Okta[security] --session--> SSO[security] --SAML / OIDC--> Apps[app]
Okta[security] --events--> System Log[mgmt] --> SIEM[external]
```

```terms
Org :: Your Okta tenant: `acme.okta.com`, plus an admin console at `acme-admin.okta.com`.
Okta session :: Created at sign-in, held in a browser cookie. Steal the cookie and you skip the password and MFA.
Authenticator / factor :: Okta Verify (push, number challenge, FastPass), FIDO2 / WebAuthn, phone, email, password.
FastPass :: Passwordless, device-bound, phishing-resistant sign-in through Okta Verify.
Global session policy :: Rules for creating the Okta session: which factors, how long it lasts.
Authentication policy :: Per-app rules: who can reach the app, from where, with which assurance.
Network zone :: Named IP ranges, ASNs or countries used in policies (allow, deny, "requires MFA").
ThreatInsight :: Okta's IP reputation: flags or blocks credential-stuffing sources.
Super Administrator :: Full control of the org. Treat every grant as an incident until proven otherwise.
API token :: `SSWS` token acting as the admin who created it. Long-lived.
```

### Where Okta sits

```layers
People and sources :: Staff[user]{laptop}, Contractors[user]{user}, Admins[user]{key}, Active Directory[compute]{server}, HR system[app]{app}
Identity :: Okta[security]{shield}
Apps :: Microsoft 365[external]{cloud}, AWS[external]{cloud}, Salesforce[external]{cloud}, VPN[network]{lock}
Active Directory -> Okta: AD agent
HR system -> Okta: provisioning
Staff -> Okta: sign in
Contractors -> Okta: sign in
Admins -> Okta: admin console
Okta -> Microsoft 365: SAML / OIDC
Okta -> AWS: SAML
Okta -> Salesforce: SAML
Okta -> VPN: RADIUS / SAML
```

**Read:** compromise Okta and you reach every app below it. That's why admin roles, API tokens and factor changes are the events to watch.

## Sign-in and SSO

### SP-initiated SAML

```sequence
User[user] -> App[app]: Open the app
App --> User: Redirect with a SAML AuthnRequest
User -> Okta[security]: AuthnRequest (and sign in if there's no session)
Okta -> Okta: Check policies, factors, network zone
Okta --> User: Signed SAML assertion
User -> App: POST the assertion
App --> User: App session
note: Okta logs user.authentication.sso with the app as the target
```

### OIDC authorisation code

```sequence
App[app] --> User[user]: Redirect to /oauth2/v1/authorize
User -> Okta[security]: Sign in, consent
Okta --> User: Redirect back with a code
User -> App: The code
App -> Okta: Exchange the code at /token (with the client secret)
Okta --> App: ID token, access token, refresh token
```

## System Log

### Event type anatomy

```anatomy
user :: category: user, system, group, application, policy, security…
.
authentication :: object
.
auth_via_mfa :: action
```

### Event record fields

| Field | Use |
| --- | --- |
| `eventType` | What happened |
| `actor.alternateId` / `actor.type` | Who did it: a user's login, or an app or API token |
| `target[]` | Who or what it happened to (user, app, group, policy) |
| `outcome.result` / `outcome.reason` | `SUCCESS`, `FAILURE`, `DENY`, `CHALLENGE`, and why |
| `client.ipAddress`, `client.userAgent.rawUserAgent` | Where from, and what software |
| `client.geographicalContext` | City, country, coordinates |
| `securityContext.asOrg`, `.isProxy` | Hosting provider or VPN / proxy source |
| `authenticationContext.externalSessionId` | The Okta session ID: pivot on it to follow one session |
| `debugContext.debugData` | Risk level, behaviours ("New Geo-Location"), request URI |

**Read:** `externalSessionId` is the most useful pivot. One session ID with two IPs, two ASNs or two user agents is session hijacking until proven otherwise.

### Search syntax

```text
eventType eq "user.session.start" and outcome.result eq "FAILURE"
```

```text
actor.alternateId eq "j.smith@example.com" and client.ipAddress eq "203.0.113.45"
```

```text
eventType sw "user.mfa" and target.alternateId eq "j.smith@example.com"
```

## Event types to know

| eventType | Means |
| --- | --- |
| `user.session.start` | Okta session created (sign-in) |
| `user.authentication.auth_via_mfa` | A factor was used |
| `user.authentication.sso` | SSO into an app |
| `system.push.send_factor_verify_push` | An Okta Verify push was sent |
| `user.mfa.okta_verify.deny_push` | The user rejected a push |
| `user.mfa.factor.activate` / `.deactivate` | Factor enrolled or removed: check who did it |
| `user.account.reset_password` / `update_password` | Password changed |
| `user.account.privilege.grant` | Admin role granted |
| `group.user_membership.add` | User added to a group (often an app or admin group) |
| `system.api_token.create` | New API token |
| `policy.rule.update`, `policy.lifecycle.update` | Sign-in policy weakened |
| `zone.update` | Network zone changed (an attacker IP allowed) |
| `application.lifecycle.create` | New app, perhaps a rogue IdP or app |
| `user.session.impersonation.initiate` | Okta support impersonating an admin |
| `security.threat.detected` | ThreatInsight flagged the source |

## Attack patterns

### MFA fatigue

```sequence
Attacker[external] -> Okta[security]: Valid password, sign in
Okta -> User[user]: Push
User --> Okta: Deny
Attacker -> Okta: Retry, again and again
Okta -> User: Push, push, push
User --> Okta: Approve (worn down)
Okta --> Attacker: Session
note: Number challenge or FastPass stops this
```

**Read:** many `system.push.send_factor_verify_push` events and `deny_push`, then a `user.session.start` SUCCESS from a new IP.

### Session hijacking

```flow
Phishing proxy[external] --steals cookie--> Attacker browser[external] --replays session--> Okta[security] --SSO--> Apps[app]
```

**Read:** the stolen session's `externalSessionId` shows up from a new IP, ASN or user agent, often with no new `user.session.start` (no password or MFA needed).

### Admin takeover

| Order | Event | Means |
| --- | --- | --- |
| 1 | `user.session.start` from an unusual source | Admin account used |
| 2 | `user.mfa.factor.deactivate` / `.activate` | Their factors swapped for the attacker's |
| 3 | `user.account.privilege.grant` | Super Admin given to another account |
| 4 | `application.lifecycle.create` (identity provider) | Rogue IdP added for persistent access |
| 5 | `system.api_token.create` | API persistence |

## Containment

| Action | How |
| --- | --- |
| End every session for a user | Admin console › user › Clear user sessions, or `DELETE /api/v1/users/{id}/sessions` |
| Stop sign-ins | Suspend the user (keeps data, unlike deactivate) |
| Remove attacker factors | Reset factors and re-enrol with the user in person |
| Kill an API token | Security › API › Tokens › Revoke |
| Block a source | Network zone with the IPs or ASN, plus a deny rule in policy |

```bash
curl -s -X DELETE "https://acme.okta.com/api/v1/users/00u1abcd2EFGHIJ3k4l5/sessions?oauthTokens=true" -H "Authorization: SSWS ${OKTA_API_TOKEN}"
```

**Tune:** `oauthTokens=true` also revokes the OAuth tokens issued to apps, so they stop working too.

## Hunting in SecOps

### MFA pushes per user

```udm
metadata.log_type = "OKTA"
metadata.product_event_type = "system.push.send_factor_verify_push"
$user = target.user.email_addresses
match:
  $user
outcome:
  $pushes = count(metadata.id)
order:
  $pushes desc
```

### Admin role grants

```udm
metadata.log_type = "OKTA"
metadata.product_event_type = "user.account.privilege.grant"
```

**Tune:** user fields map differently per event type in the Okta parser. Check one event first.
