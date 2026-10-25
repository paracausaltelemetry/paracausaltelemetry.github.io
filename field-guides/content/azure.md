# Azure cloud infrastructure

Visual reference for Azure terms and mechanics on cases: tenants and subscriptions, Entra identities and tokens, RBAC, storage keys and SAS tokens, managed identities, Functions, and the logs that show it all. Every ID, key and name below is a placeholder.

## The mental model

Two planes to keep apart: **Entra ID** decides who you are (one tenant), and **Azure RBAC** decides what you can do to resources (role assignments at a scope that inherit downwards).

```flow
Entra tenant[security]{entra/entra-id} --trusts--> Management group[mgmt]{azure/management-group} --> Subscription[mgmt]{azure/subscription} --> Resource group[mgmt]{azure/resource-group} --> Resource[compute]
```

```terms
Tenant :: One Entra ID directory: users, groups, apps. Identified by a GUID (`tid`) and a domain.
Management group :: Groups subscriptions for policy and RBAC at scale.
Subscription :: The billing and resource boundary. Most IR scoping is per subscription.
Resource group :: A folder for resources that share a lifecycle.
Control plane / data plane :: Control plane (ARM) manages resources and lands in the Activity log. Data plane (blob reads, Key Vault secret gets) needs diagnostic logs.
Azure RBAC role :: Owner, Contributor, Reader, User Access Administrator, or a custom role, assigned at a scope.
Entra role :: A directory role: Global Administrator, Privileged Role Administrator, Application Administrator. Separate from Azure RBAC.
Service principal :: An app's identity in a tenant. What actually signs in for automation.
Managed identity :: A service principal Azure manages for a resource. No secret to leak; tokens come from IMDS.
Key Vault :: Secrets, keys and certificates. Access by RBAC or vault access policy.
```

### Who talks to what

```layers
Identities :: Users[user]{azure/users}, Service principals[app]{azure/enterprise-app}, Managed identities[compute]{azure/managed-identity}
Identity plane :: Entra ID[security]{entra/entra-id}
Control plane :: Azure Resource Manager[mgmt]{app}
Data plane :: Storage[storage]{azure/storage-account}, Virtual machines[compute]{azure/virtual-machine}, Key Vault[security]{azure/key-vault}
Users -> Entra ID: sign in
Service principals -> Entra ID: secret or certificate
Managed identities -> Entra ID: IMDS token
Entra ID -> Azure Resource Manager: token
Azure Resource Manager -> Storage
Azure Resource Manager -> Virtual machines
Azure Resource Manager -> Key Vault
```

**Read:** Entra logs show the sign-in, the Activity log shows the control plane call, and only resource logs show the data plane (a blob read, a secret get).

## Identifiers

### Resource ID anatomy

```anatomy
/subscriptions/ :: scope type
1b2c3d4e-0000-0000-0000-00000000abcd :: subscription ID
/resourceGroups/ :: scope type
rg-prod :: resource group
/providers/ :: resource provider follows
Microsoft.Storage/storageAccounts :: provider and type
/ :: separator
stprod01 :: resource name
```

**Read:** the provider and type tell you what an Activity log operation touched. `Microsoft.Authorization/roleAssignments` is a permission change.

### Access token (JWT) anatomy

```anatomy
eyJ0eXAiOiJKV1Qi… :: header: algorithm, key ID
.
eyJhdWQiOiJodHRw… :: payload: the claims
.
Rk9P… :: signature
```

| Claim | Means |
| --- | --- |
| `aud` | The API the token is for (`https://management.azure.com`, Graph, a vault) |
| `iss` | Issuer, containing the tenant ID |
| `tid` / `oid` | Tenant ID / object ID of the user or service principal |
| `upn` / `appid` | User principal name / app (client) ID used to sign in |
| `scp` / `roles` | Delegated scopes / application roles |
| `amr` | How they authenticated: `pwd`, `mfa`, `rsa`… |
| `iat` / `exp` | Issued / expires (Unix seconds, usually 60–90 min apart) |

**Read:** decode a token locally (it's base64url), never with an online decoder.

## Storage accounts

```terms
Storage account :: One namespace for blobs, files, queues and tables: `stprod01.blob.core.windows.net`.
Account keys :: Two keys (`key1`, `key2`) with **full** access to everything. `listKeys` hands them out.
SAS :: Shared access signature. A signed URL token granting limited rights until an expiry.
Account / service SAS :: Signed with an account key. Revoke by rotating that key.
User delegation SAS :: Signed with Entra credentials. Revoke by revoking user delegation keys.
Stored access policy :: A named policy a service SAS can point at. Deleting it kills those SAS tokens.
Anonymous access :: Containers can allow public reads unless the account disallows blob public access.
```

### SAS token anatomy

```anatomy
https://stprod01.blob.core.windows.net/exports/q3.csv :: account, container, blob
?sv=2022-11-02 :: storage service version
&ss=b :: services: b blob, f file, q queue, t table
&srt=sco :: resource types: service, container, object
&sp=rwdlac :: permissions: read, write, delete, list, add, create
&st=2026-10-25T09:00:00Z :: valid from
&se=2027-10-25T09:00:00Z :: expiry (a year is a red flag)
&spr=https :: protocol
&sig=Xk3e… :: HMAC signature
```

**Read:** `ss` and `srt` mean an account SAS (signed with a key). `skoid` / `sktid` fields mean a user delegation SAS.

## Managed identities and IMDS

```sequence
Process[compute]{azure/virtual-machine} -> IMDS[security]: GET /metadata/identity/oauth2/token?resource=… (Metadata: true)
IMDS -> Entra ID[security]{entra/entra-id}: Token for this VM's managed identity
Entra ID --> IMDS: Access token
IMDS --> Process: Access token (JWT)
Process -> Azure API[storage]{azure/storage-account}: Call with Bearer token
note: Anything running on the VM can do this, including an attacker
```

```terms
System-assigned :: Tied to one resource and deleted with it.
User-assigned :: A standalone identity attached to several resources.
IMDS :: `169.254.169.254`. Needs the `Metadata: true` header, which blocks simple SSRF.
Sign-in logs :: Managed identity sign-ins have their own Entra log category.
```

## Functions and automation

```flow
HTTP or timer[app] --invokes--> Function app[compute]{azure/function-app} --managed identity--> Key Vault / Storage[storage]{azure/storage-account}
Queue or blob event[app] --triggers--> Function app[compute]{azure/function-app} --telemetry--> Application Insights[mgmt]{azure/monitor}
```

```terms
Function key :: `?code=` in the URL. `authLevel` decides whether a key is needed: anonymous, function or admin.
Host / master key :: Works for every function in the app. The master key also reaches the admin API.
App settings :: Environment variables, often with connection strings and secrets.
Kudu / SCM site :: `<app>.scm.azurewebsites.net`: a deployment console with file access and a shell.
Automation runbook :: Scheduled PowerShell or Python running as an identity. Classic persistence.
VM Run Command / extensions :: Run a script on a VM as SYSTEM or root, straight from the control plane.
```

## Logging map

```flow
ARM operations[user] --> Activity log[mgmt]{azure/activity-log} --diagnostic setting--> Log Analytics / Event Hub[data]{azure/log-analytics}
Sign-ins[user] --> Entra logs[security]{entra/entra-id} --> Sentinel / SIEM[external]{azure/sentinel}
```

```bars
Activity log :: 90 :: days
Entra sign-in and audit (P1 / P2) :: 30 :: days
Entra sign-in and audit (free) :: 7 :: days
```

| Question | Log |
| --- | --- |
| Who changed a resource or role assignment? | Activity log (90 days in the portal) |
| Who signed in, from where, with MFA? | Entra sign-in logs (interactive, non-interactive, service principal, managed identity) |
| Who changed users, groups, apps or consents? | Entra audit logs |
| Who read a blob or a secret? | Resource logs: `StorageBlobLogs`, Key Vault `AuditEvent` (diagnostic settings needed) |
| What did Defender see? | Defender for Cloud alerts |

| Activity log field | Use |
| --- | --- |
| `operationName` | `Microsoft.Storage/storageAccounts/listKeys/action` |
| `caller` | UPN or the object ID of a service principal |
| `callerIpAddress` | Source IP |
| `resourceId` | What was touched |
| `status` | Started, Succeeded, Failed |
| `claims` | Token details: `appid`, `amr`, `ipaddr` |

## High-signal operations

| Operation | Why |
| --- | --- |
| `Microsoft.Authorization/roleAssignments/write` | Privilege granted. Check role and scope |
| `Microsoft.Storage/storageAccounts/listKeys/action` | Full storage access handed out |
| `Microsoft.Compute/virtualMachines/runCommand/action` | Code run on a VM |
| `Microsoft.Compute/virtualMachines/extensions/write` | Custom Script Extension: code run on a VM |
| `Microsoft.Compute/disks/beginGetAccess/action` | Disk exported with a SAS URL: data theft |
| `Microsoft.Web/sites/config/list/action` | App settings and publishing credentials read |
| `Microsoft.Automation/automationAccounts/runbooks/write` | Persistence |
| `Microsoft.Insights/diagnosticSettings/delete` | Logging cut |
| `Microsoft.KeyVault/vaults/accessPolicies/write` | Vault access granted |
| Entra: "Add service principal credentials" | Backdoor secret on an app |
| Entra: "Add member to role" | Directory role granted |
| Entra: "Consent to application" | OAuth app given access to data |

## Containment

### Remove a role assignment

```bash
az role assignment delete --assignee 00000000-0000-0000-0000-00000000beef --role Owner --scope /subscriptions/1b2c3d4e-0000-0000-0000-00000000abcd
```

### Rotate storage account keys (kills account and service SAS)

```bash
az storage account keys renew --account-name stprod01 --resource-group rg-prod --key key1
az storage account keys renew --account-name stprod01 --resource-group rg-prod --key key2
```

### Revoke a user's sessions and refresh tokens

```bash
az rest --method POST --url https://graph.microsoft.com/v1.0/users/j.smith@example.com/revokeSignInSessions
```

### Preserve a VM disk

```bash
az snapshot create --resource-group rg-ir --name ir-1234-vm1-os --source /subscriptions/…/disks/vm1-osdisk
```

**Tune:** take the snapshot before you stop or isolate the VM. Isolate with an NSG that denies all traffic.

## Hunting in SecOps

### Role assignments

```udm
metadata.log_type = "AZURE_ACTIVITY"
metadata.product_event_type = /roleAssignments\/write/ nocase
```

### Storage keys listed

```udm
metadata.log_type = "AZURE_ACTIVITY"
metadata.product_event_type = /listKeys\/action/ nocase
```

**Tune:** check the log type and field mapping for your Azure feed in the UDM viewer first.
