// Text normalization and analyst-terminology expansion for Observer.
// Pure, dependency-free, and shared between the browser
// search engine and the Node test harness, no DOM, no fetch.

// Lowercase, strip diacritics, drop punctuation (keeping word characters and
// the dots inside ATT&CK ids like "t1110.003"), and collapse whitespace.
export function normalize(text) {
  if (text == null) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Split normalized text into tokens. Trailing dots (sentence punctuation) are
// trimmed, but internal dots survive so "t1110.003" stays one token.
export function tokenize(text) {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

// Analyst phrasing -> canonical anchors. Keys are matched as substrings of the
// normalized query; the values are appended to the query's token set so a
// search for "failed logons" also pulls in event 4625, etc. Original tokens
// are always kept, so expansion only ever widens a search.
const SYNONYMS = [
  { phrases: ["failed logon", "failed login", "failed logons", "failed logins", "logon failure", "bad password"], add: ["4625", "failed", "logon"] },
  { phrases: ["brute force", "bruteforce", "password guessing", "password attack"], add: ["t1110", "brute", "force"] },
  { phrases: ["password spray", "password spraying", "spraying"], add: ["t1110.003", "spray"] },
  { phrases: ["credential stuffing"], add: ["t1110.004"] },
  { phrases: ["privileged user", "privileged logon", "privileged login", "admin logon", "elevated logon"], add: ["4672", "privileged"] },
  { phrases: ["cleared logs", "cleared log", "log cleared", "logs cleared", "clear logs", "wipe logs", "log wipe"], add: ["1102", "cleared", "log"] },
  { phrases: ["credential dumping", "dump credentials", "lsass dump", "dump lsass", "creds dump"], add: ["lsass", "t1003", "credential"] },
  { phrases: ["kerberoast", "kerberoasting"], add: ["t1558.003", "4769", "kerberos"] },
  { phrases: ["scheduled task", "schtask", "schtasks", "cron"], add: ["4698", "scheduled", "task"] },
  { phrases: ["new service", "service install", "service installed", "psexec"], add: ["7045", "service"] },
  { phrases: ["psexce", "psexec.exe"], add: ["psexec", "7045", "service"] },
  { phrases: ["run key", "runonce", "autorun", "autostart", "auto start"], add: ["run", "keys", "t1547.001"] },
  { phrases: ["remote desktop", "rdp session"], add: ["rdp", "1149", "t1021.001"] },
  { phrases: ["account lockout", "locked out", "lockout"], add: ["4740", "lockout"] },
  { phrases: ["log tampering", "anti forensics", "antiforensics", "disable logging"], add: ["1102", "4719", "t1562.002"] },
  { phrases: ["disable defender", "antivirus disabled", "av disabled", "turn off defender"], add: ["defender", "5001", "t1562.001"] },
  { phrases: ["process creation", "process execution", "command line logging"], add: ["4688", "process"] },
  { phrases: ["wmi persistence", "event subscription", "wmi subscription"], add: ["t1546.003", "wmi", "subscription"] },
  { phrases: ["border gateway protocol", "route hijack", "route leak"], add: ["bgp", "routing", "network"] },
  { phrases: ["active directory", "ad ds", "domain services"], add: ["identity", "kerberos", "ldap"] },
  { phrases: ["linux logs", "system journal", "journald"], add: ["journalctl", "linux", "logging"] },
  { phrases: ["linux audit", "audit daemon"], add: ["auditd", "linux", "audit"] },
  { phrases: ["web traffic", "web protocol"], add: ["http", "tls", "network"] }
];

// Broad topic words that should trigger grouped results rather than a single
// "the answer" card. Mapped to the entry category they gather.
export const BROAD_TERMS = {
  persistence: "persistence",
  authentication: "authentication",
  auth: "authentication",
  kerberos: "kerberos",
  execution: "execution",
  powershell: "powershell",
  "defense evasion": "defense-evasion",
  evasion: "defense-evasion",
  "credential access": "credential-access",
  credentials: "credential-access",
  "lateral movement": "lateral-movement",
  forensics: "forensics",
  forensic: "forensics",
  artifacts: "forensics",
  artefacts: "forensics",
  sysmon: "sysmon",
  registry: "registry",
  network: "network",
  identity: "identity",
  linux: "endpoint",
  cloud: "cloud",
  protocols: "network",
  utilities: "endpoint"
};

// Expand a raw query into { tokens, phrase, codes, broadCategory }.
//   tokens       , normalized query tokens plus any synonym anchors
//   phrase       , the normalized query as one string (for substring matches)
//   codes        , event-id / ATT&CK-id candidates pulled from the query
//   broadCategory, a category slug when the query is a broad topic word
export function expandQuery(raw) {
  const phrase = normalize(raw);
  const originalTokens = tokenize(raw);
  const tokens = new Set(originalTokens);

  for (const rule of SYNONYMS) {
    if (rule.phrases.some((needle) => phrase.includes(needle))) {
      for (const extra of rule.add) tokens.add(extra);
    }
  }

  const codes = new Set();
  // Only identifiers typed by the user receive exact-code weighting. Numeric
  // hints introduced by synonym expansion remain useful search tokens, but
  // must not outrank an exact title such as PsExec.
  for (const token of originalTokens) {
    // Numeric event ids (1–5 digits) and ATT&CK ids (t1110 / t1110.003).
    if (/^\d{1,5}$/.test(token)) codes.add(token);
    const attack = token.match(/^t\d{4}(?:\.\d{3})?$/);
    if (attack) codes.add(token);
  }

  return {
    phrase,
    tokens: Array.from(tokens),
    codes: Array.from(codes),
    broadCategory: BROAD_TERMS[phrase] || null
  };
}

// Bounded Levenshtein distance, returns a number > max as soon as the cost is
// known to exceed max, so callers can cheaply gate on "within 1 edit".
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

// A short token matches a target token if it is a prefix (typing "kerber" ->
// "kerberos") or within one edit for words long enough to make that safe.
export function fuzzyTokenMatch(queryToken, targetToken) {
  if (!queryToken || !targetToken) return false;
  if (queryToken.length >= 3 && targetToken.startsWith(queryToken)) return true;
  // Edit-distance tolerance only for word-like tokens, never for numeric
  // codes, where "4624" and "4634" are one edit apart but entirely different
  // events.
  if (queryToken.length >= 4 && targetToken.length >= 4 && /[a-z]/.test(queryToken) && /[a-z]/.test(targetToken)) {
    return editDistance(queryToken, targetToken, 1) <= 1;
  }
  return false;
}
