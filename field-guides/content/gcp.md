# GCP cloud infrastructure

Visual reference for Google Cloud terms and mechanics on cases: the resource hierarchy, who a principal really is, service accounts and impersonation, Cloud Storage signed URLs, serverless, and the audit logs. Every project, account and key below is a placeholder.

## The mental model

Access is granted by IAM bindings (principal + role) on a resource, and they inherit **down** the hierarchy. A role granted on a folder applies to every project in it.

```flow
Organization[mgmt] --contains--> Folder[mgmt] --contains--> Project[mgmt] --contains--> Resource[compute]
```

```terms
Organization :: The root node, tied to a Workspace or Cloud Identity domain. Org policies set guardrails here.
Folder :: Groups projects (by team or environment). Bindings here reach every project below.
Project :: The unit of billing, APIs and IAM. Has a **project ID** (`acme-prod`) and a **project number** (`123456789012`).
Principal :: Who: `user:`, `group:`, `serviceAccount:`, `domain:`, or the public `allUsers` / `allAuthenticatedUsers`.
Role :: A bundle of permissions. Basic (`roles/owner`, `roles/editor`, `roles/viewer`), predefined, or custom.
Binding :: One principal plus one role on one resource. A resource's IAM policy is a list of bindings.
Service account :: A non-human identity, written as an email. Workloads run as one.
Service account key :: A long-lived JSON private key for a service account. The GCP equivalent of a leaked AWS `AKIA` key.
Workload Identity Federation :: Lets external identities (AWS, GitHub Actions, Entra) get short-lived GCP tokens with no keys.
Org policy :: Constraints such as "no service account keys" or "no public buckets", inherited down the tree.
```

## Identifiers

### Service account email

```anatomy
deploy-bot :: account name
@
acme-prod :: project ID
.iam.gserviceaccount.com :: user-managed service account
```

| Pattern | What it is |
| --- | --- |
| `name@PROJECT_ID.iam.gserviceaccount.com` | Service account you created |
| `PROJECT_NUMBER-compute@developer.gserviceaccount.com` | Default Compute Engine account. Often has Editor |
| `PROJECT_ID@appspot.gserviceaccount.com` | Default App Engine / Cloud Functions (1st gen) account |
| `service-PROJECT_NUMBER@…gserviceaccount.com` | Google-managed service agent. Google runs it, not you |

### Credential prefixes

| Looks like | What it is | Lifetime |
| --- | --- | --- |
| `ya29.…` | OAuth 2.0 access token | About 1 h |
| `1//…` | OAuth refresh token | Until revoked |
| JSON with `"type": "service_account"` and `private_key` | Service account key file | Until deleted (or 10 years) |
| `AIza…` | API key: identifies a project, not a user | Until deleted |

## Service accounts and impersonation

### How impersonation works

```sequence
Caller[user] -> IAM Credentials API[security]: generateAccessToken(target service account)
IAM Credentials API -> IAM[security]: Does the caller have Token Creator on it?
IAM --> IAM Credentials API: Allow
IAM Credentials API --> Caller: ya29 access token for the service account
Caller -> Google API[compute]: Call as the service account
note: Audit logs name the service account, and the real caller in the delegation info
```

```terms
`roles/iam.serviceAccountTokenCreator` :: Lets a principal mint tokens as a service account. Holding it is as good as being that account.
`roles/iam.serviceAccountUser` :: Lets a principal attach a service account to a VM or function. That workload then acts as the account.
`roles/iam.serviceAccountKeyAdmin` :: Lets a principal create keys: long-lived persistence.
Delegation chain :: `serviceAccountDelegationInfo` in the audit log lists who impersonated whom.
```

### Who really did it?

| Audit log field | Means |
| --- | --- |
| `protoPayload.authenticationInfo.principalEmail` | The identity the call ran as |
| `…serviceAccountDelegationInfo[].firstPartyPrincipal.principalEmail` | The original caller behind an impersonation |
| `protoPayload.requestMetadata.callerIp` | Source IP, or `private` / a Google service |
| `protoPayload.requestMetadata.callerSuppliedUserAgent` | `gcloud`, SDK, Terraform, browser |
| `protoPayload.serviceName` / `methodName` | API and action: `iam.googleapis.com` / `google.iam.admin.v1.CreateServiceAccountKey` |
| `protoPayload.resourceName` | What it acted on |
| `protoPayload.status.code` | Non-zero means it failed (7 is permission denied) |

## Cloud Storage

```terms
Bucket :: Global container: `gs://acme-exports`. Name is unique across all of GCP.
Object :: A file in a bucket. "Folders" are name prefixes.
Uniform bucket-level access :: IAM only, no per-object ACLs. The recommended setting.
Public access prevention :: Blocks `allUsers` / `allAuthenticatedUsers` grants, even by an owner.
Signed URL :: Time-limited access to one object for anyone holding the link, signed with a service account key.
Data Access logs :: Object reads and writes. **Off by default** for Cloud Storage: turn them on before you need them.
```

### How a signed URL works

```sequence
Signer[user] -> Signer: Sign with a service account key (or the signBlob API)
Signer --> Recipient[external]: URL with X-Goog-Credential and Signature
Recipient -> Cloud Storage[storage]{gcp/cloud-storage}: GET the URL
Cloud Storage -> IAM[security]: Can the service account read it now?
IAM --> Cloud Storage: Allow
Cloud Storage --> Recipient: The object
```

### Signed URL anatomy (V4)

```anatomy
https://storage.googleapis.com/acme-exports/q3/payroll.csv :: bucket and object
?X-Goog-Algorithm=GOOG4-RSA-SHA256 :: signature type
&X-Goog-Credential=deploy-bot@acme-prod.iam.gserviceaccount.com/20261025/auto/storage/goog4_request :: signing service account, date
&X-Goog-Date=20261025T101500Z :: signed at
&X-Goog-Expires=604800 :: seconds valid (max 7 days)
&X-Goog-SignedHeaders=host :: headers covered
&X-Goog-Signature=8a1f… :: RSA signature
```

**Read:** to kill signed URLs, disable or delete the signing key, or remove the service account's access to the bucket.

## Serverless and compute

```flow
HTTP request[app] --invokes--> Cloud Run / Functions[compute]{gcp/cloud-run} --runs as--> Service account[security]{key}
Pub/Sub or schedule[app] --event--> Cloud Run / Functions[compute]{gcp/cloud-run} --stdout--> Cloud Logging[mgmt]
```

```terms
Cloud Functions / Cloud Run :: Serverless code and containers. 2nd-gen functions run on Cloud Run.
Invoker binding :: `roles/run.invoker` or `roles/cloudfunctions.invoker`. Granted to `allUsers`, the endpoint is public.
Runtime service account :: The identity the code runs as. Its tokens come from the metadata server.
Environment variables :: Config, and too often secrets. Prefer Secret Manager.
Startup script / metadata :: Instance metadata can hold startup scripts and SSH keys. Changing it is persistence.
OS Login / project-wide SSH keys :: How SSH keys reach VMs. `setCommonInstanceMetadata` adds keys to every VM in the project.
```

### Metadata server: getting a token

```sequence
Process[compute]{gcp/compute-engine} -> Metadata server[security]: GET …/service-accounts/default/token (Metadata-Flavor: Google)
Metadata server --> Process: ya29 access token
note: The required Metadata-Flavor header blocks most simple SSRF
```

**Read:** the metadata server lives at `metadata.google.internal` (`169.254.169.254`).

## Logging map

```flow
API call[user] --> Cloud Audit Logs[mgmt] --sink--> BigQuery / Storage / SIEM[data]
VPC Flow Logs[network] --> Security Command Center[security]{gcp/security-command-center}
```

| Log | What | On by default |
| --- | --- | --- |
| Admin Activity | Config changes (`SetIamPolicy`, create, delete) | Yes, kept 400 days |
| Data Access | Reads, and object/data access | No (except BigQuery) |
| System Event | Google-initiated changes | Yes |
| Policy Denied | Calls blocked by VPC Service Controls | Yes |
| VPC Flow Logs | Network flows | Per subnet |
| Cloud DNS logs | Queries from VPCs | Per policy |
| SCC findings | Detections | With Security Command Center |

### Default retention

```bars
Admin Activity :: 400 :: days
System Event :: 400 :: days
Data Access :: 30 :: days
Policy Denied :: 30 :: days
```

**Read:** export with a log sink to keep anything longer. Without one, Data Access logs are gone after a month.

**Watch for:** `logName` ends in `cloudaudit.googleapis.com%2Factivity` or `%2Fdata_access`.

## High-signal methods

| methodName | Why |
| --- | --- |
| `SetIamPolicy` (any service) | Who gained what. Diff `bindingDeltas` |
| `google.iam.admin.v1.CreateServiceAccountKey` | Long-lived persistence |
| `GenerateAccessToken`, `SignBlob` (`iamcredentials`) | Impersonation (Data Access log) |
| `google.iam.admin.v1.CreateServiceAccount` | New identity |
| `v1.compute.projects.setCommonInstanceMetadata` | SSH keys or startup scripts on every VM |
| `v1.compute.instances.setMetadata` | Same, one VM |
| `google.logging.v2.ConfigServiceV2.DeleteSink` / `UpdateSink` | Log export cut or redirected |
| `storage.setIamPermissions` with `allUsers` | Bucket made public |
| `google.cloud.functions.v1.CloudFunctionsService.UpdateFunction` | Code or service account changed |
| `SetOrgPolicy` | Guardrail removed |

## Containment

### Disable a leaked service account key

```bash
gcloud iam service-accounts keys disable KEY_ID --iam-account=deploy-bot@acme-prod.iam.gserviceaccount.com
```

### Disable the service account entirely

```bash
gcloud iam service-accounts disable deploy-bot@acme-prod.iam.gserviceaccount.com
```

**Tune:** disabling breaks every workload using the account. Existing `ya29` tokens can live for up to an hour.

### Remove public access from a bucket

```bash
gcloud storage buckets remove-iam-policy-binding gs://acme-exports --member=allUsers --role=roles/storage.objectViewer
gcloud storage buckets update gs://acme-exports --public-access-prevention
```

### Preserve a VM disk

```bash
gcloud compute disks snapshot web-1 --zone=europe-west2-a --snapshot-names=ir-case-1234-web-1
```

## Hunting in SecOps

### Service account keys created

```udm
metadata.log_type = "GCP_CLOUDAUDIT"
metadata.product_event_type = "google.iam.admin.v1.CreateServiceAccountKey"
```

### IAM policy changes

```udm
metadata.log_type = "GCP_CLOUDAUDIT"
metadata.product_event_type = /SetIamPolicy$/
```

**Tune:** field mappings depend on the parser version. Check one event in the UDM viewer first.
