const PHOTOS = [
  ["IMG_20260529_064112.jpg", "Boarding pass. Captioned “last admin before we fly”."],
  ["selfie_crop.jpg", "Cropped selfie in kit. Posted with “game face on”."],
  ["IMG_20260523_214706.jpg", "Night out. “last one before the trip.”"],
  ["IMG_20260512_063355.jpg", "Before morning PT. “early start.”"],
  ["IMG_20260606_083210.jpg", "A sign near camp. “middle of nowhere.”"],
  ["IMG_20260524_101533.jpg", "Race kit on the table. “new PB before I pack.”"]
];
const grid = document.getElementById('pgrid');
PHOTOS.forEach(([file, caption]) => {
  const fig = document.createElement('figure'); fig.className = 'pcard';
  const img = document.createElement('img');
  img.loading = 'lazy'; img.src = 'photos/' + file + '?v=heatmap5'; img.alt = 'Reconstructed photo ' + file;
  const cap = document.createElement('figcaption'); cap.className = 'cap';
  const fn = document.createElement('div'); fn.className = 'fn'; fn.textContent = file;
  const ct = document.createElement('div'); ct.className = 'ct'; ct.textContent = caption;
  cap.append(fn, ct); fig.append(img, cap); grid.appendChild(fig);
});

/* tabs: click, plus arrow/Home/End keys per the ARIA tabs pattern */
const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.panel')];
function show(name, focus){
  tabs.forEach(t => {
    const on = t.dataset.p === name;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  panels.forEach(p => p.hidden = p.dataset.panel !== name);
  try { history.replaceState(null, '', '#' + name); } catch(e){}
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => show(t.dataset.p));
  t.addEventListener('keydown', e => {
    const k = e.key;
    let j = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : null;
    if (j === null) return;
    e.preventDefault();
    j = (j + tabs.length) % tabs.length;
    show(tabs[j].dataset.p, true);
  });
});
const start = (location.hash || '').replace('#','');
if (tabs.some(t => t.dataset.p === start)) show(start);

/* guest-view interactions */
const connect = document.getElementById('connect');
if (connect) connect.addEventListener('click', () => {
  const on = connect.getAttribute('aria-pressed') !== 'true';
  connect.setAttribute('aria-pressed', String(on));
  connect.textContent = on ? 'Pending' : 'Connect';
  if (window.mock) window.mock.toast(on ? 'Invitation sent to Jamie Hollis' : 'Invitation withdrawn');
});
document.querySelectorAll('.person').forEach(el => {
  const name = (el.querySelector('b') || {}).textContent || 'this profile';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('data-mock-title', name);
  el.setAttribute('data-mock', 'Full profiles are only visible to signed-in members.');
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
});
