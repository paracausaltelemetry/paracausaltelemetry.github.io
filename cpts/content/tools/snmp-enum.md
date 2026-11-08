---
tool: SNMP enumeration
slug: snmp-enum
kind: technique
stages: [reconnaissance]
category: Community strings on 161/udp
platforms: [linux, network]
services: [snmp]
ports: [161]
tags: [snmp, enumeration, community-string, onesixtyone, snmpwalk]
attack: [T1046, T1087, T1083]
summary: SNMP on UDP 161 is easy to miss and often wide open with a default community string. Guess the string, then walk the MIB for running processes, users, network shares, software and sometimes credentials in plaintext. A quiet source of host detail and the occasional password.
references:
  - The Hacker Recipes: initial access | https://www.thehacker.recipes/systems-and-services/initial-access/
  - HackTricks pentesting SNMP | https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-snmp/index.html
---

## When to reach for it

A UDP scan shows 161 open (easy to miss, since UDP scans are slow, run `nmap -sU -p161`). SNMPv1/v2c has no real auth: a community string, often the default `public`, is the whole door. v3 is credentialled and out of this quick path. The MIB behind it holds process lists, listening ports, user accounts, installed software and, on misconfigured devices, passwords and config in cleartext.

## Find a valid community string

```bash
onesixtyone -c /usr/share/seclists/Discovery/SNMP/common-community-strings.txt TARGET
```

`onesixtyone` sprays strings fast; `public` and `private` are the usual hits.

## Walk the tree

With a string, pull everything, then the useful branches by OID:

```bash
snmpwalk -v2c -c public TARGET
snmp-check -c public TARGET
```

Useful OIDs: `1.3.6.1.2.1.25.4.2.1.2` running processes, `...25.6.3.1.2` installed software, `1.3.6.1.4.1.77.1.2.25` user accounts, `...25.4.2.1.5` process arguments (where a password on a command line leaks). `snmp-check` formats the common ones for you.

## Notes

Reading SNMP is low-noise but still touches the device, so keep it inside scope and record anything sensitive it exposes, a default community string and any cleartext credential or config are findings in their own right. Any password or key pulled from the MIB is loot to handle with the rest of the engagement data. In-scope and authorised use only.
