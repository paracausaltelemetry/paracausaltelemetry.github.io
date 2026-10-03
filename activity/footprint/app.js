const PHOTOS = [
  ["IMG_20260529_064112.jpg", "Boarding pass. Captioned “last admin before we fly”."],
  ["selfie_crop.jpg", "Cropped selfie in kit. Posted with “game face on”."],
  ["IMG_20260523_214706.jpg", "Night out. “last one before the trip.”"],
  ["IMG_20260512_063355.jpg", "Before morning PT. “early start.”"],
  ["IMG_20260606_083210.jpg", "A sign near camp. “middle of nowhere.”"],
  ["IMG_20260524_101533.jpg", "Race kit on the table. “new PB before I pack.”"]
];
const grid = document.getElementById('pgrid');
grid.innerHTML = PHOTOS.map(p => `<figure class="pcard"><img loading="lazy" src="photos/${p[0]}" alt="Reconstructed photo ${p[0]}"><figcaption class="cap"><div class="fn">${p[0]}</div><div class="ct">${p[1]}</div></figcaption></figure>`).join('');

const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.panel')];
function show(name){
  tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.p === name));
  panels.forEach(p => p.hidden = p.dataset.panel !== name);
  try { history.replaceState(null, '', '#' + name); } catch(e){}
}
tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.p)));
const start = (location.hash || '').replace('#','');
if (PHOTOS && tabs.some(t => t.dataset.p === start)) show(start);

/* archive served as a direct file on this host */
