---
tool: Wordlists and rules
slug: wordlists
kind: technique
stages: [weaponization]
category: Crafting lists tuned to the target
platforms: [linux]
services: [all]
tags: [wordlists, cewl, crunch, hashcat-rules, password-spraying, mangling]
attack: [T1110.001, T1110.003, T1589.001]
summary: A generic list wastes guesses; a list built from the target lands. Scrape words off the company site, generate candidate usernames from names, mangle a seed list with rules, and build masks that match the password policy you pulled.
references:
  - The Hacker Recipes: bruteforcing | https://www.thehacker.recipes/ad/movement/credentials/bruteforcing/
  - SecLists | https://github.com/danielmiessler/SecLists
---

## When to reach for it

Before any spray, brute or offline crack. The password policy you enumerated (length, complexity) and the words on the target's own site tell you what candidates are plausible, so you spend guesses where they count and avoid lockout from blind runs.

## Scrape and generate

Build a wordlist from the company website, and candidate usernames from a list of real names:

```bash
cewl -d 3 -m 5 -w site-words.txt https://TARGET
username-anarchy -i names.txt > users.txt
```

## Mangle with rules

Rules turn one word into hundreds of realistic variants (capitalise, append year, leet). Preview the output of a rule, then apply it in a crack:

```bash
hashcat --stdout -r /usr/share/hashcat/rules/best64.rule site-words.txt | sort -u > mangled.txt
hashcat -m 1000 hashes.txt site-words.txt -r rules/best64.rule
```

`john --wordlist=words.txt --rules=Jumbo` does the same on the John side.

## Masks for a known policy

When the policy is "one upper, digits, 8+", a mask is faster than a huge list. Crack an 8-char `Upper + 4 lower + 3 digit` shape, or generate a keyspace with crunch:

```bash
hashcat -m 1000 hashes.txt -a 3 '?u?l?l?l?l?d?d?d'
crunch 8 8 -t Pass@,%% -o keyspace.txt
```

## Notes

A tuned list and a lockout-aware pace keep a spray inside the agreed policy; count your attempts against the account-lockout threshold you pulled, and prefer `-u users.txt -p OneSpring2026!` (one password, many users) over hammering one account. Scraped words and generated lists are only candidates, not secrets, but any cracked credential is sensitive loot. In-scope and authorised use only.
