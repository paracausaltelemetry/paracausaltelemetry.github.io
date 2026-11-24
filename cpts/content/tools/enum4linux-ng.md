---
tool: enum4linux-ng
slug: enum4linux-ng
stages: [pre-compromise]
targets: [windows, linux]
category: All-in-one SMB and RPC enumeration
platforms: [linux, network]
services: [smb, msrpc, ldap]
ports: [139, 445, 389]
tags: [enumeration, smb, rpc, users, groups, shares, policy, active directory]
attack: [T1087.002, T1135, T1201]
summary: A rewrite of the classic enum4linux that fires every useful SMB/RPC enumeration at a host and files the results — users, groups, shares, the password policy, OS info and RID-cycled accounts — in one command. The quickest way to turn an open 445 into a full picture of a Windows or Samba host.
references:
  - enum4linux-ng on GitHub | https://github.com/cddmp/enum4linux-ng
  - The Hacker Recipes — SMB | https://www.thehacker.recipes/ad/recon/
---

## When to reach for it

SMB is open and you want the whole enumeration in one pass rather than driving rpcclient, smbclient and ldapsearch by hand. enum4linux-ng runs the lot — sessions, shares, users, groups, policy, RID cycling — and prints a tidy, greppable (or JSON/YAML) report.

## Key flags

- `-A`: do everything (all simple enumeration).
- `-u user -p 'Password'`: authenticate instead of using a null session.
- `-R`: force RID cycling to recover users when direct enumeration is blocked.
- `-S` / `-U` / `-G` / `-P`: just shares / users / groups / password policy.
- `-oJ out`: write the results to JSON (`out.json`) for later parsing.

## Commands

Full null-session sweep:

```bash
enum4linux-ng -A HOST
```

Authenticated, with RID cycling, saved to JSON:

```bash
enum4linux-ng -A -R -u user -p 'Password' HOST -oJ enum-HOST
```

Just the password policy (before spraying):

```bash
enum4linux-ng -P HOST
```

## Workflow

1. Run `-A` first with a null session to see what comes back for free.
2. If little returns, re-run with a credential (`-u`/`-p`) and `-R` for RID cycling.
3. Note the shares to visit with smbclient/smbmap and the policy before spraying.
4. Pull the user and group lists into the Kerberos and spraying workflows.
5. Save JSON (`-oJ`) so the host's facts are on hand for the report.

## Notes

enum4linux-ng is the maintained successor to Perl enum4linux — faster, structured output, fewer false "unknown" results. It is a convenience wrapper over the same RPC/SMB calls rpcclient and smbclient make, so when it reports something odd, drop to rpcclient to confirm. NetExec covers much of the same ground across many hosts at once; reach for enum4linux-ng when you want depth on a single target.
