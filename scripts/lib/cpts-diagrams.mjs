/*
 * Inline SVG diagrams for the CPTS interactive maps. Each diagram is a single
 * <figure class="cpts-dg"> with a themed SVG: boxes use the site's own tokens
 * (var(--surface), var(--line), var(--text), var(--accent-blue)) via classes in
 * cpts/password-cracking/pc-map.css, so light/dark follow for free. Interaction
 * is pure CSS (hover dims the rest; a :has() toggle on the stores diagram drops
 * the domain database), so the diagrams work with scripts off. Nodes are links
 * (<a href="#...">) that jump to the matching command node on the page.
 *
 * A diagram is attached to a phase by adding "diagram": "<id>" to that phase in
 * the map's JSON; the builder calls diagramBlock(id) and injects it above the
 * phase's node tree. diagramIds lists the known ids for validation.
 */

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// A two-line node: a rounded box with a title and a muted subtitle, wrapped in a
// link to its command node. extra adds classes (e.g. dg-domain for the toggle).
const node = (href, x, y, w, h, title, sub, extra = "") => {
  const cx = x + w / 2;
  return `<a class="dg-node${extra ? ` ${extra}` : ""}" href="${esc(href)}">
      <rect class="dg-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"></rect>
      <text class="dg-t" x="${cx}" y="${y + (sub ? 23 : h / 2 + 5)}" text-anchor="middle">${esc(title)}</text>
      ${sub ? `<text class="dg-s" x="${cx}" y="${y + 41}" text-anchor="middle">${esc(sub)}</text>` : ""}
    </a>`;
};

const arrow = (x1, y1, x2, y2) => `<line class="dg-arr" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#dg-arrow)"></line>`;
const elbow = (x1, y1, xm, y2, x2) => `<path class="dg-arr" d="M${x1} ${y1} H${xm} V${y2} H${x2}" marker-end="url(#dg-arrow)"></path>`;

const marker = `<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></marker></defs>`;

const figure = ({ label, svg, caption, toggle = "" }) =>
  `<figure class="cpts-dg" role="group" aria-label="${esc(label)}">
    ${toggle}
    ${svg}
    ${caption ? `<figcaption class="cpts-dg-cap">${caption}</figcaption>` : ""}
  </figure>`;

/* ---------- Windows credential stores (password-cracking map) ---------- */
const winStores = () => {
  const r1 = 96;
  const r2 = 174;
  const svg = `<svg class="cpts-dg-svg" viewBox="0 0 680 300" role="img" preserveAspectRatio="xMidYMid meet">
    <title>Where Windows keeps credentials</title>
    <desc>The six Windows credential stores grouped by on-disk hives, LSASS memory, the per-user vault and the domain database, each linking to how it is dumped.</desc>
    ${marker}
    <text class="dg-head" x="340" y="40" text-anchor="middle">Where Windows keeps credentials</text>
    <rect class="dg-frame" x="40" y="60" width="600" height="192" rx="16"></rect>
    ${node("#pcnode-wc-sam", 60, r1, 170, 56, "SAM hive", "Local NT hashes")}
    ${node("#pcnode-wc-hives", 250, r1, 170, 56, "SECURITY hive", "LSA secrets, DCC2")}
    ${node("#pcnode-wc-lsass-attack", 440, r1, 170, 56, "LSASS memory", "Live session creds")}
    ${node("#pcnode-wc-credman", 60, r2, 170, 56, "Credential Manager", "Saved logins (DPAPI)")}
    ${node("#pcnode-wc-dpapi", 250, r2, 170, 56, "DPAPI", "Per-user crypto keys")}
    ${node("#pcnode-wc-ntds", 440, r2, 170, 56, "NTDS.dit", "All domain hashes", "dg-domain")}
  </svg>`;
  const toggle = `<label class="cpts-dg-toggle"><input type="checkbox" class="dg-wg"> Workgroup host (no domain database)</label>`;
  return figure({
    label: "Diagram: where Windows keeps credentials",
    svg, toggle,
    caption: "Hover a store to focus it, tick <em>workgroup</em> to drop the domain database, or select one to jump to the commands that dump it."
  });
};

/* ---------- Lateral movement: hash, key or certificate to access ---------- */
const lateralFlow = () => {
  const svg = `<svg class="cpts-dg-svg" viewBox="0 0 680 286" role="img" preserveAspectRatio="xMidYMid meet">
    <title>From a captured secret to access</title>
    <desc>An NTLM hash leads to Pass-the-Hash; an AES key to OverPass-the-Hash and a certificate to PKINIT both yield a Kerberos ticket granting ticket, then Pass-the-Ticket and onward access.</desc>
    ${marker}
    <text class="dg-rl" x="78" y="34" text-anchor="middle">Captured</text>
    <text class="dg-rl" x="268" y="34" text-anchor="middle">Technique</text>
    <text class="dg-rl" x="590" y="34" text-anchor="middle">Access</text>
    ${node("#pcnode-pth-what", 24, 52, 108, 44, "NTLM hash", "")}
    ${node("#pcnode-ptt-overpass", 24, 120, 108, 44, "AES key", "")}
    ${node("#pcnode-ptc-concept", 24, 188, 108, 44, "X.509 cert", "")}
    ${node("#pcnode-pth-mimikatz", 186, 52, 164, 44, "Pass-the-Hash", "")}
    ${node("#pcnode-ptt-overpass", 186, 120, 164, 44, "OverPass-the-Hash", "")}
    ${node("#pcnode-ptc-tgt", 186, 188, 164, 44, "PKINIT", "")}
    ${node("#pcnode-ptt-concept", 404, 142, 96, 56, "Kerberos TGT", "", "dg-accent")}
    ${node("#pcnode-ptt-use-win", 540, 142, 116, 56, "Pass-the-Ticket", "")}
    ${node("#pcnode-ptc-tgt", 540, 52, 116, 44, "Act as user, DCSync", "")}
    ${arrow(132, 74, 182, 74)}
    ${arrow(132, 142, 182, 142)}
    ${arrow(132, 210, 182, 210)}
    ${elbow(350, 74, 377, 74, 536)}
    ${elbow(350, 142, 388, 170, 400)}
    ${elbow(350, 210, 388, 170, 400)}
    ${arrow(500, 170, 536, 170)}
    ${elbow(598, 142, 598, 100, 598)}
  </svg>`;
  return figure({
    label: "Diagram: from a captured secret to access",
    svg,
    caption: "A hash passes straight through; a key or a certificate becomes a Kerberos ticket first. Select a step to jump to it."
  });
};

/* ---------- Linux privilege escalation paths ---------- */
const linuxPrivesc = () => {
  const ys = [52, 108, 164, 220, 276, 332];
  const items = [
    ["#pcnode-pe-suid", "SUID / SGID", "find -perm -4000"],
    ["#pcnode-pe-sudo", "sudo + GTFOBins", "sudo -l"],
    ["#pcnode-pe-caps", "Capabilities", "getcap -r /"],
    ["#pcnode-pe-cron", "Writable cron", "root job you can edit"],
    ["#pcnode-pe-path", "PATH abuse", "hijack a called binary"],
    ["#pcnode-pe-kernel", "Kernel exploit", "suggester + CVE"]
  ];
  const left = items.map(([href, t, s], i) => node(href, 24, ys[i], 230, 44, t, s)).join("\n    ");
  const rootY = 182;
  const arrows = ys.map((y) => elbow(254, y + 22, 320, rootY + 30, 430)).join("\n    ");
  const svg = `<svg class="cpts-dg-svg" viewBox="0 0 680 400" role="img" preserveAspectRatio="xMidYMid meet">
    <title>Linux privilege-escalation paths to root</title>
    <desc>Six local privilege-escalation primitives, each an independent route from a standard user to root.</desc>
    ${marker}
    <text class="dg-rl" x="139" y="34" text-anchor="middle">Primitive</text>
    ${left}
    ${arrows}
    ${node("#pcnode-pe-scanners", 430, rootY, 210, 60, "root", "any one path is enough", "dg-accent")}
  </svg>`;
  return figure({
    label: "Diagram: Linux privilege-escalation paths to root",
    svg,
    caption: "Each primitive is an independent route to root &mdash; one is enough. Select one to jump to its checks and commands."
  });
};

/* ---------- Windows UAC / integrity ---------- */
const winUac = () => {
  const svg = `<svg class="cpts-dg-svg" viewBox="0 0 680 210" role="img" preserveAspectRatio="xMidYMid meet">
    <title>UAC: medium to high integrity</title>
    <desc>An administrator runs with a filtered medium-integrity token; a UAC bypass lifts a prompt-free path to the full high-integrity token.</desc>
    ${marker}
    ${node("#pcnode-en-whoami", 30, 78, 170, 56, "Standard user", "Medium, not admin")}
    ${node("#pcnode-uac-idea", 255, 78, 170, 56, "Admin, medium", "Filtered token")}
    ${node("#pcnode-uac-fodhelper", 480, 78, 170, 56, "Admin, high", "Full token, SYSTEM-capable", "dg-accent")}
    ${arrow(425, 106, 476, 106)}
    <text class="dg-rl" x="452" y="64" text-anchor="middle">UAC bypass</text>
    <text class="dg-s" x="452" y="150" text-anchor="middle">fodhelper, computerdefaults&hellip; (no prompt)</text>
    <text class="dg-s" x="115" y="150" text-anchor="middle">member of Administrators?</text>
  </svg>`;
  return figure({
    label: "Diagram: UAC medium to high integrity",
    svg,
    caption: "A UAC bypass only unlocks admin rights you already hold &mdash; it is not escalation from a standard user."
  });
};

const DIAGRAMS = {
  "win-stores": winStores,
  "lateral-flow": lateralFlow,
  "linux-privesc": linuxPrivesc,
  "win-uac": winUac
};

export const diagramIds = new Set(Object.keys(DIAGRAMS));
export const diagramBlock = (id) => (DIAGRAMS[id] ? DIAGRAMS[id]() : "");
