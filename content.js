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
    role: "Writeups and Research",
    headline: "Paracausal Telemetry.",
    primaryAction: {
      label: "Read writeups",
      href: "/writeups/"
    },
    secondaryAction: {
      label: "Search Observer",
      href: "/observer/"
    }
  }
};
