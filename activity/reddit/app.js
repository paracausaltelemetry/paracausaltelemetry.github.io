"use strict";
/* Mock forum profile: posts, comment history and expandable threads. Training exercise only. */

const SUBC = { army:"#4b5320", homelab:"#0079d3", oscp:"#b4233a", running:"#ff8717", CasualUK:"#7a1fa2", Garmin:"#007cc3",
  arma:"#6b5b2e", JoinSquad:"#3d6e3d", FantasyPL:"#37003c", buildapc:"#2a6fdb", cybersecurity:"#0d7d6c", soccer:"#2e7d32",
  AskUK:"#c2185b", travel:"#00897b", MechanicalKeyboards:"#455a64", selfhosted:"#5c6bc0", hiking:"#558b2f",
  UKPersonalFinance:"#00695c", StardewValley:"#8bc34a", BaldursGate3:"#6d4c41" };

/* newest first. th = key into THREADS */
const POSTS = [
  { s:"AskUK", age:"3 wk. ago", up:41, n:58, t:"What actually travels well in a parcel? Sending one back home",
    b:"Partner wants to send a care package and asked what to put in. Away with work, so it goes the forces post route rather than normal Royal Mail. What survives a week or two in transit?", th:"parcel" },
  { s:"running", age:"1 mo. ago", up:23, n:31, t:"Treadmill boredom: what do you watch?",
    b:"Stuck on a gym treadmill most evenings for a while. Out of box sets. Go.", th:"tread" },
  { s:"FantasyPL", age:"1 mo. ago", up:6, n:14, f:"Team help", t:"Wildcard now or hold till after the international break?",
    b:"Two red flags in defence and Haaland on the bench because I'm an idiot. Rate my mess.", th:"fpl" },
  { s:"travel", age:"2 mo. ago", up:18, n:22, t:"Tallinn for a long weekend: worth it on a budget?",
    b:"Got a few days off coming. Old town, decent food, somewhere to watch the football. Anything I shouldn't miss?", th:"tallinn" },
  { s:"oscp", age:"4 mo. ago", up:84, n:37, f:"Advice", t:"Realistic to prep for OSCP while deployed for ~6 months?",
    b:"Off on a NATO tour from the summer, evenings and dodgy camp wifi only. How do people keep lab time up away from a proper setup? Trying not to lose momentum before I transfer.", th:"oscp" },
  { s:"homelab", age:"5 mo. ago", up:212, n:44, f:"LabPorn", t:"Rebuilt the AD lab before I disappear for a bit",
    b:"Proxmox box, pfSense, a Windows DC and a couple of victims. Wanted it solid before I go away with work for a while. Rack pic in the comments.", th:"homelab" },
  { s:"running", age:"5 mo. ago", up:46, n:22, t:"Keeping 10k pace over a long stint away from home",
    b:"Run with a local club normally, round town most days. Away with work for a good while and mostly stuck on a treadmill now. How do you not lose fitness?", th:"running" },
  { s:"Garmin", age:"6 mo. ago", up:112, n:39, f:"Question", t:"Does the privacy zone hide every run start, or just home?",
    b:"Forerunner 255. Set a privacy zone round the house years ago. Does that cover runs that start from work or anywhere else? Asking for, er, reasons.", th:"privacy" },
  { s:"army", age:"6 mo. ago", up:31, n:19, t:"Cold weather running kit for six months away?",
    b:"Posted somewhere cold from the summer. Trying to keep a 10k ticking over below zero. What actually works, base layers and all that?", th:"army" },
  { s:"cybersecurity", age:"6 mo. ago", up:58, n:29, f:"Career", t:"Moving from a non-technical army role into cyber, worth it?",
    b:"Currently infantry, want to transfer to a cyber trade. Doing CTFs and OSCP prep in my own time. Anyone made a similar jump from the green army? How did selection go?", th:"cyber" },
  { s:"buildapc", age:"7 mo. ago", up:14, n:23, t:"Is a 750W PSU enough for a 4070 Super?",
    b:"Upgrading the GPU in the main rig. Current PSU is a 750W Gold. Overkill, fine, or push the boat out?", th:"psu" },
  { s:"arma", age:"7 mo. ago", up:67, n:18, f:"Zeus", t:"How do you stop AI being suicidal in towns?",
    b:"Running a 40-slot op on Saturdays. AI keep sprinting into the open like it owes them money. Modules, mods, sacrifices?", th:"arma" },
  { s:"CasualUK", age:"8 mo. ago", up:308, n:141, t:"Greggs have changed the sausage roll pastry and I'm not okay",
    b:"That is all. Thoughts?", th:"greggs" },
  { s:"JoinSquad", age:"8 mo. ago", up:29, n:16, t:"SL tips for a casual squad who all have mics but never use them",
    b:"Nine blokes, nine mics, total silence. How do you get people talking without being a drill sergeant about it?", th:"squad" },
  { s:"soccer", age:"9 mo. ago", up:52, n:87, t:"[Highlights] another VAR shambles at the weekend",
    b:"How is that not a clear and obvious error. Every single week.", th:"var" },
  { s:"selfhosted", age:"9 mo. ago", up:33, n:21, t:"Pi-hole on the lab network: worth the faff?",
    b:"Already running pfSense. Is it worth adding a Pi-hole too or just use pfBlockerNG?", th:"pihole" },
  { s:"MechanicalKeyboards", age:"10 mo. ago", up:19, n:12, t:"First custom build, tactiles on a 65%",
    b:"Gateron browns, lubed, on a cheap hot-swap board. Sounds lovely. Hooked already.", th:"keeb" },
  { s:"BaldursGate3", age:"10 mo. ago", up:204, n:33, f:"Meme", t:"Me every time Lae'zel opens her mouth at camp",
    b:"[image]", th:"bg3" },
  { s:"UKPersonalFinance", age:"11 mo. ago", up:8, n:27, t:"Overpay the mortgage or max the LISA on a forces salary?",
    b:"Late twenties, steady job, small mortgage with my partner. Is overpaying daft when the LISA bonus is sat there?", th:"lisa" },
  { s:"hiking", age:"1 yr. ago", up:27, n:19, t:"Pen-y-ghent or Ingleborough for a first go at the Three Peaks?",
    b:"Training for the full thing in the summer. Which one do you start with to not hate your life?", th:"peaks" },
  { s:"StardewValley", age:"1 yr. ago", up:96, n:11, t:"Perfection. 212 hours. My partner has stopped speaking to me",
    b:"Worth it.", th:"sdv" }
];

/* [author, text, replies?]; author "OP" = j_hollis87 */
const THREADS = {
  oscp: [
    ["sec_student", "Which op, if you can say?", [["OP", "Can't give specifics, about six months, evenings and rubbish camp wifi only."]]],
    ["tryharder_tom", "Download the PG Practice boxes before you go and run them locally. Don't rely on the VPN."],
    ["blueteamer", "Did mine on rotation. Notes discipline matters more than lab hours."]
  ],
  homelab: [
    ["labrat", "Nice setup. What's your DC hostname convention?", [["OP", "Keeping it simple, nothing fancy. Build notes are on my github, same handle as here."]]],
    ["cable_mgmt_pls", "Rack pic or it didn't happen"],
    ["proxmox_pete", "Back up the pfSense config somewhere off the box before you go. Ask me how I know."]
  ],
  cyber: [
    ["blueteam_dad", "What's your current role, out of interest?", [["OP", "Infantry, 3 DALES. Trying to jump ship into a cyber trade before I sign off."]]],
    ["ex_sigs", "The aptitude is mostly logic and networking basics. You'll be fine if you're already doing CTFs."]
  ],
  running: [
    ["fellhead", "Whereabouts do you run normally?", [["OP", "From camp in the week, round town at weekends. Nothing exciting."]]],
    ["intervals_ian", "Treadmill at 1% incline, one interval session a week, one long slow one. You'll keep most of it."]
  ],
  army: [
    ["squaddie99", "Enjoy it out there, it's grim in the winter.", [["OP", "Cheers. Counting the days already."]]],
    ["arctic_al", "Merino base layer, buff, decent gloves. Don't overdress, you'll sweat and freeze."],
    ["rlc_rob", "Spikes or yaktrax for the ice. Ankles are not a renewable resource."]
  ],
  privacy: [
    ["garmin_guru", "It only hides the bit of the track inside the zone, and only around the address you set. Runs that start anywhere else are fully public.", [["OP", "Ah. So every run from work is just... there. Brilliant."]]],
    ["opsec_olly", "Also check whether your old activities were uploaded before you made the zone. Those aren't retroactively trimmed."],
    ["casual_carl", "Just set the whole profile to followers only mate"]
  ],
  parcel: [
    ["auntie_val", "Proper teabags, Haribo, Monster Munch, a decent paperback. Nothing that melts."],
    ["ex_navy_neil", "BFPO is free up to 2kg I think, check the current rules. Takes a week or two.", [["OP", "Cheers. Partner's sorting it this weekend, I'll pass it on."]]],
    ["sparkle_jen", "Baby wipes. Trust me."]
  ],
  tread: [
    ["netflix_nat", "Ozark. You'll forget you're running."],
    ["podcast_paul", "Podcasts, not telly. Then you can't see the clock.", [["OP", "Fair. Camp wifi won't stream anything anyway."]]]
  ],
  tallinn: [
    ["balticbackpacker", "Old town is tiny, do it in a day. Telliskivi for food, and get a seat in a bar early on match days."],
    ["eurorailer", "Trains are cheap and easy if you're coming in from elsewhere in the country.", [["OP", "Perfect, that's exactly what I'll be doing."]]]
  ],
  psu: [
    ["psu_tier_list", "750W Gold is plenty. Check the actual model on the tier list though."]
  ],
  fpl: [["triple_c_tom", "Wildcard now, those two aren't coming back."], ["benchboost_bev", "Hold. Never wildcard in a panic."]],
  arma: [["zeus_main", "Garrison module plus LAMBS. Life changing."], ["milsim_mo", "Turn the AI skill down, honestly. Makes them less psychic and less suicidal."]],
  greggs: [["pastry_purist", "It's flakier now and I hate that I agree with you."], ["northern_nan", "Ring them. I did.", [["OP", "Absolute hero."]]], ["vegan_vince", "Vegan one is still perfect, just saying."]],
  squad: [["sl_steve", "Give everyone a job in the first two minutes. People talk when they've got something to report."]],
  var: [["neutral_ned", "Clear and obvious means whatever they want it to mean that week."], ["refwatch", "Lines were drawn on the wrong defender's foot. Again."]],
  pihole: [["dns_dave", "pfBlockerNG does the job if you're already on pfSense. One less box to patch."]],
  keeb: [["thock_lord", "Wait till you try a gasket mount. Your wallet is in danger."]],
  bg3: [["tav_enjoyer", "\"I am a GITH\" every five minutes."]],
  lisa: [["ukpf_regular", "LISA first, the 25% bonus beats any mortgage rate. Check the wiki flowchart."], ["forces_fin", "Also look at Forces Help to Buy if you haven't used it."]],
  peaks: [["fell_fan", "Pen-y-ghent first, clockwise from Horton. Ingleborough last is a killer though."]],
  sdv: [["junimo_jo", "My partner left me for less. Congrats."]]
};

const COMMENTS = [
  { s:"AskUK", on:"What actually travels well in a parcel? Sending one back home", age:"3 wk. ago", pts:12, t:"Cheers. Partner's sorting it this weekend, I'll pass it on." },
  { s:"running", on:"Treadmill boredom: what do you watch?", age:"1 mo. ago", pts:4, t:"Fair. Camp wifi won't stream anything anyway." },
  { s:"FantasyPL", on:"Rate my team, GW5", age:"1 mo. ago", pts:3, t:"Salah captain every week, no regrets, no notes." },
  { s:"travel", on:"Tallinn for a long weekend: worth it on a budget?", age:"2 mo. ago", pts:2, t:"Perfect, that's exactly what I'll be doing." },
  { s:"CasualUK", on:"What's the most Yorkshire thing you've ever overheard?", age:"3 mo. ago", pts:211, t:"Bloke in a chippy: \"is the gravy free?\" \"No.\" \"Then I'll have it on the side.\"" },
  { s:"oscp", on:"Realistic to prep for OSCP while deployed for ~6 months?", age:"4 mo. ago", pts:31, t:"Can't give specifics, about six months, evenings and rubbish camp wifi only." },
  { s:"homelab", on:"Rebuilt the AD lab before I disappear for a bit", age:"5 mo. ago", pts:58, t:"Cheers. All my configs and the build notes are on my github if anyone wants them, same username. Dotfiles repo has the pfSense bits." },
  { s:"running", on:"Where do you run when you're posted away?", age:"5 mo. ago", pts:17, t:"From camp in the week, round town at the weekend when I'm home. The riverside loop is the best of it." },
  { s:"Garmin", on:"Does the privacy zone hide every run start, or just home?", age:"6 mo. ago", pts:44, t:"Ah. So every run from work is just... there. Brilliant." },
  { s:"army", on:"Kit you'd actually buy with your own money", age:"6 mo. ago", pts:23, t:"Decent socks. Everything else the issue stuff gets you through, feet don't." },
  { s:"AskUK", on:"What's the worst train station in the country?", age:"7 mo. ago", pts:9, t:"Darlington at 6am waiting for a connection is a special kind of purgatory." },
  { s:"buildapc", on:"Is a 750W PSU enough for a 4070 Super?", age:"7 mo. ago", pts:5, t:"Ordered a new one anyway. Couldn't help myself." },
  { s:"cybersecurity", on:"Are certs worth it in 2026?", age:"8 mo. ago", pts:14, t:"Do the CTFs and write them up. Nobody cares about the cert until the interview, and then they only care that you can explain it." },
  { s:"arma", on:"Share your best Zeus moment", age:"8 mo. ago", pts:76, t:"Dropped a single cow on the objective from 2km up. Squad still talk about it." },
  { s:"soccer", on:"Post-match thread: Leeds United", age:"9 mo. ago", pts:-4, t:"They will break my heart again and I will let them." },
  { s:"MechanicalKeyboards", on:"What lube for tactiles?", age:"10 mo. ago", pts:6, t:"Krytox 205g0, thin coat on the stem rails only. Don't drown them." },
  { s:"selfhosted", on:"What's the one service you'd never get rid of?", age:"11 mo. ago", pts:19, t:"Uptime Kuma. Set it and forget it." }
];

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sub = s => '<span class="sub"><i style="--c:' + (SUBC[s] || "#5f6b73") + '" aria-hidden="true">r/</i>r/' + esc(s) + "</span>";
const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="up" d="M12 4l7 8h-4v8H9v-8H5z"/></svg>';
const CM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

function reply(c) {
  const who = c[0] === "OP" ? '<b class="op">j_hollis87</b> &middot; OP' : "<b>" + esc(c[0]) + "</b>";
  return '<div class="rc"><div class="a">' + who + "</div><p>" + esc(c[1]) + "</p>" + (c[2] || []).map(reply).join("") + "</div>";
}

const postsEl = document.getElementById("posts");
POSTS.forEach((p, i) => {
  const id = "th-" + i;
  const hasThread = !!THREADS[p.th];
  postsEl.insertAdjacentHTML("beforeend",
    '<article class="post">' +
      '<div class="meta">' + sub(p.s) + "<span>&middot; " + esc(p.age) + "</span></div>" +
      "<h2>" + (p.f ? '<span class="flair">' + esc(p.f) + "</span>" : "") + esc(p.t) + "</h2>" +
      "<p>" + esc(p.b) + "</p>" +
      '<div class="pfoot">' +
        '<button type="button" class="pill vote" aria-pressed="false" aria-label="Upvote, ' + p.up + ' points" data-n="' + p.up + '">' + UP + '<span>' + p.up + "</span></button>" +
        (hasThread
          ? '<button type="button" class="pill" aria-expanded="false" aria-controls="' + id + '" data-th="' + p.th + '">' + CM + p.n + " comments</button>"
          : '<span class="pill">' + CM + p.n + " comments</span>") +
        '<button type="button" class="pill share">Share</button>' +
      "</div>" +
      (hasThread ? '<div class="thread" id="' + id + '" hidden></div>' : "") +
    "</article>");
});
document.getElementById("postCount").textContent = "· " + POSTS.length + " posts";

postsEl.addEventListener("click", e => {
  const vote = e.target.closest(".vote");
  if (vote) {
    const on = vote.getAttribute("aria-pressed") !== "true";
    vote.setAttribute("aria-pressed", String(on));
    vote.querySelector("span").textContent = Number(vote.dataset.n) + (on ? 1 : 0);
    return;
  }
  if (e.target.closest(".share")) {
    const url = "https://www.reddit.com/user/j_hollis87/";
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    if (window.mock) window.mock.toast("Link copied");
    return;
  }
  const title = e.target.closest(".post h2");
  const btn = title ? title.parentElement.querySelector("button[data-th]") : e.target.closest("button[data-th]");
  if (!btn) return;
  const box = document.getElementById(btn.getAttribute("aria-controls"));
  const open = btn.getAttribute("aria-expanded") === "true";
  if (!open && !box.childElementCount) box.insertAdjacentHTML("beforeend", THREADS[btn.dataset.th].map(reply).join(""));
  box.hidden = open;
  btn.setAttribute("aria-expanded", String(!open));
});

const cmtEl = document.getElementById("comments");
COMMENTS.forEach(c => {
  cmtEl.insertAdjacentHTML("beforeend",
    '<article class="cmt"><div class="ctx">' + sub(c.s) + " &middot; <b>j_hollis87</b> commented on <b>" + esc(c.on) + "</b> &middot; " + esc(c.age) + "</div>" +
    "<p>" + esc(c.t) + '</p><div class="pts">' + c.pts + " points</div></article>");
});
document.getElementById("cmtCount").textContent = "· " + COMMENTS.length + " comments";

const rfollow = document.getElementById("rfollow");
if (rfollow) rfollow.addEventListener("click", () => {
  const on = rfollow.getAttribute("aria-pressed") !== "true";
  rfollow.setAttribute("aria-pressed", String(on));
  rfollow.textContent = on ? "Following" : "Follow";
  if (window.mock) window.mock.toast(on ? "You are now following u/j_hollis87" : "Unfollowed u/j_hollis87");
});

/* tabs */
const tabs = [...document.querySelectorAll(".tab")];
function show(tab, focus) {
  tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => show(t));
  t.addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    show(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length], true);
  });
});
