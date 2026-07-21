// Danzversity Flyer Maker — frontend (vanilla JS, same-origin API).
// ① Build: template + info + library background + real photo + code chassis → all sizes.
// Advanced (collapsed): drop your own Ideogram masters → all sizes/bundles/Drive.

const API = '';

const FAMILIES = [
  { key: 'A',      label: 'Style A master',      sub: 'text-rich · organic',          channel: 'organic', chk: 'famA' },
  { key: 'A-Lite', label: 'Style A-Lite master', sub: 'photo-dominant · paid',          channel: 'paid',    chk: 'famALite' },
  { key: 'B',      label: 'Style B master',      sub: 'hype',                           channel: 'organic', chk: 'famB' },
];

const state = { files: { 'A': null, 'A-Lite': null, 'B': null }, images: [], template: '', month: '', slug: '', driveConfigured: false, activeTab: 'organic' };
const create = {
  // mode MUST default to 'scene' — the HTML marks that button active. A
  // mismatched default here once shipped a full-bleed flyer while the UI
  // showed "Photo on background" (init bailed mid-deploy before correcting it).
  templates: [], backgrounds: [], people: [], selectedBg: null, bgFile: null, selectedPersonId: null, photoFile: null, mode: 'scene',
  style: { font: 'classic', accent: 'gold', headline: 'accent' },
  styleOptions: null, bgVibes: [],
  aiBgs: [], selectedAiIdx: null, // session-only Ideogram background candidates
};
const LOOKS_KEY = 'dvzFlyerLooks';

// Video mode state — footage library + last compose outputs (token URLs).
const vid = { items: [], selectedId: null, outputs: [], maker: 'flyer' };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  const d = new Date();
  $('month').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  buildDropzones();
  syncFamilyVisibility();
  ['famA', 'famALite', 'famB'].forEach((id) => $(id).addEventListener('change', syncFamilyVisibility));
  $('generateBtn').addEventListener('click', onGenerate);
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('dlAll').addEventListener('click', () => downloadZip(state.images, `${state.slug}_all-flyers.zip`));
  $('dlMeta').addEventListener('click', () => downloadBundle('meta', ['4x5', '1x1', '9x16']));
  $('dlPmax').addEventListener('click', () => downloadBundle('pmax', ['4x5', '1x1', '9x16', '1.91x1']));
  $('saveDrive').addEventListener('click', onSaveDrive);
  $('smartPostBtn').addEventListener('click', onSmartPost);
  initPostDialog();
  checkHealth();
  initCreate();
  initVideo();
}

// ── Maker mode: "What are we making today?" — Flyer | Video ──────────────────
const FLYER_PANELS = ['createPanel', 'resultsPanel', 'inputPanel'];
const VIDEO_PANELS = ['videoPanel', 'videoResults'];
function setMaker(m) {
  vid.maker = m === 'video' ? 'video' : 'flyer';
  document.querySelectorAll('#makerToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.maker === vid.maker));
  // Results panels only reappear if they hold results — never an empty shell.
  FLYER_PANELS.forEach((id) => $(id).classList.toggle('hidden', vid.maker !== 'flyer' || (id === 'resultsPanel' && !state.images.length)));
  VIDEO_PANELS.forEach((id) => $(id).classList.toggle('hidden', vid.maker !== 'video' || (id === 'videoResults' && !vid.outputs.length)));
}

async function checkHealth() {
  try {
    const h = await (await fetch(`${API}/health`)).json();
    $('brandVer').textContent = (h.brandVersion || '11').replace(/\.0\.0$/, '');
    setDriveBadge(h.driveConfigured);
    if (!state.loadedVersion) state.loadedVersion = h.version; // the server version this page was built against
    else if (h.version && h.version !== state.loadedVersion) showUpdateBanner();
  } catch (e) { setDriveBadge(false, true); }
}

// ── Stale-page guard ─────────────────────────────────────────────────────────
// The server redeploying mid-session once left an open tab whose internal
// layout state disagreed with its buttons. Any version drift now demands a
// reload before more work happens.
function showUpdateBanner() {
  if ($('updateBanner')) return;
  const b = el('div', 'update-banner');
  b.id = 'updateBanner';
  b.innerHTML = '⚠ Flyer Maker was updated — reload this page before composing. ';
  const btn = el('button', 'primary sm-reload', 'Reload now'); btn.type = 'button';
  btn.addEventListener('click', () => window.location.reload());
  b.appendChild(btn);
  document.body.prepend(b);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkHealth(); });
function setDriveBadge(configured, errored) {
  const b = $('driveBadge'); state.driveConfigured = !!configured;
  if (errored) { b.textContent = 'API offline'; b.className = 'badge badge-off'; return; }
  b.textContent = configured ? 'Drive: connected' : 'Drive: not configured';
  b.className = 'badge ' + (configured ? 'badge-ok' : 'badge-off');
}

// ── ① COMPOSE ──────────────────────────────────────────────────────────────────
async function initCreate() {
  // Wire EVERY control and settle the default mode BEFORE any network call —
  // a failed or hanging /templates (e.g. the server restarting mid-deploy)
  // must never leave a dead form or a layout state that disagrees with the UI.
  $('tplSelect').addEventListener('change', onTemplateChange);
  $('ctaUrl').addEventListener('blur', () => checkUrl($('ctaUrl').value));
  $('composeBtn').addEventListener('click', onCompose);
  $('uploadBgBtn').addEventListener('click', () => $('bgInput').click());
  $('bgInput').addEventListener('change', onUploadBg);
  $('addPhotoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', onPickPhoto);
  document.querySelectorAll('#modeToggle .seg-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('#headlineToggle .seg-btn').forEach((b) => b.addEventListener('click', () => setStyle({ headline: b.dataset.headline })));
  $('variantsBtn').addEventListener('click', onVariants);
  $('genBgBtn').addEventListener('click', onGenBgs);
  $('saveLookBtn').addEventListener('click', onSaveLook);
  setMode('scene');
  renderLookChips();

  // Load templates with retries (the server may be mid-restart on a deploy).
  let j = null;
  for (let attempt = 1; attempt <= 3 && !j; attempt++) {
    try { j = await (await fetch(`${API}/templates`)).json(); }
    catch (e) { if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt)); }
  }
  if (!j || !j.templates || !j.templates.length) {
    toast('Couldn’t load templates — the server may be restarting. Reload the page in a moment.', 'err');
    return;
  }
  create.templates = j.templates;
  create.styleOptions = j.styles || null;
  create.bgVibes = j.bgVibes || [];
  buildStyleRow();
  buildVibeSelect();
  const sel = $('tplSelect');
  const groups = {}; create.templates.forEach((t) => { (groups[t.group] = groups[t.group] || []).push(t); });
  sel.innerHTML = '';
  Object.keys(groups).forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g;
    groups[g].forEach((t) => { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label + (t.channel === 'paid' ? '  ·  paid' : ''); og.appendChild(o); });
    sel.appendChild(og);
  });
  onTemplateChange();
  loadLibraries();
}

// ── Style packs (fonts / accents / headline) ─────────────────────────────────
function buildStyleRow() {
  if (!create.styleOptions) return;
  const ft = $('fontToggle'); ft.innerHTML = '';
  create.styleOptions.fonts.forEach((f) => {
    const b = el('button', 'seg-btn' + (create.style.font === f.key ? ' active' : ''), f.label);
    b.type = 'button'; b.dataset.font = f.key;
    b.addEventListener('click', () => setStyle({ font: f.key }));
    ft.appendChild(b);
  });
  const sw = $('accentSwatches'); sw.innerHTML = '';
  create.styleOptions.accents.forEach((a) => {
    const b = el('button', 'swatch' + (create.style.accent === a.key ? ' sel' : ''));
    b.type = 'button'; b.title = a.label; b.dataset.accent = a.key; b.style.background = a.hex;
    b.addEventListener('click', () => setStyle({ accent: a.key }));
    sw.appendChild(b);
  });
}
function setStyle(patch) {
  Object.assign(create.style, patch);
  document.querySelectorAll('#fontToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.font === create.style.font));
  document.querySelectorAll('#accentSwatches .swatch').forEach((b) => b.classList.toggle('sel', b.dataset.accent === create.style.accent));
  document.querySelectorAll('#headlineToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.headline === create.style.headline));
}

// ── Saved looks (localStorage) ────────────────────────────────────────────────
function getLooks() { try { return JSON.parse(localStorage.getItem(LOOKS_KEY)) || []; } catch (_) { return []; } }
function setLooks(looks) { localStorage.setItem(LOOKS_KEY, JSON.stringify(looks)); renderLookChips(); }
function onSaveLook() {
  const name = window.prompt('Name this look:', ''); if (!name || !name.trim()) return;
  const looks = getLooks().filter((l) => l.name !== name.trim());
  looks.push({ name: name.trim(), style: { ...create.style }, mode: create.mode });
  setLooks(looks);
  toast(`Look “${name.trim()}” saved.`, 'ok');
}
function renderLookChips() {
  const host = $('lookChips'); host.innerHTML = '';
  getLooks().forEach((l) => {
    const chip = el('span', 'chip');
    const apply = el('button', 'chip-name', l.name); apply.type = 'button';
    apply.title = 'Apply this look';
    apply.addEventListener('click', () => { setStyle({ ...l.style }); if (l.mode) setMode(l.mode); toast(`Look “${l.name}” applied.`, 'ok'); });
    const del = el('button', 'chip-x', '×'); del.type = 'button'; del.title = 'Delete look';
    del.addEventListener('click', () => setLooks(getLooks().filter((x) => x.name !== l.name)));
    chip.appendChild(apply); chip.appendChild(del); host.appendChild(chip);
  });
  $('lookChips').classList.toggle('hidden', !getLooks().length);
}

function currentTemplate() { return create.templates.find((t) => t.key === $('tplSelect').value); }

function onTemplateChange() {
  const t = currentTemplate(); if (!t) return;
  $('ctaUrl').value = t.defaultUrl || ''; checkUrl(t.defaultUrl);
  const host = $('tplFields'); host.innerHTML = '';
  t.fields.forEach((fld) => {
    const lab = el('label', 'field');
    lab.appendChild(document.createTextNode(fld.label + (fld.required ? ' *' : '')));
    const inp = el('input'); inp.type = 'text'; inp.id = 'fld_' + fld.name; inp.placeholder = fld.placeholder || ''; if (fld.default) inp.value = fld.default;
    lab.appendChild(inp); host.appendChild(lab);
  });
  const paid = t.channel === 'paid';
  $('qrToggle').checked = !paid; $('qrToggle').disabled = paid;
  $('composeHint').textContent = paid ? 'paid → photo-dominant, minimal text, no QR' : '';
}

function collectContent() {
  const t = currentTemplate(); const c = {};
  t.fields.forEach((fld) => { const v = $('fld_' + fld.name).value.trim(); if (v) c[fld.name] = v; });
  c.url = $('ctaUrl').value.trim();
  if ($('month') && $('month').value) c.month = $('month').value;
  return c;
}

async function checkUrl(u) {
  const e = $('urlStatus'); if (!u) { e.textContent = ''; return; }
  e.textContent = '· checking'; e.className = 'url-status';
  try { const j = await (await fetch(`${API}/verify-url?u=` + encodeURIComponent(u))).json();
    const good = j.ok && j.status >= 200 && j.status < 400;
    e.textContent = good ? `· ${j.status} ✓` : `· ${j.status || 'fail'} ✗`; e.className = 'url-status ' + (good ? 'ok' : 'bad');
  } catch (_) { e.textContent = '· err'; e.className = 'url-status bad'; }
}

async function loadLibraries() {
  try {
    const [b, p] = await Promise.all([fetch(`${API}/backgrounds`).then((r) => r.json()), fetch(`${API}/people`).then((r) => r.json())]);
    create.backgrounds = b.items || []; create.people = p.items || [];
    $('bgSource').textContent = `(${b.source} · ${create.backgrounds.length})`;
    if (!create.selectedBg && create.backgrounds[0]) create.selectedBg = create.backgrounds[0].id;
    renderBgPicker(); renderPeoplePicker();
  } catch (e) { $('bgPicker').textContent = 'library unavailable'; }
}

function thumb(kind, id) { return `${API}/thumb?kind=${kind}&id=${encodeURIComponent(id)}`; }

function renderBgPicker() {
  const host = $('bgPicker'); host.innerHTML = '';
  if (!create.backgrounds.length && !create.aiBgs.length) host.innerHTML = '<span class="muted">No saved backgrounds — generate one with ✨, upload, or add to the Drive library.</span>';
  // Fresh AI candidates first (session-only until used with "save to library").
  create.aiBgs.forEach((c, i) => {
    const d = el('div', 'thumb-item ai' + (create.selectedAiIdx === i ? ' sel' : '')); d.title = 'AI background (new)';
    d.innerHTML = `<img src="data:image/png;base64,${c.base64}" alt="" loading="lazy"><span class="ai-tag">✨ new</span>`;
    d.addEventListener('click', () => {
      create.selectedAiIdx = i; create.selectedBg = null;
      create.bgFile = b64ToFile(c.base64, `ai-bg-${Date.now()}.png`); // rides the normal upload path
      $('bgChosen').textContent = 'Using new AI background' + ($('saveBg').checked ? ' (will save to library)' : '');
      renderBgPicker();
    });
    host.appendChild(d);
  });
  create.backgrounds.forEach((b) => {
    const d = el('div', 'thumb-item' + (create.selectedBg === b.id && !create.bgFile ? ' sel' : '')); d.title = b.name;
    d.innerHTML = `<img src="${thumb('backgrounds', b.id)}" alt="" loading="lazy">`;
    d.addEventListener('click', () => { create.selectedBg = b.id; create.bgFile = null; create.selectedAiIdx = null; $('bgChosen').textContent = ''; renderBgPicker(); });
    host.appendChild(d);
  });
}

function onUploadBg() {
  const f = $('bgInput').files[0]; if (!f) return;
  create.bgFile = f; create.selectedBg = null; create.selectedAiIdx = null;
  $('bgChosen').textContent = 'Using upload: ' + f.name + ($('saveBg').checked ? ' (will save to library)' : '');
  renderBgPicker();
}

// ── AI backgrounds (Ideogram, per vibe) ──────────────────────────────────────
function buildVibeSelect() {
  const sel = $('bgVibe'); sel.innerHTML = '';
  create.bgVibes.forEach((v) => { const o = document.createElement('option'); o.value = v.key; o.textContent = v.label; sel.appendChild(o); });
  const hasVibes = create.bgVibes.length > 0;
  sel.classList.toggle('hidden', !hasVibes); $('genBgBtn').classList.toggle('hidden', !hasVibes);
}
async function onGenBgs() {
  const btn = $('genBgBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span>Generating…';
  try {
    const r = await (await fetch(`${API}/generate-backgrounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vibe: $('bgVibe').value, count: 4 }) })).json();
    if (!r.ok) throw new Error(r.error || 'generation failed');
    create.aiBgs = r.candidates || []; create.selectedAiIdx = null;
    renderBgPicker();
    toast(`${create.aiBgs.length} new backgrounds — click one to use it.`, 'ok');
  } catch (e) { toast('Background generation failed: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate new'; }
}
function b64ToFile(b64, name) { return new File([b64ToBlob(b64)], name, { type: 'image/png' }); }

function setMode(m) {
  create.mode = ['scene', 'cutout', 'photo'].includes(m) ? m : 'scene';
  const photoMode = create.mode === 'photo';
  document.querySelectorAll('#modeToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === create.mode));
  // Full-bleed needs no separate plate; scene + cutout both composite onto one.
  $('bgBlock').classList.toggle('hidden', photoMode);
  $('photoLabel').innerHTML = photoMode
    ? 'Photo <span class="muted">(fills the whole flyer)</span>'
    : (create.mode === 'cutout'
        ? 'Photo of ONE dancer <span class="muted">(lifted onto the background)</span>'
        : 'Photo <span class="muted">(placed whole onto the background)</span>');
  $('modeHint').textContent = photoMode
    ? 'Your photo IS the flyer — no separate background needed.'
    : (create.mode === 'cutout'
        ? 'Best for a single dancer — they get lifted off their photo onto the background.'
        : 'Best for group / action shots — the whole photo sits in a clean band on the background.');
}

function renderPeoplePicker() {
  const host = $('peoplePicker'); host.innerHTML = '';
  const none = el('div', 'thumb-item none' + (!create.selectedPersonId && !create.photoFile ? ' sel' : '')); none.textContent = 'None';
  none.addEventListener('click', () => { create.selectedPersonId = null; create.photoFile = null; $('photoChosen').textContent = ''; renderPeoplePicker(); });
  host.appendChild(none);
  create.people.forEach((p) => {
    const d = el('div', 'thumb-item' + (create.selectedPersonId === p.id ? ' sel' : '')); d.title = p.name;
    d.innerHTML = `<img src="${thumb('people', p.id)}" alt="" loading="lazy">`;
    d.addEventListener('click', () => { create.selectedPersonId = p.id; create.photoFile = null; $('photoChosen').textContent = ''; renderPeoplePicker(); });
    host.appendChild(d);
  });
}

function onPickPhoto() {
  const f = $('photoInput').files[0]; if (!f) return;
  create.photoFile = f; create.selectedPersonId = null;
  $('photoChosen').textContent = 'Using upload: ' + f.name + ($('savePhoto').checked ? ' (will save to library)' : '');
  renderPeoplePicker();
}

// (direct background upload handled by onUploadBg; saved to library on compose if "save" is checked)

// Validate the Build panel and assemble the multipart body shared by
// /compose and /compose-variants. Returns null (after a toast) when invalid.
function buildComposeFd() {
  const t = currentTemplate(); if (!t) return null;
  const content = collectContent();
  const missing = t.fields.filter((fld) => fld.required && !content[fld.name]);
  if (missing.length) { toast('Fill required: ' + missing.map((m) => m.label).join(', '), 'err'); return null; }
  if (create.mode === 'photo') {
    if (!create.photoFile && !create.selectedPersonId) { toast('Full-bleed: upload or pick a photo.', 'err'); return null; }
  } else if (!create.selectedBg && !create.bgFile) {
    toast('Pick or upload a background.', 'err'); return null;
  }

  // Photo-on-background / cutout without a photo composes the background alone
  // — legal, but usually a slot mix-up. Ask before rendering.
  if (create.mode !== 'photo' && !create.photoFile && !create.selectedPersonId) {
    if (!window.confirm('No photo picked — the background ALONE will fill the flyer.\n\nContinue without a photo?')) return null;
  }

  if (!$('qrToggle').checked) content.qr = false;
  const fd = new FormData();
  fd.append('templateKey', t.key);
  fd.append('content', JSON.stringify(content));
  fd.append('mode', create.mode);
  fd.append('style', JSON.stringify(create.style));
  // Full-bleed uses NO background — never send one (the server rejects the
  // contradictory combo as a stale-client signal).
  if (create.mode !== 'photo') {
    if (create.bgFile) { fd.append('background', create.bgFile); if ($('saveBg').checked) fd.append('saveBg', 'true'); }
    else if (create.selectedBg) fd.append('backgroundId', create.selectedBg);
  }
  if (create.photoFile) { fd.append('photo', create.photoFile); if ($('savePhoto').checked) fd.append('savePhoto', 'true'); }
  else if (create.selectedPersonId) fd.append('personId', create.selectedPersonId);
  return { t, content, fd };
}

async function onCompose() {
  const built = buildComposeFd(); if (!built) return;
  const { t, content, fd } = built;
  $('variants').classList.add('hidden');

  const btn = $('composeBtn'); const orig = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Composing…';
  try {
    const data = await (await fetch(`${API}/compose`, { method: 'POST', body: fd })).json();
    if (!data.ok) throw new Error(data.error || 'compose failed');
    data.template = t.label.replace(/🔥/g, '').trim();
    // Remember what was composed so the post dialog can suggest captions
    // from the flyer's own fields.
    state.lastTemplateKey = t.key; state.lastContent = content;
    renderResults(data);
    if (data.adCopy) renderAdCopy(data.adCopy); else $('adcopy').classList.add('hidden');
    toast(`Composed ${data.counts.total} sizes in ${data.renderMs} ms.`, 'ok');
    $('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { toast('Error: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

// ── 3 looks — fast style/background variants, pick one, full compose ─────────
async function onVariants() {
  const built = buildComposeFd(); if (!built) return;
  const btn = $('variantsBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span>Rendering looks…';
  try {
    const data = await (await fetch(`${API}/compose-variants`, { method: 'POST', body: built.fd })).json();
    if (!data.ok) throw new Error(data.error || 'variants failed');
    renderVariants(data.variants || []);
    toast(`${data.count} looks in ${data.renderMs} ms — pick one.`, 'ok');
  } catch (e) { toast('Error: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '🎲 Show me 3 looks'; }
}
function renderVariants(variants) {
  const host = $('variants'); host.innerHTML = ''; host.classList.remove('hidden');
  variants.forEach((v) => {
    const card = el('div', 'variant');
    card.innerHTML = `<div class="variant-thumb"><img src="data:image/png;base64,${v.base64}" alt=""></div><div class="variant-label">${v.label}</div>`;
    const use = el('button', 'primary', 'Use this look'); use.type = 'button';
    use.addEventListener('click', () => {
      setStyle({ ...v.style });
      if (v.backgroundId && v.backgroundId !== create.selectedBg) { create.selectedBg = v.backgroundId; create.bgFile = null; create.selectedAiIdx = null; renderBgPicker(); }
      host.classList.add('hidden');
      onCompose();
    });
    card.appendChild(use); host.appendChild(card);
  });
}

// ── ② SIZE & SHIP (manual master upload) ───────────────────────────────────────
function buildDropzones() {
  const host = $('masters'); host.innerHTML = '';
  FAMILIES.forEach((f) => {
    const dz = el('div', 'dropzone'); dz.id = `dz_${f.key}`; dz.dataset.fam = f.key;
    dz.innerHTML = `<div class="dz-thumb">+</div><div class="dz-text"><span class="dz-title">${f.label}</span><span class="dz-channel ${f.channel}">${f.channel}</span><span class="dz-sub">${f.sub}</span></div>`;
    const input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    input.addEventListener('change', () => input.files[0] && setMaster(f.key, input.files[0]));
    dz.appendChild(input);
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) setMaster(f.key, file); });
    host.appendChild(dz);
  });
}
function setMaster(famKey, file) {
  state.files[famKey] = file;
  const dz = $(`dz_${famKey}`); dz.classList.add('filled');
  const url = URL.createObjectURL(file);
  dz.querySelector('.dz-thumb').style.backgroundImage = `url(${url})`; dz.querySelector('.dz-thumb').textContent = '';
  dz.querySelector('.dz-sub').textContent = file.name;
}
function syncFamilyVisibility() { FAMILIES.forEach((f) => $(`dz_${f.key}`).classList.toggle('hidden', !$(f.chk).checked)); }
function requestedFamilies() { return FAMILIES.filter((f) => $(f.chk).checked).map((f) => f.key); }

async function onGenerate() {
  const template = $('template').value.trim();
  if (!template) return toast('Enter a template / event name first.', 'err');
  const fams = requestedFamilies(); if (!fams.length) return toast('Pick at least one family.', 'err');
  if (!(state.files['A'] || state.files['A-Lite'] || state.files['B'])) return toast('Drop at least one master image.', 'err');

  const fd = new FormData();
  fd.append('template', template); fd.append('month', $('month').value); fd.append('families', fams.join(','));
  if (state.files['A']) fd.append('masterA', state.files['A']);
  if (state.files['A-Lite']) fd.append('masterALite', state.files['A-Lite']);
  if (state.files['B']) fd.append('masterB', state.files['B']);

  const btn = $('generateBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Generating…';
  try {
    const data = await (await fetch(`${API}/process`, { method: 'POST', body: fd })).json();
    if (!data.ok) throw new Error(data.error || 'Process failed');
    renderResults(data); $('adcopy').classList.add('hidden');
    toast(`Generated ${data.counts.total} images in ${data.renderMs} ms.`, 'ok');
  } catch (e) { toast('Error: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Generate all sizes'; }
}

// ── Results grid (shared by compose + manual) ──────────────────────────────────
function renderResults(data) {
  state.images = data.images; state.slug = data.slug;
  state.template = data.template || data.templateKey || 'flyer';
  state.month = data.month || ($('month') && $('month').value) || '';
  state.driveConfigured = data.driveConfigured;

  const organic = state.images.filter((i) => i.channel === 'organic').length;
  const paid = state.images.filter((i) => i.channel === 'paid').length;

  // Version handshake: a compose answered by a NEWER server than this page
  // loaded from means a deploy happened mid-session — demand a reload.
  if (data.version && state.loadedVersion && data.version !== state.loadedVersion) showUpdateBanner();

  // Say exactly what was composed — layout + which assets — so a wrong slot
  // or wrong mode is visible in one glance, not by squinting at the art.
  const MODE_LABELS = { scene: 'Photo on background', cutout: 'Cutout on background', photo: 'Full-bleed photo' };
  const assetName = (list, idOrName) => { const hit = (list || []).find((x) => x.id === idOrName); return hit ? hit.name : idOrName; };
  let usedLine = data.mode ? ` · <b>${MODE_LABELS[data.mode] || data.mode}</b>` : '';
  if (data.used) {
    if (data.used.background) usedLine += ` · bg: ${assetName(create.backgrounds, data.used.background)}`;
    usedLine += ` · photo: ${data.used.photo ? assetName(create.people, data.used.photo) : '<b>none</b>'}`;
  }

  $('resultsPanel').classList.remove('hidden');
  $('summary').innerHTML = `<b>${state.template}</b>${usedLine} · ${state.images.length} images (${organic} organic, ${paid} paid) · ${data.renderMs} ms`;
  const warn = $('warnings'); warn.innerHTML = ''; (data.warnings || []).forEach((w) => warn.appendChild(el('div', 'note note-warn', '⚠ ' + w)));
  $('cntOrganic').textContent = organic; $('cntPaid').textContent = paid;
  setDriveBadge(data.driveConfigured);
  $('saveDrive').disabled = !data.driveConfigured; $('saveDrive').title = data.driveConfigured ? '' : 'Set GOOGLE_SERVICE_ACCOUNT on the server';
  $('dlMeta').disabled = !paid; $('dlPmax').disabled = !paid;
  setTab(organic ? 'organic' : 'paid');
}
function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  renderGrid();
}
// Where each size can actually go on Meta. Instagram feed rejects/butchers
// wide ratios and 9:16 belongs in Stories — the Post button routes each size
// to its legal placement instead of offering IG everywhere.
const PLACEMENTS = {
  '4x5':       { platforms: ['facebook', 'instagram'], placement: 'feed',  useCaption: true,  btn: '📣 Post',    desc: 'Instagram + Facebook feed' },
  '1x1':       { platforms: ['facebook', 'instagram'], placement: 'feed',  useCaption: true,  btn: '📣 Post',    desc: 'Instagram + Facebook feed' },
  '9x16':      { platforms: ['facebook', 'instagram'], placement: 'story', useCaption: false, btn: '📣 Story',   desc: 'Instagram + Facebook STORY — stories don’t carry captions' },
  '16x9':      { platforms: ['facebook'],              placement: 'feed',  useCaption: true,  btn: '📣 FB only', desc: 'Facebook feed only — too wide for Instagram' },
  '4x3':       { platforms: ['facebook'],              placement: 'feed',  useCaption: true,  btn: '📣 FB only', desc: 'Facebook feed only' },
  'site-card': { platforms: ['facebook'],              placement: 'feed',  useCaption: true,  btn: '📣 FB only', desc: 'Facebook feed only — website asset' },
  '1.91x1':    { platforms: ['facebook'],              placement: 'feed',  useCaption: true,  btn: '📣 FB only', desc: 'Facebook feed only — ad size' },
  // '2x1' email banner: an email asset, not a social one — no Post button.
};

function renderGrid() {
  const grid = $('grid'); grid.innerHTML = ''; const tpl = $('tileTpl').content;
  state.images.map((img, idx) => ({ img, idx })).filter(({ img }) => img.channel === state.activeTab).forEach(({ img, idx }) => {
    const node = tpl.cloneNode(true); const tile = node.querySelector('.tile'); tile.dataset.idx = idx;
    node.querySelector('img').src = `data:image/png;base64,${img.base64}`;
    node.querySelector('.tile-label').textContent = `${img.label} · ${img.family}`;
    node.querySelector('.tile-dims').textContent = `${img.width}×${img.height}`;
    node.querySelector('.dl-one').addEventListener('click', () => downloadOne(img));
    const pl = PLACEMENTS[img.sizeKey];
    const postBtn = node.querySelector('.post-one');
    if (!pl) {
      postBtn.style.display = 'none'; // email banner etc.
    } else {
      postBtn.textContent = pl.btn; postBtn.title = pl.desc;
      postBtn.addEventListener('click', () => openPostDialog([{ img, ...pl }]));
    }
    grid.appendChild(node);
  });
}

// One click, right placements: best feed size → IG+FB feed, 9:16 → Stories.
function onSmartPost() {
  const pick = (key) => state.images.find((i) => i.sizeKey === key && i.channel === 'organic') || state.images.find((i) => i.sizeKey === key);
  const feed = pick('4x5') || pick('1x1');
  const story = pick('9x16');
  const entries = [];
  if (feed) entries.push({ img: feed, ...PLACEMENTS[feed.sizeKey], desc: `Feed post (${feed.label}) — Instagram + Facebook` });
  if (story) entries.push({ img: story, ...PLACEMENTS['9x16'], desc: `Story (${story.label}) — Instagram + Facebook` });
  if (!entries.length) return toast('No postable sizes in this set.', 'err');
  openPostDialog(entries);
}

// ── Social (danzversity-social rail: preview → confirm → send) ──────────────
// One dialog, two clicks: "Preview →" validates with the rail, then the same
// button becomes "Post now" so nothing publishes on a single click.
// post.plan is a list of {img, platforms, placement, useCaption, desc} —
// one entry for a tile's Post button, several for "Publish everywhere".
const post = { plan: [], stage: 'compose' };
function initPostDialog() {
  $('postCancel').addEventListener('click', () => $('postDialog').close());
  $('postSend').addEventListener('click', onPostSend);
  $('suggestBtn').addEventListener('click', onSuggestCaptions);
  // Any edit invalidates a passed preview — force a fresh one.
  ['postCaption', 'pfFb', 'pfIg'].forEach((id) => $(id).addEventListener('input', () => setPostStage('compose')));
}

// ── Caption suggestions — Claude writes options from the flyer's own fields ──
async function onSuggestCaptions() {
  if (!state.lastTemplateKey) return toast('Compose a flyer first — captions are written from its fields.', 'err');
  const btn = $('suggestBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span>Writing…';
  try {
    const r = await (await fetch(`${API}/suggest-captions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey: state.lastTemplateKey, content: state.lastContent || {} }) })).json();
    if (!r.ok) throw new Error(r.error || 'suggestion failed');
    $('suggestSource').textContent = r.source === 'ai' ? '· AI-written — tap one, then edit' : '· from the flyer — tap one, then edit';
    const host = $('captionIdeas'); host.innerHTML = ''; host.classList.remove('hidden');
    r.captions.forEach((c) => {
      const card = el('button', 'caption-idea'); card.type = 'button'; card.textContent = c;
      card.addEventListener('click', () => { $('postCaption').value = c; setPostStage('compose'); });
      host.appendChild(card);
    });
  } catch (e) { toast('Captions failed: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '✨ Suggest captions'; }
}
function setPostStage(stage) {
  post.stage = stage;
  $('postSend').textContent = stage === 'confirm' ? '✓ Preview OK — Post now' : 'Preview →';
}
function openPostDialog(plan) {
  post.plan = plan;
  const first = plan[0];
  $('postImg').src = `data:image/png;base64,${first.img.base64}`;
  $('postMeta').textContent = plan.length === 1
    ? `${first.img.label} · ${first.img.width}×${first.img.height}`
    : `${plan.length} placements, one click`;

  // The plan list — say exactly where each image is going.
  const planHost = $('postPlan'); planHost.innerHTML = '';
  planHost.classList.toggle('hidden', plan.length === 1 && first.placement === 'feed' && first.platforms.length === 2);
  plan.forEach((e) => planHost.appendChild(el('div', 'post-plan-line', `→ ${e.desc}`)));

  // Platform checkboxes: only meaningful for a single feed entry — the plan
  // dictates platforms everywhere else.
  const showChecks = plan.length === 1 && first.placement === 'feed';
  $('pfFb').closest('.post-platforms').style.display = showChecks ? '' : 'none';
  if (showChecks) {
    $('pfFb').checked = first.platforms.includes('facebook'); $('pfFb').disabled = !first.platforms.includes('facebook');
    $('pfIg').checked = first.platforms.includes('instagram'); $('pfIg').disabled = !first.platforms.includes('instagram');
  }

  // Caption: disabled when nothing in the plan carries one (story-only).
  const anyCaption = plan.some((e) => e.useCaption);
  $('postCaption').value = '';
  $('postCaption').disabled = !anyCaption;
  $('postCaption').placeholder = anyCaption ? 'Write the caption…' : 'Stories don’t carry captions';
  $('captionIdeas').classList.add('hidden'); $('captionIdeas').innerHTML = '';
  $('suggestSource').textContent = '';
  // Suggestions are written from the composed flyer's fields — hide the button
  // for Advanced-path masters where no template content exists.
  $('suggestBtn').style.display = (anyCaption && state.lastTemplateKey) ? '' : 'none';

  setPostStage('compose');
  $('postDialog').showModal();
}
async function onPostSend() {
  if (!post.plan.length) return;
  const caption = $('postCaption').value.trim();
  const entries = post.plan.map((e) => ({ ...e }));
  // A single feed entry honors the checkboxes (within its legal platforms).
  if (entries.length === 1 && entries[0].placement === 'feed') {
    const pf = [];
    if ($('pfFb').checked) pf.push('facebook');
    if ($('pfIg').checked && entries[0].platforms.includes('instagram')) pf.push('instagram');
    if (!pf.length) return toast('Pick at least one platform.', 'err');
    entries[0].platforms = pf;
  }
  const mode = post.stage === 'confirm' ? 'send' : 'preview';
  const btn = $('postSend'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${mode === 'send' ? 'Posting…' : 'Checking…'}`;
  try {
    const summaries = []; let anyFail = false;
    for (const e of entries) {
      const r = await (await fetch(`${API}/post-social`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: e.img.base64, caption: e.useCaption ? caption : '', platforms: e.platforms, placement: e.placement, mode }) })).json();
      if (mode === 'preview') {
        if (!r.ok) throw new Error(`${e.desc}: ${r.error || 'preview failed'}`);
        continue;
      }
      // Send: report per platform — a partial (FB posted, IG failed) must
      // never read as a total failure, or a blind retry double-posts.
      const results = (r.result && r.result.results) || {};
      if (Object.keys(results).length) {
        const bits = Object.entries(results).map(([p, o]) => o.ok ? `${p} ✓` : (o.skipped ? `${p} skipped` : `${p} ✗ FAILED`));
        if (Object.values(results).some((o) => !o.ok && !o.skipped)) anyFail = true;
        summaries.push(`${e.desc} — ${bits.join(', ')}`);
      } else if (!r.ok) {
        anyFail = true;
        summaries.push(`${e.desc} — failed: ${r.error || 'send failed'}`);
      } else {
        summaries.push(`${e.desc} — sent`);
      }
    }
    if (mode === 'preview') { setPostStage('confirm'); }
    else {
      $('postDialog').close(); setPostStage('compose');
      toast((anyFail ? '⚠ Partial send — retry ONLY the failed platform: ' : 'Posted 🎉 ') + summaries.join(' | '), anyFail ? 'err' : 'ok');
    }
  } catch (e) { toast('Social post failed: ' + e.message, 'err'); setPostStage('compose'); }
  finally { btn.disabled = false; }
}

// ── Downloads ───────────────────────────────────────────────────────────────
function b64ToBlob(b64, type = 'image/png') { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type }); }
function triggerDownload(blob, name) { const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function downloadOne(img) { triggerDownload(b64ToBlob(img.base64), img.filename); }
async function downloadZip(images, zipName) {
  if (!images.length) return toast('Nothing to download.', 'err');
  const zip = new JSZip(); images.forEach((i) => zip.file(i.filename, i.base64, { base64: true }));
  triggerDownload(await zip.generateAsync({ type: 'blob' }), zipName || 'flyers.zip');
}
async function downloadBundle(key, sizeKeys) {
  const want = new Set(sizeKeys);
  const picked = state.images.filter((i) => i.family === 'A-Lite' && want.has(i.sizeKey));
  if (!picked.length) return toast(`No Style A-Lite images for the ${key} bundle.`, 'err');
  await downloadZip(picked, `${state.slug}_${key}-bundle.zip`);
  toast(`${key.toUpperCase()} bundle: ${picked.map((p) => p.sizeKey).join(', ')}`, 'ok');
}

// ── Drive ─────────────────────────────────────────────────────────────────────
async function onSaveDrive() {
  if (!state.driveConfigured) return toast('Drive not configured on the server.', 'err');
  if (!state.month) return toast('Set a month for Drive filing.', 'err');
  const btn = $('saveDrive'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving…';
  try {
    const payload = { template: state.template, month: state.month, images: state.images.map((i) => ({ filename: i.filename, base64: i.base64, channel: i.channel })) };
    const data = await (await fetch(`${API}/save-to-drive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
    if (!data.ok) throw new Error(data.error);
    $('warnings').appendChild(el('div', 'note note-ok', `☁ Saved ${data.savedCount}/${state.images.length} to Drive · FLYERS/${state.template}/${state.month}/`));
    toast(`Saved ${data.savedCount} to Drive.`, 'ok');
  } catch (e) { toast('Drive save failed: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '☁ Save all to Drive'; }
}

// ── Ad copy ─────────────────────────────────────────────────────────────────
function copyBlock(label, text) {
  const wrap = el('div', 'copyblock'); const head = el('div', 'copyblock-head'); head.appendChild(el('span', null, label));
  const btn = el('button', 'ghost sm'); btn.textContent = 'Copy'; btn.addEventListener('click', () => { navigator.clipboard.writeText(text); toast(label + ' copied', 'ok'); });
  head.appendChild(btn);
  const ta = el('textarea'); ta.readOnly = true; ta.rows = Math.min(6, Math.max(2, Math.ceil(text.length / 60))); ta.value = text;
  wrap.appendChild(head); wrap.appendChild(ta); return wrap;
}
function renderAdCopy(ad) {
  const host = $('adcopy'); host.classList.remove('hidden'); host.innerHTML = '<h3>Ad copy <span class="muted">— paste into Ads Manager</span></h3>';
  if (ad.meta) { host.appendChild(el('h4', null, 'Meta')); host.appendChild(copyBlock('Primary text', ad.meta.primaryText)); host.appendChild(copyBlock('Headline', ad.meta.headline)); host.appendChild(copyBlock('Description', ad.meta.description)); host.appendChild(el('div', 'kv', `<b>CTA:</b> ${ad.meta.cta} &nbsp;·&nbsp; <b>URL:</b> ${ad.meta.url}`)); }
  if (ad.pmax) { host.appendChild(el('h4', null, 'Google PMax')); host.appendChild(copyBlock('Short headlines', ad.pmax.shortHeadlines.join('\n'))); host.appendChild(copyBlock('Long headlines', ad.pmax.longHeadlines.join('\n'))); host.appendChild(copyBlock('Descriptions', ad.pmax.descriptions.join('\n'))); host.appendChild(copyBlock('Long description', ad.pmax.longDescription)); }
}

// ── 🎬 VIDEO MODE — cut clips to the Video Output Standard ───────────────────
function initVideo() {
  document.querySelectorAll('#makerToggle .seg-btn').forEach((b) => b.addEventListener('click', () => setMaker(b.dataset.maker)));
  $('vMonth').value = $('month').value;
  $('uploadVidBtn').addEventListener('click', () => $('vidInput').click());
  $('vidInput').addEventListener('change', onUploadVid);
  $('videoComposeBtn').addEventListener('click', onVideoCompose);
  $('vSaveDrive').addEventListener('click', onVSaveDrive);
  loadVideos();
}

async function loadVideos() {
  try {
    const j = await (await fetch(`${API}/videos`)).json();
    vid.items = j.items || [];
    $('vidSource').textContent = `(${j.source} · ${vid.items.length})`;
    if (!vid.selectedId && vid.items[0]) vid.selectedId = vid.items[0].id;
    renderVidPicker();
  } catch (e) { $('vidPicker').textContent = 'video library unavailable'; }
}

function renderVidPicker() {
  const host = $('vidPicker'); host.innerHTML = '';
  if (!vid.items.length) { host.innerHTML = '<span class="muted">No footage yet — add a video to the library.</span>'; return; }
  vid.items.forEach((v) => {
    const d = el('div', 'thumb-item vid' + (vid.selectedId === v.id ? ' sel' : '')); d.title = v.name;
    // Drive hands us a real video thumbnail; local dev gets a film tile.
    d.innerHTML = (v.thumb ? `<img src="${v.thumb}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="vid-tile">🎬</span>') +
      `<span class="vid-name">${v.name}</span>`;
    d.addEventListener('click', () => { vid.selectedId = v.id; $('vidChosen').textContent = v.name + (v.bytes ? ` · ${(v.bytes / 1e6).toFixed(0)} MB` : ''); renderVidPicker(); });
    host.appendChild(d);
  });
}

async function onUploadVid() {
  const f = $('vidInput').files[0]; if (!f) return;
  const btn = $('uploadVidBtn'); btn.disabled = true; btn.innerHTML = `<span class="spin dark"></span>Uploading ${(f.size / 1e6).toFixed(0)} MB…`;
  try {
    const fd = new FormData(); fd.append('file', f);
    const r = await (await fetch(`${API}/upload-video`, { method: 'POST', body: fd })).json();
    if (!r.ok) throw new Error(r.error || 'upload failed');
    vid.selectedId = r.id;
    await loadVideos();
    toast(`“${f.name}” added to the footage library.`, 'ok');
  } catch (e) { toast('Video upload failed: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '⬆ Add video to library'; $('vidInput').value = ''; }
}

function vAspects() {
  const a = [];
  if ($('va_916').checked) a.push('9x16');
  if ($('va_11').checked) a.push('1x1');
  if ($('va_169').checked) a.push('16x9');
  return a;
}

async function onVideoCompose() {
  if (!vid.selectedId) return toast('Pick footage from the library first.', 'err');
  const headline = $('vHeadline').value.trim();
  if (!headline) return toast('The end-card needs a headline.', 'err');
  const aspects = vAspects();
  if (!aspects.length) return toast('Pick at least one size.', 'err');

  const end = { headline, subhead: $('vSubhead').value.trim(), cta: $('vCta').value.trim(), url: $('vUrl').value.trim() };
  if ($('vQr').checked && end.url) end.qr = 'https://' + end.url.toLowerCase().replace(/^https?:\/\//, '');

  const fd = new FormData();
  fd.append('sourceId', vid.selectedId);
  fd.append('start', $('vStart').value || '0');
  fd.append('seconds', $('vSeconds').value || '30');
  fd.append('aspects', aspects.join(','));
  if ($('vHook').value.trim()) fd.append('hook', $('vHook').value.trim());
  fd.append('end', JSON.stringify(end));
  fd.append('slug', $('vTemplate').value.trim() || headline);

  const btn = $('videoComposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Cutting… (up to a minute)';
  try {
    const data = await (await fetch(`${API}/video-compose`, { method: 'POST', body: fd })).json();
    if (!data.ok) throw new Error(data.error || 'video compose failed');
    vid.outputs = data.outputs; vid.slug = data.slug; vid.driveConfigured = data.driveConfigured;
    renderVideoResults(data);
    toast(`${data.outputs.length} cut${data.outputs.length > 1 ? 's' : ''} in ${(data.renderMs / 1000).toFixed(1)}s — every gate passed.`, 'ok');
    $('videoResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { toast('Error: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Cut the clip →'; }
}

function renderVideoResults(data) {
  $('videoResults').classList.remove('hidden');
  const s = data.source;
  $('vSummary').innerHTML = `<b>${data.slug}</b> · from ${s.start}s for ${s.seconds}s of a ${s.duration.toFixed(1)}s source · ${data.outputs.length} outputs · ${(data.renderMs / 1000).toFixed(1)}s`;
  $('vSaveDrive').disabled = !data.driveConfigured;
  const host = $('vGrid'); host.innerHTML = '';
  data.outputs.forEach((o) => {
    const card = el('div', 'vcard');
    const gateLine = o.gate.ok
      ? `<span class="gate ok">✓ Standard v1 — ${o.gate.checks.length} checks passed</span>`
      : `<span class="gate bad">✗ gate failed</span>`;
    card.innerHTML = `
      <video controls playsinline preload="metadata" src="${o.url}"></video>
      <div class="tile-meta"><span class="tile-label">${o.label}</span><span class="tile-dims muted">${o.width}×${o.height} · ${o.seconds}s · ${(o.bytes / 1e6).toFixed(1)} MB</span></div>
      <div class="gate-row">${gateLine}</div>`;
    const row = el('div', 'tile-row');
    const dl = el('a', 'ghost sm dl-link', '⬇ MP4'); dl.href = o.url; dl.download = o.filename;
    row.appendChild(dl); card.appendChild(row); host.appendChild(card);
  });
}

async function onVSaveDrive() {
  if (!vid.outputs.length) return;
  const btn = $('vSaveDrive'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving…';
  try {
    const payload = { template: $('vTemplate').value.trim() || vid.slug || 'Video', month: $('vMonth').value, tokens: vid.outputs.map((o) => o.token) };
    const data = await (await fetch(`${API}/save-videos-to-drive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
    if (!data.ok) throw new Error(data.error);
    toast(`Saved ${data.savedCount} to Drive · FLYERS/${payload.template}/${payload.month}/Video/`, 'ok');
  } catch (e) { toast('Drive save failed: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '☁ Save all to Drive'; }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, kind) { const t = $('toast'); t.textContent = msg; t.className = 'toast ' + (kind || ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4200); }

document.addEventListener('DOMContentLoaded', init);
