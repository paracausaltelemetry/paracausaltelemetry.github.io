export const portfolio = {
  github: {
    owner: "paracausaltelemetry",
    repo: "CTF-Writeups",
    branch: "main",
    autoDetectGithubPages: true
  },
  // Offline/no-network fallback only — normally the writeups page discovers
  // folders from the baked /writeups/index.json (foldersMeta), so a new
  // top-level folder in the CTF-Writeups repo needs no edit here.
  writeupFolders: [
    { label: "CTF", description: "", key: "ctf", path: "CTF" },
    { label: "Hack The Box", description: "", key: "htb", path: "HTB" },
    { label: "TryHackMe", description: "", key: "thm", path: "THM" }
  ],
  profile: {
    name: "Paracausal Telemetry",
    role: "Projects and Writeups",
    headline: "Paracausal Telemetry.",
    summary:
      "paracausal, adjective: not bound by cause and effect; operating outside the ordinary causal chain.",
    focus: "Security operations and incident response",
    signalTagline: "SOC, detection, and incident response",
    primaryAction: {
      label: "View projects",
      href: "/projects/"
    },
    secondaryAction: {
      label: "Read writeups",
      href: "/writeups/"
    }
  },
  signalTags: [
    "Signals Intelligence",
    "Anonymity",
    "OSINT",
    "Detection Engineering",
    "IT/OT"
  ],
  certifications: [
    {
      title: "SC-200: Microsoft Security Operations Analyst",
      description:
        "Microsoft security operations certification covering threat detection, investigation, and response with Microsoft Sentinel, Defender XDR, and KQL.",
      issuer: "Microsoft",
      featured: true,
      inProgress: true,
      resourceUrl: "https://learn.microsoft.com/en-us/credentials/certifications/security-operations-analyst/",
      resourceLabel: "View SC-200 outline"
    },
    {
      title: "Cisco Ethical Hacker",
      description:
        "Cisco ethical hacking credential covering reconnaissance, exploitation concepts, vulnerability handling, and defensive security awareness.",
      issuer: "Credly"
    },
    {
      title: "IBM Cybersecurity Fundamentals",
      description:
        "Foundational cybersecurity credential covering security concepts, threat types, controls, and basic operational practices.",
      issuer: "Credly"
    },
    {
      title: "ISC2 Certified in Cybersecurity",
      description:
        "ISC2 entry-level cybersecurity certification covering security principles, incident response, access controls, and network security basics.",
      issuer: "Credly"
    },
    {
      title: "BSc (Hons) Cyber Security - 1:1",
      description:
        "First Class Honours degree in Cyber Security from De Montfort University; UCAS course code G550.",
      issuer: "De Montfort University",
      featured: true,
      resourceUrl: "https://www.dmu.ac.uk/study/courses/undergraduate-courses/cyber-security-bsc-degree/cyber-security-bsc-hons.aspx",
      resourceLabel: "View DMU G550 course"
    },
    {
      title: "ICS-300",
      description:
        "CISA Advanced Cybersecurity for Industrial Control Systems course covering ICS security, IT/OT defense concepts, network discovery and mapping, detection, exploitation process, and attack demonstrations.",
      issuer: "CISA",
      featured: true,
      resourceUrl: "https://www.cisa.gov/resources-tools/training/advanced-cybersecurity-industrial-control-systems-ics300",
      resourceLabel: "View CISA ICS300 course"
    },
    {
      title: "ICS-401",
      description:
        "CISA Industrial Control Systems Evaluation training focused on analyzing, evaluating, and documenting the cybersecurity posture of an ICS network using a repeatable assessment process.",
      issuer: "CISA",
      resourceUrl: "https://www.cisa.gov/resources-tools/training/industrial-control-systems-evaluation-401v",
      resourceLabel: "View CISA 401V course"
    },
    {
      title: "Blue Team Level 1 (BTL1)",
      description:
        "Security Blue Team defensive certification covering phishing analysis, threat intelligence, digital forensics, SIEM operations, and incident response, assessed via a 24-hour hands-on practical exam.",
      issuer: "Credly",
      featured: true
    }
  ]
};
