# Detection Rules

Sigma detection rules written and maintained by Paracausal Telemetry. Sigma is
the vendor-neutral detection format — each rule here converts to Splunk SPL,
Microsoft Sentinel KQL, and most other SIEM query languages with
[sigma-cli](https://github.com/SigmaHQ/sigma-cli):

```bash
pip install sigma-cli
sigma plugin install splunk sentinel

# Splunk
sigma convert -t splunk detection-rules/win_certutil_download.yml

# Microsoft Sentinel (KQL)
sigma convert -t kusto -p sentinelasim detection-rules/win_certutil_download.yml
```

## Rules

| Rule | Technique | Level |
| --- | --- | --- |
| [Encoded PowerShell Command Execution](win_powershell_encoded_command.yml) | T1059.001, T1027 | medium |
| [Office Application Spawns Shell or Script Host](win_office_spawns_shell.yml) | T1566.001, T1204.002 | high |
| [Certutil Used to Download Files](win_certutil_download.yml) | T1105, T1218 | high |
| [Scheduled Task Created to Run From User-Writable Path](win_schtasks_from_temp.yml) | T1053.005 | medium |

All rules are `status: experimental`: they are written to be readable and
tunable, and each one documents its expected false-positive sources.
