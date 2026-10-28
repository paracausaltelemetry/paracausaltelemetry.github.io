# macOS and Jamf

Visual reference for macOS on cases: how the unified log works and the predicates worth knowing, the built-in protections (Gatekeeper, XProtect, TCC) and what they record, persistence locations, how infostealers behave, and where Jamf Pro and Jamf Protect fit. Users, paths and IDs below are placeholders.

## The mental model

macOS writes almost everything to the **unified log**, a compressed binary store you query with `log`. Security decisions come from layers that each leave traces: **Gatekeeper** and notarisation when something is opened, **XProtect** for known malware, **TCC** for privacy permissions, and the **Endpoint Security framework** that EDR agents (including Jamf Protect) build on.

```layers
Apps and users :: Downloaded app[external]{globe}, User[user]{laptop}, Jamf Pro[mgmt]{app}
macOS protections :: Gatekeeper and notarisation[security]{shield}, XProtect[security]{radar}, TCC[security]{lock}, Endpoint Security framework[app]{sensor}
Records and tools :: Unified log[data]{log}, Jamf Protect / EDR[security]{alert}
Downloaded app -> Gatekeeper and notarisation: first open
Gatekeeper and notarisation -> XProtect
User -> TCC: approves access
Jamf Pro -> TCC: PPPC profiles
Gatekeeper and notarisation -> Unified log
Endpoint Security framework -> Jamf Protect / EDR: events
```

```terms
Unified log :: Every subsystem's messages, kept for days to weeks depending on volume. Query with `log show`; export with `log collect`.
Subsystem / category :: How log messages are labelled (`com.apple.TCC`, `com.apple.xprotect`). The fastest way to filter.
Quarantine :: The `com.apple.quarantine` extended attribute added to downloads. It's what makes Gatekeeper check the file.
Gatekeeper :: Checks a quarantined app is signed and notarised before first launch.
Notarisation :: Apple's malware scan of a developer's app. Unnotarised apps need the user to override.
XProtect / XProtect Remediator :: Built-in signature-based detection and periodic cleanup of known malware.
TCC :: Transparency, Consent and Control: which apps may use the camera, microphone, screen recording, Full Disk Access, Accessibility and so on.
PPPC :: Privacy Preferences Policy Control: an MDM profile that grants TCC permissions without asking the user.
Endpoint Security framework (ESF) :: Apple's API for security tools to watch process, file and authentication events.
Background Task Management (BTM) :: macOS 13 and later track login items, launch agents and daemons, and notify the user when one is added.
```

## Unified log

```text
log show --last 2h --predicate 'process == "sudo"' --style syslog
log show --last 1d --predicate 'subsystem == "com.apple.TCC"' --info
log show --last 1d --predicate 'subsystem == "com.apple.xprotect" OR subsystem == "com.apple.XProtectFramework"'
log show --last 1d --predicate 'process == "sshd" OR process == "loginwindow"'
log show --last 1d --predicate 'subsystem == "com.apple.backgroundtaskmanagement"'
sudo log collect --last 1d --output /tmp/case.logarchive
```

| Predicate | Finds |
| --- | --- |
| `process == "sudo"` | sudo use and failures |
| `process == "sshd"` | SSH logins (if Remote Login is on) |
| `process == "loginwindow"` | Console logins, logouts, screen unlocks |
| `subsystem == "com.apple.TCC"` | Privacy permission prompts and decisions |
| `subsystem == "com.apple.syspolicy"` or `process == "syspolicyd"` | Gatekeeper assessments and overrides |
| `subsystem == "com.apple.xprotect"` | XProtect detections |
| `subsystem == "com.apple.backgroundtaskmanagement"` | New login items, launch agents and daemons |
| `eventMessage CONTAINS "osascript"` | AppleScript activity, often abused by stealers |

**Read:** `log collect` produces a `.logarchive` you can copy off the Mac and query later with `log show --archive case.logarchive`. Do that early: older entries roll off.

## Gatekeeper and quarantine

```sequence
User[user]{laptop} -> Browser[app]{globe}: Download installer.dmg
Browser -> Browser: Adds com.apple.quarantine and a QuarantineEventsV2 record
User -> Gatekeeper[security]{shield}: Opens the app inside
Gatekeeper -> Gatekeeper: Signed? Notarised? Known malware (XProtect)?
Gatekeeper --> User: Opens, or blocks with an "Open Anyway" override in System Settings
note: Stealers coach users through the override, or remove the attribute with xattr
```

```text
xattr -l ~/Downloads/installer.dmg
codesign -dvvv /Applications/Example.app
spctl --assess -vv /Applications/Example.app
sqlite3 ~/Library/Preferences/com.apple.LaunchServices.QuarantineEventsV2 "SELECT datetime(LSQuarantineTimeStamp + 978307200, 'unixepoch'), LSQuarantineAgentName, LSQuarantineDataURLString FROM LSQuarantineEvent ORDER BY 1 DESC LIMIT 20"
```

| Command | Answers |
| --- | --- |
| `xattr -l` | Is the file quarantined, and by which app? |
| `codesign -dvvv` | Who signed it (Team ID), and is the signature valid? |
| `spctl --assess -vv` | Would Gatekeeper allow it, and why? |
| QuarantineEventsV2 query | What was downloaded, when, by which app, from which URL |

## TCC: privacy permissions

| Service | Grants |
| --- | --- |
| `kTCCServiceSystemPolicyAllFiles` | Full Disk Access: read mail, messages, browser data, other users' files |
| `kTCCServiceAccessibility` | Control the computer: click, type, read the screen's UI |
| `kTCCServiceScreenCapture` | Record the screen |
| `kTCCServiceListenEvent` | Input monitoring: read keystrokes |
| `kTCCServiceAppleEvents` | Script other apps through Apple events |
| `kTCCServiceMicrophone`, `kTCCServiceCamera` | Microphone, camera |

```text
sudo sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" "SELECT client, service, auth_value, datetime(last_modified, 'unixepoch') FROM access ORDER BY last_modified DESC"
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, service, auth_value, datetime(last_modified, 'unixepoch') FROM access ORDER BY last_modified DESC"
```

**Read:** `auth_value` `2` is allowed, `0` is denied. Reading the system TCC.db needs Full Disk Access for Terminal. A remote-access tool or a script interpreter with Full Disk Access or Accessibility that nobody approved is a finding.

## Persistence

```flow
LaunchAgents[app]{function} --> LaunchDaemons[app]{server} --> Login items (BTM)[app]{user} --> Shell profiles[app]{log} --> Configuration profiles[mgmt]{lock} --> Extensions and plugins[security]{shield}
```

| Where | Look at |
| --- | --- |
| Launch agents (per user, at login) | `~/Library/LaunchAgents/`, `/Library/LaunchAgents/` |
| Launch daemons (as root, at boot) | `/Library/LaunchDaemons/` |
| Login items and background tasks | `sudo sfltool dumpbtm` lists everything BTM knows about, with the developer |
| Shell startup | `~/.zshrc`, `~/.zprofile`, `~/.bash_profile`, `/etc/zshrc` |
| Cron and periodic | `crontab -l`, `/etc/periodic/` |
| Configuration profiles | `profiles list` (and `sudo profiles show -type configuration`): an unknown profile can install certificates, proxies or PPPC grants |
| System and kernel extensions | `systemextensionsctl list`, `kmutil showloaded` |
| Authorization plugins | `/Library/Security/SecurityAgentPlugins/`: run at login with access to the password |

**Read:** in a launch agent's plist, `ProgramArguments` is what runs and `RunAtLoad` / `KeepAlive` say when. Hidden files (names starting with `.`) and binaries in `/Users/Shared`, `/tmp` or `~/Library/Application Support/<odd name>` are worth a closer look.

## Infostealers

Atomic (AMOS), Poseidon, Cthulhu and similar stealers are the most common macOS malware on cases.

```sequence
User[user]{laptop} -> Fake app[external]{alert}: Opens a cracked app or fake installer from a DMG
Fake app -> User: "Right-click, Open" instructions to get past Gatekeeper
Fake app -> User: osascript dialog asks for the login password ("hidden answer")
Fake app -> Fake app: Copies Keychain, browser cookies and passwords, wallets, Notes, files
Fake app -> Attacker[external]{globe}: Zips and posts it with curl
note: Stolen browser cookies then show up as token replay in identity logs
```

| Sign | Where |
| --- | --- |
| `osascript` with `display dialog` and `hidden answer` | Process command lines, unified log |
| `security find-generic-password`, `security dump-keychain` | Process command lines |
| `xattr -d com.apple.quarantine` or `xattr -c` on a new app | Process command lines |
| `curl` posting a zip to an IP, often right after the above | Network and process events |
| Unsigned or ad hoc signed binary in a mounted DMG (`/Volumes/…`) | `codesign`, EDR process events |
| Files staged in `/tmp` or `~/<random>` then deleted | File events |

**Watch for:** after a stealer, assume every browser session, saved password and token on that Mac is in the attacker's hands. Revoke sessions and rotate passwords from a different device.

## Jamf

| Product | Use on a case |
| --- | --- |
| Jamf Pro | MDM and inventory: who has the Mac, OS version, installed apps, profiles, extension attributes. Policies and scripts let you run a collection script remotely |
| Jamf Protect | EDR built on ESF: analytics (detections), threat prevention (blocks known malware), unified log streaming and telemetry to your SIEM |
| Jamf Connect | Ties macOS logins to Entra ID or Okta. Its sign-ins appear in the identity provider's logs |

### Containment with Jamf

| Goal | How |
| --- | --- |
| Collect evidence | A Jamf Pro policy running a collection script (unified log archive, launch items, TCC, quarantine DB) to a secure upload location |
| Stop a process or file | Jamf Protect threat prevention, or a custom prevent list by hash or Team ID |
| Isolate | Network isolation where your Jamf Protect plan supports it, otherwise NAC or Wi-Fi profile removal |
| Lock or wipe | MDM Lock Device or Erase Device commands (lock needs a PIN to unlock) |
| Remove a bad profile | Remove it from scope in Jamf Pro, then confirm with `profiles list` |

## Queries

### Password prompts from osascript (Defender Advanced Hunting, macOS)

```kql
DeviceProcessEvents
| where Timestamp > ago(30d)
| where FileName == "osascript"
| where ProcessCommandLine has "hidden answer"
| project Timestamp, DeviceName, AccountName, InitiatingProcessFolderPath, ProcessCommandLine
```

### Keychain dumping (Splunk, EDR process events)

```spl
index=edr os=macos process_name=security (process="*find-generic-password*" OR process="*dump-keychain*")
| table _time, host, user, parent_process, process
```

### Quarantine removed (SecOps)

```udm
metadata.event_type = "PROCESS_LAUNCH"
principal.platform = "MAC"
target.process.command_line = /xattr\s+(-d\s+com\.apple\.quarantine|-c)/ nocase
```

**Tune:** field and index names depend on which agent sends macOS telemetry (Jamf Protect, MDE, CrowdStrike). Check one event first.
