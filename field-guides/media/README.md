# Official vendor diagrams

Diagrams from vendors' own documentation, embedded in the field guides with a
credit line under each (`figure` blocks, see `scripts/lib/guide-visuals.mjs`).
Each is reused under the licence of the repository it comes from. PNGs were
converted to WebP (quality 90) to cut page weight; nothing else is changed.

| File | Source | Licence |
| --- | --- | --- |
| `microsoft/oauth-auth-code-flow.svg` | Microsoft Learn, OAuth 2.0 authorization code flow (github.com/MicrosoftDocs/entra-docs) | MIT |
| `microsoft/oauth-client-credentials-flow.svg` | Microsoft Learn, OAuth 2.0 client credentials flow (entra-docs) | MIT |
| `microsoft/oauth-device-code-flow.svg` | Microsoft Learn, OAuth 2.0 device authorization grant (entra-docs) | MIT |
| `microsoft/managed-identity-vm-data-flow.webp` | Microsoft Learn, how managed identities work with Azure VMs (entra-docs) | MIT |
| `microsoft/cae-user-revocation-flow.webp` | Microsoft Learn, continuous access evaluation (entra-docs) | MIT |
| `microsoft/grant-admin-consent.webp` | Microsoft Learn, types of consent (entra-docs) | MIT |
| `microsoft/rbac-role-assignment.webp` | Microsoft Learn, what is Azure RBAC (github.com/MicrosoftDocs/azure-docs) | CC BY 4.0 |
| `microsoft/rbac-evaluation-logic.webp` | Microsoft Learn, what is Azure RBAC (azure-docs) | CC BY 4.0 |
| `microsoft/sas-storage-uri.svg` | Microsoft Learn, grant limited access with shared access signatures (azure-docs) | CC BY 4.0 |

Google Cloud's documentation licence excludes its images, and AWS's
documentation isn't openly licensed, so those guides redraw the flows from the
documented logic instead (`decide`, `sequence` and `layers` blocks).
