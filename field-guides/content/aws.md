# AWS cloud infrastructure

Visual reference for AWS terms and mechanics you meet on cases: who is calling, with what credentials, against which service, and where it was logged. Every account ID, key, name and IP below is a placeholder.

## The mental model

Everything in AWS is an API call. An identity signs a request, IAM decides allow or deny, the service acts, and CloudTrail records it.

```flow
Identity[user] --signs request--> IAM[security]{aws/iam} --allow/deny--> Service API[compute] --records--> CloudTrail[mgmt]{aws/cloudtrail}
```

```terms
Account :: The security and billing boundary, identified by a 12-digit ID. Most IR scoping starts here.
Organization / OU :: Accounts grouped under a management account. SCPs set guardrails per OU.
Region / AZ :: A geographic region (`eu-west-2`) made of isolated Availability Zones. Most services, and their logs, are per region.
Principal :: Whoever makes the request: root, an IAM user, an assumed role, or an AWS service.
IAM user :: A long-lived identity with a password and/or access keys (`AKIA…`). The most common leaked credential.
IAM role :: An identity with no keys of its own. You assume it and get temporary credentials (`ASIA…`).
Policy :: JSON that allows or denies actions on resources. Identity-based (attached to users and roles) or resource-based (on a bucket, key or function).
SCP :: Service control policy. Caps what any principal in an account can do, root included.
STS :: Security Token Service. Issues temporary credentials when a role is assumed.
CloudTrail :: The API audit log: who called what, from where, and whether it worked.
```

### How accounts are organised

```layers
Organisation :: Management account[mgmt]{aws/organizations}, SCPs[security]{shield}
OUs :: Security OU[security]{shield}, Workloads OU[app]{app}, Sandbox OU[app]{app}
Accounts{aws/account} :: Security tooling[security]{aws/security-hub}, Log archive[storage]{log}, Production[compute]{server}, Development[compute]{server}
Management account -> Security OU
Management account -> Workloads OU
Management account -> Sandbox OU
SCPs --> Workloads OU: guardrails
Security OU -> Log archive
Security OU -> Security tooling
Workloads OU -> Production
Workloads OU -> Development
Production -> Log archive: logs
```

**Read:** an organisation trail sends every account's CloudTrail to the log archive account, where workload admins can't delete it. Ask for that account first in an investigation.

## Identifiers

### ARN anatomy: a role

```anatomy
arn :: always "arn"
:
aws :: partition (aws, aws-cn, aws-us-gov)
:
iam :: service
:
 :: region (empty: IAM is global)
:
123456789012 :: account ID
:
role/DeployRole :: resource type / name
```

### ARN anatomy: a role session (what CloudTrail shows)

```anatomy
arn:aws:
sts :: service is sts, not iam
::
123456789012 :: account
:
assumed-role :: the identity is a role session
/
DeployRole :: role that was assumed
/
alice@example.com :: session name, set by whoever assumed it
```

**Read:** the session name is the pivot. For federated users it is usually their username or email, for EC2 it is the instance ID (`i-0abc…`), and for Lambda it is the function name.

### Key and ID prefixes

| Prefix | What it is | Lifetime |
| --- | --- | --- |
| `AKIA` | Access key ID for an IAM user (or root) | Until deleted |
| `ASIA` | Temporary access key ID from STS | 15 min to 36 h |
| `AROA` | Role unique ID (shows as `principalId`) | Permanent |
| `AIDA` | IAM user unique ID | Permanent |
| `AIPA` | EC2 instance profile ID | Permanent |
| `AGPA` | Group ID | Permanent |
| `ANPA` | Managed policy ID | Permanent |

**Read:** an `ASIA` key in a log always has a session token with it, and it traces back to an `AssumeRole*` or `GetSessionToken` call.

## Identity and STS

### AssumeRole

```sequence
Caller[user] -> STS[security]{aws/sts}: AssumeRole(RoleArn, RoleSessionName)
STS -> IAM[security]{aws/iam}: Is the caller allowed? Does the role trust them?
IAM --> STS: Allow
STS --> Caller: ASIA key, secret, session token, expiry
Caller -> Service[compute]: API call signed with the temporary credentials
note: CloudTrail logs both calls, linked by the ASIA key ID
```

```terms
Trust policy :: The role's resource policy: who is allowed to assume it. Changed with `UpdateAssumeRolePolicy`, a classic backdoor.
Session duration :: 1 h by default, 15 min minimum, up to the role's maximum (12 h).
Role chaining :: Assuming a role from a role session. Capped at 1 h.
External ID :: A shared secret a third party must send to assume your role (stops the confused-deputy problem).
`AssumeRoleWithSAML` / `WithWebIdentity` :: Federation from an IdP (Okta, Entra ID) or OIDC (GitHub Actions, EKS).
`GetSessionToken` :: Temporary credentials for an IAM user, usually to add MFA. 12 h default, 36 h max.
`GetCallerIdentity` :: "Who am I?" Needs no permission and can't be denied. The first thing an attacker runs with a stolen key.
```

### How long credentials live (maximum)

```bars
GetSessionToken (IAM user) :: 36 :: hours
AssumeRole, role maximum :: 12 :: hours
AssumeRole default :: 1 :: hour
Role chaining :: 1 :: hour
```

### How AWS decides: policy evaluation

Drawn from AWS's documented evaluation order for a request inside one account. Everything starts as an implicit deny.

```decide
start :: Request arrives: denied unless something allows it
Explicit Deny in any applicable policy? :: yes :: Denied
Organizations SCP or RCP allows it? :: no :: Denied
Resource-based policy allows this principal? :: yes :: Allowed
Identity-based policy allows it? :: no :: Denied
Permissions boundary allows it? :: no :: Denied
Session policy allows it? :: no :: Denied
end :: Allowed
```

**Read:** a cross-account request needs an allow on **both** sides: the caller's identity policy and the resource's policy. Boundaries and session policies can still cap some resource-policy grants, for role sessions in particular.

### Who was it really? `userIdentity.type`

| Type | Means | Look at |
| --- | --- | --- |
| `Root` | The account root user | Should be almost never. Alert on any use |
| `IAMUser` | Long-lived user credentials | `userName`, `accessKeyId` (`AKIA`) |
| `AssumedRole` | A role session | `arn` session name, `sessionContext.sessionIssuer.arn` |
| `FederatedUser` | `GetFederationToken` session | `sessionContext.sessionIssuer` |
| `AWSService` | A service acting for you | `invokedBy` |
| `IdentityCenterUser` | IAM Identity Center (SSO) user | `onBehalfOf.userId` |

### Trace an ASIA key back to who got it

```bash
# every call made with the key
aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=ASIAEXAMPLEKEY123456 --max-results 50
```

**Then:** find the `AssumeRole` event whose `responseElements.credentials.accessKeyId` is that key. Its `userIdentity` is who assumed the role, and `sourceIPAddress` is where from.

## S3

```terms
Bucket :: A globally unique container. Its name is in every URL: `bucket.s3.eu-west-2.amazonaws.com`.
Object / key :: A file and its full name. "Folders" are only key prefixes (`exports/2026/`).
Bucket policy :: A resource policy on the bucket. `"Principal": "*"` means anyone.
Block Public Access :: Account- and bucket-level switches that override public policies and ACLs. On by default for new buckets.
ACLs / Object Ownership :: Legacy per-object grants. Disabled by default ("bucket owner enforced") since 2023.
Versioning :: Keeps old versions after overwrite or delete. Your undo button in ransomware cases.
Data events :: Object-level calls (`GetObject`, `PutObject`). **Not logged by CloudTrail unless enabled.**
Server access logs :: S3's own request log, delivered to another bucket. Best effort, but free of the data-event cost.
```

### How a presigned URL works

```sequence
Signer[user] -> Signer: Sign GET bucket/key with own credentials (no call to AWS)
Signer --> Recipient[external]: URL with X-Amz-Credential, Expires and Signature
Recipient -> S3[storage]{aws/s3}: GET the URL (no AWS account needed)
S3 -> IAM[security]{aws/iam}: Is the signer allowed GetObject right now?
IAM --> S3: Allow
S3 --> Recipient: The object
note: Logged as the signer, with AuthenticationMethod QueryString
```

### Presigned URL anatomy

```anatomy
https://reports.s3.eu-west-2.amazonaws.com/ :: bucket and region
q3/payroll.xlsx :: object key
?X-Amz-Algorithm=AWS4-HMAC-SHA256 :: SigV4
&X-Amz-Credential=AKIAEXAMPLE/20261025/eu-west-2/s3/aws4_request :: signer's key ID, date, region
&X-Amz-Date=20261025T101500Z :: signed at
&X-Amz-Expires=604800 :: seconds valid (max 7 days)
&X-Amz-Security-Token=… :: only for temporary (ASIA) signers
&X-Amz-Signature=5f2b… :: HMAC of all the above
```

**Read:** whoever has the URL has the object until it expires. A URL signed with temporary credentials dies when those credentials expire, whatever `X-Amz-Expires` says.

### Investigate a presigned URL

| Question | Answer |
| --- | --- |
| Who created it? | The key in `X-Amz-Credential`. Signing makes no API call, so there's no "create" event |
| Who used it? | CloudTrail data event or access log: `additionalEventData.AuthenticationMethod = QueryString`, plus `sourceIPAddress` |
| Can I kill one URL? | No. Disable the signer's key, revoke the role's sessions, or deny it in the bucket policy |
| Stop them for good? | Bucket policy condition on `s3:authType` (`REST-QUERY-STRING`) or `s3:signatureAge` |

### Exposure and tampering calls

| eventName | Why it matters |
| --- | --- |
| `PutBucketPolicy` | Check for `"Principal": "*"` or an unknown account ID |
| `DeleteBucketPolicy`, `PutBucketAcl` | Access changed |
| `PutPublicAccessBlock`, `DeletePublicAccessBlock` | Public guardrail switched off |
| `PutBucketReplication` | Copies every new object to another (possibly external) bucket |
| `PutBucketVersioning` (Suspended), `PutBucketLifecycle` | Prepares for destruction: no undo, auto-delete |
| `CopyObject` / `PutObject` with SSE-C | Objects re-encrypted with the attacker's key: S3 ransomware |

## Lambda

```layers
Invocation :: Trigger[app]{aws/eventbridge}, Function URL[network]{aws/api-gateway}
Function :: Lambda function[compute]{aws/lambda}, Execution role[security]{aws/iam-role}
Outputs :: CloudWatch Logs[mgmt]{aws/cloudwatch-logs}, Other services[storage]{aws/s3}
Trigger -> Lambda function: event
Function URL -> Lambda function: HTTPS
Lambda function -> Execution role: AssumeRole
Lambda function -> CloudWatch Logs: logs
Execution role -> Other services: API calls as the role
```

```terms
Function :: Your code plus its configuration: runtime, handler, memory, timeout (max 15 min).
Execution role :: The role the function runs as. Its `ASIA` credentials sit in the function's environment variables.
Trigger / event source :: What invokes it: API Gateway, S3 events, EventBridge schedules, SQS.
Resource policy :: Who may invoke the function. `AddPermission` changes it.
Function URL :: A direct HTTPS endpoint. `AuthType NONE` means anyone on the internet can call it.
Layer :: Shared code mounted into functions. A quiet place to plant a backdoor.
Environment variables :: Config, and too often secrets. Readable by anyone with `GetFunctionConfiguration`.
```

### Lambda calls in CloudTrail

| eventName | Watch for |
| --- | --- |
| `CreateFunction20150331` | New function with a privileged role |
| `UpdateFunctionCode20150331v2` | Code swapped: backdoor or credential stealer |
| `UpdateFunctionConfiguration20150331v2` | New env vars, layers or role |
| `AddPermission20150331v2` | Invocation opened to another account or `*` |
| `CreateFunctionUrlConfig20211031` | Public endpoint, check `authType` |
| `CreateEventSourceMapping20150331` | Persistence via a queue or stream |

**Read:** the date suffixes are part of the event name, so search with a prefix or regex. API calls the function makes show `AssumedRole` with the function name as the session name.

## EC2 and the metadata service

### IMDSv2: how an instance gets its role credentials

```sequence
Process[compute]{aws/ec2-instance} -> IMDS[security]: PUT /latest/api/token (TTL header)
IMDS --> Process: Session token
Process -> IMDS: GET /latest/meta-data/iam/security-credentials/AppRole (with token)
IMDS --> Process: ASIA key, secret, session token
note: IMDSv1 skips the token step, so a single SSRF GET can steal the keys
```

```terms
IMDS :: The instance metadata service at `169.254.169.254`, reachable only from inside the instance.
IMDSv1 / v2 :: v1 answers plain GETs, which SSRF can reach. v2 needs a PUT for a token first. Enforce v2.
Hop limit :: How many network hops the token survives. `1` keeps it from leaking to containers.
Instance profile :: The wrapper that attaches a role to an instance (`AIPA…`).
User data :: A script run at boot. `ModifyInstanceAttribute` on it is a persistence trick.
```

**Watch for:** GuardDuty `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS`, meaning an instance's role keys were used from outside AWS.

## Logging map

```flow
API calls[user] --> CloudTrail[mgmt]{aws/cloudtrail} --trail--> S3 bucket[storage]{aws/s3}
Console sign-ins[user] --> CloudTrail[mgmt]{aws/cloudtrail} --stream--> CloudWatch Logs[mgmt]{aws/cloudwatch-logs} --> SIEM[external]
VPC Flow Logs[network]{aws/vpc-flow-logs} --> GuardDuty[security]{aws/guardduty} --findings--> Security Hub[security]{aws/security-hub}
```

| Question | Log |
| --- | --- |
| Who changed what in the account? | CloudTrail management events (event history keeps 90 days with no trail) |
| Who read or wrote an object? | CloudTrail S3 data events, or S3 server access logs |
| What talked to what on the network? | VPC Flow Logs |
| What did the function print or error? | CloudWatch Logs `/aws/lambda/<function>` |
| What looked malicious? | GuardDuty findings |
| What did a resource look like on a date? | AWS Config |

### GuardDuty finding anatomy

```anatomy
UnauthorizedAccess :: threat purpose
:
IAMUser :: resource type
/
InstanceCredentialExfiltration :: threat family
.
OutsideAWS :: detection mechanism
```

### CloudTrail record fields

| Field | Use |
| --- | --- |
| `eventSource` / `eventName` | Service and action: `s3.amazonaws.com` / `PutBucketPolicy` |
| `userIdentity` | Who (see the types table above) |
| `sourceIPAddress` | Caller's IP, or a service name such as `lambda.amazonaws.com` |
| `userAgent` | CLI, SDK, console or tooling (`Boto3`, `aws-cli`, `S3 Browser`) |
| `errorCode` | `AccessDenied` bursts mean enumeration |
| `requestParameters` / `responseElements` | What was asked for and what came back |
| `recipientAccountId` | The account the event belongs to |
| `readOnly` | `false` means something changed |

## High-signal API calls

| eventName | Why |
| --- | --- |
| `GetCallerIdentity` | First call with a stolen key |
| `ConsoleLogin` (no MFA, new country) | Account takeover |
| `CreateAccessKey`, `CreateLoginProfile`, `CreateUser` | Persistence |
| `AttachUserPolicy`, `PutUserPolicy`, `AttachRolePolicy` | Privilege escalation |
| `UpdateAssumeRolePolicy` | Backdoored trust: an outside account can now assume the role |
| `StopLogging`, `DeleteTrail`, `UpdateTrail` | Defence evasion |
| `DeleteDetector`, `DisableSecurityHub` | Defence evasion |
| `GetSecretValue`, `GetParameter` (with decryption) | Credential access |
| `ScheduleKeyDeletion`, `DisableKey` | Destruction: data under that KMS key becomes unreadable |
| `RunInstances` in an unused region | Crypto mining |
| `ListBuckets`, `DescribeInstances`, many `AccessDenied` | Discovery |

## Containment

### Leaked access key (AKIA)

```bash
aws iam update-access-key --user-name svc-backup --access-key-id AKIAEXAMPLEKEY123456 --status Inactive
```

**Then:** check for keys, users and login profiles the attacker created with it before you rotate.

### Stolen role session (ASIA)

```bash
# what "Revoke active sessions" in the console does: deny tokens issued before now
aws iam put-role-policy --role-name AppRole --policy-name AWSRevokeOlderSessions --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":"*","Resource":"*","Condition":{"DateLessThan":{"aws:TokenIssueTime":"2026-10-25T12:00:00Z"}}}]}'
```

### Compromised instance

```bash
aws ec2 create-snapshot --volume-id vol-0abc123 --description "IR case 1234"
aws ec2 modify-instance-attribute --instance-id i-0abc123 --groups sg-isolation
```

**Tune:** the isolation group has no inbound or outbound rules. Snapshot first; stopping the instance loses memory.

### Public bucket

```bash
aws s3api put-public-access-block --bucket reports --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### Malicious function

```bash
# throttle to zero: nothing runs, and the code stays for analysis
aws lambda put-function-concurrency --function-name report-sync --reserved-concurrent-executions 0
```

## Hunting in SecOps

### Calls made with one key

```udm
raw = "ASIAEXAMPLEKEY123456"
```

**Then:** pick AWS CloudTrail in the log type drop-down. Raw search finds the key wherever the parser put it.

### Defence evasion

```udm
metadata.log_type = "AWS_CLOUDTRAIL"
metadata.product_event_type = /^(StopLogging|DeleteTrail|UpdateTrail|DeleteDetector|PutBucketReplication|DeletePublicAccessBlock)$/
```

### Lambda code changes

```udm
metadata.log_type = "AWS_CLOUDTRAIL"
metadata.product_event_type = /^(UpdateFunctionCode|UpdateFunctionConfiguration|AddPermission|CreateFunctionUrlConfig)/
```

**Tune:** field mappings depend on the CloudTrail parser version. Check one event in the UDM viewer before trusting a field.
