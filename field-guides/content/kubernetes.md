# Kubernetes audit logs

Visual reference for Kubernetes on cases: how a request reaches the API server and gets audited, audit levels and stages, reading an audit event, where EKS, AKS and GKE keep the logs, the attacks that show up (exec, privileged pods, secrets, cluster-admin bindings, stolen service account tokens), and containment. Clusters, namespaces and names below are placeholders.

## The mental model

Everything in a cluster goes through the **API server**: `kubectl`, CI pipelines, controllers and pods using their service account. Each request is **authenticated**, **authorised** by RBAC, checked by **admission** controllers, then stored in **etcd**. The audit policy decides what gets logged for each request. What runs **inside** a container (a shell after `exec`, a miner) isn't in the audit log; that needs a runtime sensor or EDR on the nodes.

```layers
Clients :: kubectl and CI[user]{laptop}, Pod with a service account[compute]{server}, Attacker with a token[external]{alert}
Control plane :: API server[app]{app}, Authentication and RBAC[security]{lock}, Admission controllers[security]{shield}
State and logs :: etcd[data]{db}, Audit log[data]{log}
Nodes :: Kubelet and containers[compute]{server}, Runtime sensor or EDR[security]{sensor}
kubectl and CI -> API server
Pod with a service account -> API server
Attacker with a token -> API server
API server -> Authentication and RBAC
Authentication and RBAC -> Admission controllers
Admission controllers -> etcd
API server -> Audit log: every request
etcd -> Kubelet and containers: scheduled pods
Kubelet and containers -> Runtime sensor or EDR: process events
```

```terms
API server :: The front door for every read and change. Its audit log is the record of who did what in the cluster.
RBAC :: Roles (namespaced) and ClusterRoles grant verbs on resources; RoleBindings and ClusterRoleBindings give them to users, groups or service accounts.
Service account :: An identity for pods. Its token is mounted in the pod at `/var/run/secrets/kubernetes.io/serviceaccount/token` unless turned off.
Audit policy :: Rules choosing the level for each kind of request. Managed clusters set their own.
Audit levels :: `None`, `Metadata` (who, what, when), `Request` (plus the request body), `RequestResponse` (plus the response).
Stages :: `RequestReceived`, `ResponseStarted` (long-running requests like exec and watch), `ResponseComplete`, `Panic`.
Subresource :: An action on a resource: `pods/exec`, `pods/attach`, `pods/portforward`, `pods/log`, `serviceaccounts/token`.
Admission controller :: Checks or changes objects before they're stored. Pod Security Admission blocks privileged pods by namespace label.
```

## Reading an audit event

| Field | Holds |
| --- | --- |
| `verb` | `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` (exec is `create` on `pods/exec`) |
| `user.username`, `user.groups` | Who: a person (`jsmith@example.com`), a service account (`system:serviceaccount:<ns>:<name>`) or `system:anonymous` |
| `impersonatedUser` | Set when the caller used impersonation (`--as`) |
| `sourceIPs`, `userAgent` | Where from, and which client (`kubectl/v1.31`, a Python client, `curl`) |
| `objectRef.resource`, `.subresource`, `.namespace`, `.name` | What was touched |
| `responseStatus.code` | `200`, `201`, `403` (RBAC said no), `401` |
| `annotations."authorization.k8s.io/decision"`, `."authorization.k8s.io/reason"` | Allow or forbid, and which binding allowed it |
| `requestObject` | The body, at `Request` level and above: the pod spec, the binding |

**Read:** a service account used from an IP outside the cluster's pod and node ranges usually means its token was stolen.

## Where the logs are

| Platform | Turn on | Find it |
| --- | --- | --- |
| Amazon EKS | Control plane logging: `audit` (off by default) | CloudWatch Logs `/aws/eks/<cluster>/cluster`, streams `kube-apiserver-audit-*` |
| Azure AKS | Diagnostic setting: `kube-audit` or `kube-audit-admin` (writes only, cheaper) | Log Analytics `AKSAudit` / `AKSAuditAdmin` (resource-specific), or `AzureDiagnostics` |
| Google GKE | Admin Activity audit logs on by default; Data Access for reads | Cloud Logging, `resource.type="k8s_cluster"`, `protoPayload.methodName` like `io.k8s.core.v1.pods.exec.create` |
| Self-managed | `--audit-policy-file` and `--audit-log-path` on the API server | The log file, or a webhook backend to your SIEM |

## Attacks you'll see

```flow
Stolen token or exposed API[external]{key} --> Discovery: list secrets and pods[app]{radar} --> exec or privileged pod[compute]{server} --> Escape to the node[security]{alert} --> Persist: bindings and DaemonSets[mgmt]{function}
```

| Attack | In the audit log |
| --- | --- |
| Shell in a container | `create` on `pods/exec`, often from a new IP or user agent |
| Reading secrets | `get` or `list` on `secrets`, especially cluster-wide or by a service account that never did before |
| Privileged pod to escape | `create` on `pods` with `privileged: true`, `hostPID`, `hostNetwork` or a `hostPath` mount of `/` in `requestObject` |
| Granting cluster-admin | `create` on `clusterrolebindings` with `roleRef.name: cluster-admin` |
| Persistence | New `daemonsets`, `cronjobs` or mutating admission webhooks; new service account tokens (`serviceaccounts/token`) |
| Anonymous access | Any allowed request from `system:anonymous` |
| Probing | Many `403` responses from one user or IP: someone testing what a token can do |
| Cryptomining | New deployments or jobs with unknown images, often in `kube-system` or a new namespace |

**Watch for:** `kubectl auth can-i --list` and similar enumeration from a pod's own service account, and calls to the kubelet API (port 10250) on nodes, which bypass the API server's audit log.

## Containment

```text
kubectl get pods -A -o wide
kubectl get events -A --sort-by=.lastTimestamp
kubectl get clusterrolebindings -o wide | grep cluster-admin
kubectl auth can-i --list --as=system:serviceaccount:payments:api
kubectl label pod web-7d9f quarantine=true --overwrite
kubectl cordon node-a1
kubectl delete clusterrolebinding suspicious-binding
```

| Goal | How |
| --- | --- |
| Isolate a pod and keep it for evidence | A NetworkPolicy that denies all traffic for the label `quarantine=true`, then label the pod. Don't delete it yet |
| Stop new work landing on a node | `kubectl cordon`; drain later, after evidence is taken |
| Take evidence | Node disk snapshot (cloud), container filesystem export, `kubectl logs`, the pod spec (`-o yaml`) |
| Cut a stolen service account token | Delete and recreate the service account (bound tokens die with it), or delete the old token secret |
| Remove persistence | Delete bindings, DaemonSets, CronJobs and webhooks the attacker created |
| Cut a person's access | Remove them from the cloud IAM mapping (EKS access entries, AKS Entra groups, GKE IAM), then rotate cluster credentials if needed |

## Queries

### exec into pods (Sentinel, AKS)

```kql
AKSAudit
| where TimeGenerated > ago(7d)
| where Verb == "create" and tostring(ObjectRef.subresource) == "exec"
| project TimeGenerated, User = tostring(User.username), Namespace = tostring(ObjectRef.namespace), Pod = tostring(ObjectRef.name), SourceIps, UserAgent
```

### cluster-admin granted (Sentinel, AKS)

```kql
AKSAuditAdmin
| where TimeGenerated > ago(30d)
| where Verb == "create" and tostring(ObjectRef.resource) == "clusterrolebindings"
| where tostring(RequestObject.roleRef.name) == "cluster-admin"
| project TimeGenerated, User = tostring(User.username), Binding = tostring(ObjectRef.name), Subjects = RequestObject.subjects
```

### exec into pods (Splunk)

```spl
index=k8s_audit verb=create objectRef.subresource=exec
| table _time, user.username, objectRef.namespace, objectRef.name, sourceIPs{}, userAgent
```

### Secrets read by service accounts (Elastic)

```esql
FROM logs-kubernetes.audit_logs-*
| WHERE @timestamp > NOW() - 7 days
  AND kubernetes.audit.objectRef.resource == "secrets"
  AND kubernetes.audit.verb IN ("get", "list")
  AND kubernetes.audit.user.username LIKE "system:serviceaccount:*"
| STATS reads = COUNT(*) BY kubernetes.audit.user.username, kubernetes.audit.objectRef.namespace
| SORT reads DESC
```

### exec into pods (EKS, CloudWatch Logs Insights)

```text
fields @timestamp, user.username, objectRef.namespace, objectRef.name, sourceIPs.0, userAgent
| filter @logStream like /kube-apiserver-audit/
| filter verb = "create" and objectRef.subresource = "exec"
| sort @timestamp desc
```

### exec into pods (GKE, Cloud Logging)

```text
resource.type="k8s_cluster"
protoPayload.methodName="io.k8s.core.v1.pods.exec.create"
```

**Tune:** controllers and operators make thousands of normal calls. Filter out `system:` users you trust (by name, not with a blanket `system:*`) before you look for the unusual ones.
