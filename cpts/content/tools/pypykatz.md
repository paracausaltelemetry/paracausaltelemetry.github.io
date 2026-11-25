---
tool: pypykatz
slug: pypykatz
stages: [post-compromise]
targets: [windows]
category: Parsing Windows secrets from dumps on Linux
platforms: [linux]
services: []
ports: []
tags: [credentials, lsass, dumping, dpapi, registry, post-exploitation]
attack: [T1003.001, T1003.002, T1555.003]
summary: A pure-Python reimplementation of Mimikatz's parsing. It extracts credentials from an LSASS minidump, the SAM/SYSTEM/SECURITY registry hives, and DPAPI blobs — all offline, on your Linux box, away from the target's defences. Dump the material with a living-off-the-land tool, then let pypykatz read it.
references:
  - pypykatz on GitHub | https://github.com/skelsec/pypykatz
---

## When to reach for it

You have an LSASS dump or copies of the SAM/SYSTEM hives from a Windows host and want the credentials out of them without running Mimikatz on the target. pypykatz parses the dump offline, so the noisy, well-signatured part never touches the box — only the quiet dump step does.

## Key flags

- `lsa minidump <file>`: parse an LSASS minidump for logons, hashes and tickets.
- `registry --sam SAM --system SYSTEM --security SECURITY`: parse the hives.
- `dpapi`: subcommands to decrypt DPAPI masterkeys and blobs.
- `--json`: machine-readable output for tooling.

## Commands

Parse an LSASS minidump pulled from the target:

```bash
pypykatz lsa minidump lsass.dmp
```

Extract local hashes from the registry hives:

```bash
pypykatz registry --sam SAM --system SYSTEM SYSTEM
```

## Workflow

1. On the target, dump LSASS quietly — Task Manager, `comsvcs.dll` MiniDump, or `reg save` for the hives.
2. Transfer the `.dmp`/hives to your box (see the file-transfer notes).
3. Run `pypykatz lsa minidump` to pull cleartext, NT hashes and Kerberos tickets.
4. Reuse the hashes with Pass-the-Hash, or crack them (hashcat).
5. For DPAPI-protected app secrets, continue with the `dpapi` subcommands.

## Notes

The separation matters: the on-host dump (via a LOLBAS like `comsvcs.dll` or `reg save`) is far less likely to be flagged than running Mimikatz there, and pypykatz does the rest offline where EDR cannot see it. It is Impacket's natural companion — `secretsdump` pulls remotely, pypykatz parses what you grabbed locally. Mimikatz remains the on-host tool when you need live ticket or DCSync operations.
