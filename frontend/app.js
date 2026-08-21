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
  // paidMode: the "Use for" toggle. The dropdown lists one entry per product;
  // when true, currentTemplate() resolves to the product's paid (A-Lite) variant.
  paidMode: false,
  style: { font: 'classic', accent: 'gold', headline: 'accent' },
  styleOptions: null, bgVibes: [],
  aiBgs: [], selectedAiIdx: null, // session-only Ideogram background candidates
};
const LOOKS_KEY = 'dvzFlyerLooks';

// Video mode state — footage library + last compose outputs (token URLs).
const vid = { items: [], selectedId: null, outputs: [], maker: 'flyer' };
// Music: OFF by default (TikTok/Reels want in-app trending audio, not burned-in tracks).
const mus = { items: [], selectedId: null, mode: 'replace' };

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
  initFlyerPostExisting();
  initRepost();
  initQueue();
  checkHealth();
  initCreate();
  initVideo();
}

// ── Maker mode: "What are we making today?" — Flyer | Video ──────────────────
const FLYER_PANELS = ['queuePanel', 'repostPanel', 'flyerPostExisting', 'createPanel', 'resultsPanel', 'inputPanel'];
const VIDEO_PANELS = ['videoPanel', 'videoPostExisting', 'videoResults'];
function setMaker(m) {
  vid.maker = m === 'video' ? 'video' : 'flyer';
  document.querySelectorAll('#makerToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.maker === vid.maker));
  // Results panels only reappear if they hold results — never an empty shell.
  FLYER_PANELS.forEach((id) => $(id).classList.toggle('hidden', vid.maker !== 'flyer'
    || (id === 'resultsPanel' && !state.images.length)
    || (id === 'queuePanel' && !queue.items.length)));
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
  document.querySelectorAll('#channelToggle .seg-btn').forEach((b) => b.addEventListener('click', () => setChannel(b.dataset.channel)));
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
  // One entry per PRODUCT: paid (A-Lite) variants stay out of the dropdown and
  // are reached via the "Use for: Paid ad" toggle instead.
  const groups = {}; create.templates.filter((t) => t.channel !== 'paid').forEach((t) => { (groups[t.group] = groups[t.group] || []).push(t); });
  sel.innerHTML = '';
  Object.keys(groups).forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g;
    groups[g].forEach((t) => { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; og.appendChild(o); });
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

function baseTemplate() { return create.templates.find((t) => t.key === $('tplSelect').value); }
function currentTemplate() {
  const b = baseTemplate(); if (!b) return b;
  if (create.paidMode && b.paidKey) return create.templates.find((t) => t.key === b.paidKey) || b;
  return b;
}

function setChannel(ch) {
  create.paidMode = ch === 'paid';
  document.querySelectorAll('#channelToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.channel === ch));
  // Same product, different channel — keep what's typed (matching field names).
  onTemplateChange({ preserve: true });
}

function onTemplateChange(opts = {}) {
  const base = baseTemplate(); if (!base) return;
  // Products without a paid variant only make regular posts — hide the toggle
  // and make sure a leftover paid selection can't stick.
  if (!base.paidKey && create.paidMode) {
    create.paidMode = false;
    document.querySelectorAll('#channelToggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.channel === 'post'));
  }
  $('channelRow').classList.toggle('hidden', !base.paidKey);
  const t = currentTemplate(); if (!t) return;
  $('ctaUrl').value = t.defaultUrl || ''; checkUrl(t.defaultUrl);
  // Only the post/paid toggle preserves values (same product, same facts).
  // A product switch must NOT — one template's defaults would leak into the
  // next product's fields.
  const host = $('tplFields');
  const prev = {};
  if (opts.preserve) host.querySelectorAll('input').forEach((i) => { if (i.value.trim()) prev[i.id] = i.value; });
  host.innerHTML = '';
  // Paid variants are generic (one A-Lite ad serves several products) — seed
  // their fields from the SELECTED product's defaults so e.g. Root Runners'
  // paid ad says AGES 2-4, not the generic youth AGES 2-17.
  const baseDefaults = {};
  if (t !== base) base.fields.forEach((f) => { if (f.default) baseDefaults[f.name] = f.default; });
  t.fields.forEach((fld) => {
    const lab = el('label', 'field');
    lab.appendChild(document.createTextNode(fld.label + (fld.required ? ' *' : '')));
    const inp = el('input'); inp.type = 'text'; inp.id = 'fld_' + fld.name; inp.placeholder = fld.placeholder || '';
    inp.value = prev['fld_' + fld.name] || baseDefaults[fld.name] || fld.default || '';
    lab.appendChild(inp); host.appendChild(lab);
  });
  const paid = t.channel === 'paid';
  $('qrToggle').checked = !paid; $('qrToggle').disabled = paid;
  $('channelHint').textContent = paid ? 'photo-dominant, minimal text, no QR' : '';
  $('composeHint').textContent = paid ? 'paid ad → photo-dominant, minimal text, no QR' : '';
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
    const s = data.used.saves || {};
    if (s.background === 'saved' || s.photo === 'saved') usedLine += ' · saved to library ✓';
  }

  $('resultsPanel').classList.remove('hidden');
  $('summary').innerHTML = `<b>${state.template}</b>${usedLine} · ${state.images.length} images (${organic} organic, ${paid} paid) · ${data.renderMs} ms`;
  const warn = $('warnings'); warn.innerHTML = ''; (data.warnings || []).forEach((w) => warn.appendChild(el('div', 'note note-warn', '⚠ ' + w)));
  // A requested library save that failed must be LOUD — otherwise the image is
  // gone next session while the checkbox claimed it would be kept.
  const s = (data.used && data.used.saves) || {};
  ['background', 'photo'].forEach((k) => {
    if (s[k] === 'failed') {
      warn.appendChild(el('div', 'note note-warn', `⚠ The ${k} did NOT save to the library (Drive write failed) — it will be gone next session. Download it now, or drop it into the Drive folder by hand.`));
      toast(`Save to library FAILED for the ${k} — see the warning above the results.`, 'err');
    }
  });
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
  // '3x2' listing: VisitAustin.com upload asset (manual portal) — no Post button.
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

// ── 🕒 Scheduled queue — what the rail's cron is holding ─────────────────────
// Scheduling lives on the WORKER, not here: a Cloudflare cron fires whether or
// not this page, the laptop, or the app is open. (The app-side scheduler
// silently no-ops when the app is closed — that's how a 9:50 AM showcase email
// went out 5 hours late.) This panel is just a window onto that queue.
// `justScheduled` bridges KV's eventually-consistent list index: a job the rail
// has definitely accepted may be missing from list() for a short while. We hold
// our own copy for a bounded window, then trust the server — so a job that
// genuinely failed to persist DOES eventually disappear instead of being papered
// over forever.
const queue = { items: [], done: [], justScheduled: new Map() };
const JUST_SCHEDULED_MS = 120000;

function initQueue() {
  $('queueRefresh').addEventListener('click', () => loadQueue(true));
  // The datetime input is disabled until "Schedule for later" is ticked, so a
  // stray date can never turn an intended post-now into a post-Thursday.
  // Toggling post-now ↔ schedule changes what the confirm click DOES, so any
  // passed preview is invalidated — same rule as editing the caption.
  $('postLater').addEventListener('change', () => { setPostStage('compose'); syncWhen(); });
  $('postWhen').addEventListener('input', () => { setPostStage('compose'); syncWhen(); });
  loadQueue();
}

function syncWhen() {
  const on = $('postLater').checked;
  $('postWhen').disabled = !on;
  if (on && !$('postWhen').value) {
    // Default to the next round hour, local time — a usable starting point that
    // is always in the future.
    const d = new Date(Date.now() + 3600e3);
    d.setMinutes(0, 0, 0);
    $('postWhen').value = localInputValue(d);
  }
  const hint = $('postWhenHint');
  if (!on) { hint.textContent = ''; }
  else {
    const t = whenMs();
    hint.textContent = !t ? 'pick a date & time'
      : t <= Date.now() ? '⚠ that time is already past'
      : `${new Date(t).toLocaleString()} · fires within ~5 min of that time`;
  }
  // Label only — this function must NOT reset the stage. It's called right
  // after a passed preview flips the stage to 'confirm'; resetting here would
  // silently undo that and leave the button stuck on "Preview →" forever.
  // Invalidating a preview on edit is the listeners' job.
  $('postSend').textContent = post.stage === 'confirm'
    ? (on ? '✓ Checks passed — Schedule it' : '✓ Preview OK — Post now')
    : 'Preview →';
}

// datetime-local speaks LOCAL wall-clock with no zone. Reading it back through
// the Date constructor interprets it in the browser's zone (Austin), and we send
// an absolute epoch — so the worker never has to guess a timezone or do DST math.
function localInputValue(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function whenMs() {
  const v = $('postWhen').value;
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

async function loadQueue(loud) {
  try {
    const j = await (await fetch(`${API}/scheduled`)).json();
    if (!j.ok) throw new Error(j.error || 'queue unavailable');
    queue.items = j.pending || [];
    queue.done = j.done || [];
    // Merge back any just-scheduled job the index hasn't surfaced yet.
    const now = Date.now();
    for (const [id, entry] of queue.justScheduled) {
      if (now - entry.at > JUST_SCHEDULED_MS) { queue.justScheduled.delete(id); continue; }
      const known = queue.items.some((x) => x.id === id) || queue.done.some((x) => x.id === id);
      if (known) queue.justScheduled.delete(id);
      else queue.items.push(entry.job);
    }
    renderQueue();
    if (loud) toast(`${queue.items.length} scheduled, ${queue.done.length} recently fired.`, 'ok');
  } catch (e) {
    queue.items = []; queue.done = [];
    renderQueue();
    if (loud) toast('Queue unavailable: ' + e.message, 'err');
  }
}

function renderQueue() {
  const host = $('queueList'); host.innerHTML = '';
  queue.items.sort((a, b) => a.when - b.when).forEach((j) => {
    const row = el('div', 'queue-row');
    const when = new Date(j.when);
    const dest = `${j.platforms.join(' + ')} · ${j.placement}${j.dryRun ? ' · DRY RUN' : ''}`;
    row.innerHTML = `<span class="q-when"></span><span class="q-dest"></span><span class="q-label muted"></span>`;
    row.querySelector('.q-when').textContent = when.toLocaleString();
    row.querySelector('.q-dest').textContent = dest;
    row.querySelector('.q-label').textContent = j.label || (j.text || '').slice(0, 60);
    const x = el('button', 'ghost sm', '✕ Cancel'); x.type = 'button';
    x.addEventListener('click', () => onUnschedule(j.id, x));
    row.appendChild(x);
    host.appendChild(row);
  });
  // Recently fired — the proof half. A scheduler you can't audit is a scheduler
  // you don't trust.
  if (queue.done.length) {
    host.appendChild(el('div', 'q-head muted', 'Recently fired'));
    queue.done.slice(0, 8).forEach((j) => {
      const bits = j.results ? Object.entries(j.results).map(([p, o]) => `${p} ${o.ok ? '✓' : (o.skipped ? 'skipped' : '✗')}`).join(', ') : (j.status || '');
      const row = el('div', 'queue-row done');
      row.innerHTML = `<span class="q-when"></span><span class="q-dest"></span><span class="q-label muted"></span>`;
      row.querySelector('.q-when').textContent = new Date(j.when).toLocaleString();
      row.querySelector('.q-dest').textContent = `${j.status}${bits ? ' — ' + bits : ''}`;
      row.querySelector('.q-label').textContent = j.label || '';
      host.appendChild(row);
    });
  }
  $('queueHint').textContent = queue.items.length
    ? `${queue.items.length} waiting · cron checks every 5 min`
    : 'Nothing scheduled.';
  if (vid.maker === 'flyer') $('queuePanel').classList.toggle('hidden', !queue.items.length && !queue.done.length);
}

async function onUnschedule(id, btn) {
  btn.disabled = true; btn.textContent = 'Cancelling…';
  try {
    const r = await (await fetch(`${API}/unschedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
    if (!r.ok) throw new Error(r.error || 'cancel failed');
    // Drop the optimistic copy too — otherwise the merge above would resurrect
    // a job you just cancelled for up to two minutes.
    queue.justScheduled.delete(id);
    queue.items = queue.items.filter((x) => x.id !== id);
    renderQueue();
    toast('Cancelled — it will not go out.', 'ok');
    loadQueue();
  } catch (e) { toast('Cancel failed: ' + e.message, 'err'); btn.disabled = false; btn.textContent = '✕ Cancel'; }
}

// ── 🔁 Repost — browse the saved FLYERS tree and run something again ─────────
// Reposting is the highest-frequency job and used to be the clumsiest: either
// re-compose (slow, and a cutout burns a Remove.bg call) or Drive → download →
// re-upload. The assets are already filed under FLYERS/{event}/{month}/{bucket},
// so browse them in place; the SERVER pulls the bytes from Drive at post time
// and nothing round-trips through the laptop.
const repost = { crumbs: [], images: [], picks: new Map(), loading: false };

function initRepost() {
  const here = () => (repost.crumbs.length ? repost.crumbs[repost.crumbs.length - 1].id : null);
  $('repostRefresh').addEventListener('click', () => browseDrive(here()));
  $('repostGoBtn').addEventListener('click', onRepostGo);
  browseDrive();
}

// One browse function. The caller owns the crumb trail before calling: entering
// a folder pushes, a crumb click truncates, and no id at all means the root.
async function browseDrive(folderId) {
  if (repost.loading) return;
  repost.loading = true;
  const grid = $('repostGrid'); grid.textContent = 'loading…';
  try {
    const j = await (await fetch(folderId ? `${API}/drive-browse?folderId=${encodeURIComponent(folderId)}` : `${API}/drive-browse`)).json();
    if (!j.ok) throw new Error(j.error || 'browse failed');
    if (j.atRoot) repost.crumbs = [{ id: j.rootId, name: 'FLYERS' }];
    repost.folders = j.folders;
    repost.images = j.images;
    repost.picks.clear();
    renderRepost();
  } catch (e) {
    grid.textContent = '';
    grid.appendChild(el('span', 'muted', `Drive browse unavailable: ${e.message}`));
    $('repostGoBtn').classList.add('hidden');
  } finally { repost.loading = false; }
}

function enterFolder(f) {
  repost.crumbs.push({ id: f.id, name: f.name });
  browseDrive(f.id);
}

function jumpToCrumb(idx) {
  repost.crumbs = repost.crumbs.slice(0, idx + 1);
  browseDrive(idx === 0 ? null : repost.crumbs[idx].id);
}

function renderRepost() {
  // Breadcrumbs
  const cr = $('repostCrumbs'); cr.innerHTML = '';
  repost.crumbs.forEach((c, i) => {
    if (i) cr.appendChild(el('span', 'crumb-sep', '›'));
    const b = el('button', 'crumb' + (i === repost.crumbs.length - 1 ? ' current' : '')); b.type = 'button';
    b.textContent = c.name;
    b.addEventListener('click', () => jumpToCrumb(i));
    cr.appendChild(b);
  });

  const grid = $('repostGrid'); grid.innerHTML = '';

  (repost.folders || []).forEach((f) => {
    const d = el('button', 'folder-card'); d.type = 'button';
    d.innerHTML = `<span class="folder-ico">📁</span><span class="folder-name"></span>`;
    d.querySelector('.folder-name').textContent = f.name;
    d.addEventListener('click', () => enterFolder(f));
    grid.appendChild(d);
  });

  const tpl = $('repostTpl').content;
  repost.images.forEach((im) => {
    const node = tpl.cloneNode(true);
    node.querySelector('img').src = `${API}/drive-thumb?id=${encodeURIComponent(im.id)}`;
    node.querySelector('.tile-label').textContent = im.name;
    node.querySelector('.tile-dims').textContent = im.width
      ? `${im.width}×${im.height} · ${(im.bytes / 1e6).toFixed(1)} MB`
      : `${(im.bytes / 1e6).toFixed(1)} MB`;

    const sel = node.querySelector('.r-place');
    const note = node.querySelector('.r-note');
    // No dimensions from Drive (rare) → offer everything and let the server's
    // fit re-frame handle it; guessing a placement blind would be worse.
    const opts = im.width && im.height ? fpostOptionsFor(im.width / im.height) : ['feed', 'story', 'fbOnly'];
    opts.forEach((k) => { const o = el('option'); o.value = k; o.textContent = FPOST_OPTIONS[k].label; sel.appendChild(o); });
    sel.value = opts[0];
    // The saved tree holds non-social assets too (the 600×300 email banner, the
    // site card). They're postable, but Meta upscales them into mush — say so
    // rather than letting a bad-looking post go out quietly.
    const lowRes = im.width && Math.max(im.width, im.height) < 900;
    const noteFor = (k) => (lowRes ? '⚠ Low-res for social — Meta will upscale it. ' : '') + FPOST_OPTIONS[k].note;
    note.textContent = noteFor(opts[0]);
    sel.addEventListener('change', () => {
      note.textContent = noteFor(sel.value);
      if (repost.picks.has(im.id)) repost.picks.set(im.id, { im, choice: sel.value });
    });

    const chk = node.querySelector('.r-pick');
    chk.addEventListener('change', () => {
      if (chk.checked) repost.picks.set(im.id, { im, choice: sel.value });
      else repost.picks.delete(im.id);
      syncRepostGo();
    });
    grid.appendChild(node);
  });

  if (!(repost.folders || []).length && !repost.images.length) {
    grid.appendChild(el('span', 'muted', 'Nothing saved in this folder yet.'));
  }
  syncRepostGo();
}

function syncRepostGo() {
  const n = repost.picks.size;
  $('repostGoBtn').classList.toggle('hidden', !n);
  $('repostGoBtn').textContent = n === 1 ? '📣 Post this →' : `📣 Post these ${n} →`;
  $('repostHint').textContent = n ? 'Posts straight from Drive — nothing is downloaded or re-composed.' : '';
}

function onRepostGo() {
  if (!repost.picks.size) return;
  const where = repost.crumbs.map((c) => c.name).join('/');
  const plan = [...repost.picks.values()].map(({ im, choice }) => {
    const o = FPOST_OPTIONS[choice];
    return {
      img: { driveFileId: im.id, label: im.name, width: im.width, height: im.height, src: `${API}/drive-thumb?id=${encodeURIComponent(im.id)}` },
      platforms: o.platforms, placement: o.placement, useCaption: o.useCaption, fit: o.fit, source: 'repost',
      desc: `${im.name} · ${o.desc}`,
    };
  });
  state.repostWhere = where;
  openPostDialog(plan);
}

// ── 📤 Post a finished flyer (artwork made outside this tool) ────────────────
// The stills twin of "Post a finished video": no template, no chassis, no
// derive — the file you picked is what goes out. The only intelligence is
// PLACEMENT, because Meta's rules are unforgiving: the Instagram feed rejects
// anything outside 4:5 (0.8) – 1.91:1, so out-of-range art either rides a
// Story or gets letterboxed onto brand black (server-side `fit`) instead of
// failing at the rail with a cryptic Graph error.
const IG_FEED_MIN = 0.8, IG_FEED_MAX = 1.91;
const fpost = { items: [] };

// Every legal way to post one image, given its ratio. `fit` (a brand size key)
// asks the server to re-frame before posting; null posts the pixels untouched.
const FPOST_OPTIONS = {
  feed:      { label: 'Feed — Instagram + Facebook',              desc: 'Instagram + Facebook feed',                  platforms: ['facebook', 'instagram'], placement: 'feed',  useCaption: true,  fit: null,   note: 'Posted exactly as-is.' },
  feedPad45: { label: 'Feed — Instagram + Facebook (pad to 4:5)', desc: 'Instagram + Facebook feed · padded to 4:5',   platforms: ['facebook', 'instagram'], placement: 'feed',  useCaption: true,  fit: '4x5',  note: 'Too tall for the Instagram feed — padded to 4:5 on brand black.' },
  feedPad11: { label: 'Feed — Instagram + Facebook (pad to 1:1)', desc: 'Instagram + Facebook feed · padded to 1:1',   platforms: ['facebook', 'instagram'], placement: 'feed',  useCaption: true,  fit: '1x1',  note: 'Too wide for the Instagram feed — padded to 1:1 on brand black.' },
  story:     { label: 'Story — Instagram + Facebook',             desc: 'Instagram + Facebook Story · fitted to 9:16', platforms: ['facebook', 'instagram'], placement: 'story', useCaption: false, fit: '9x16', note: 'Fitted to 9:16 on brand black. Stories carry no caption.' },
  fbOnly:    { label: 'Feed — Facebook only',                     desc: 'Facebook feed only',                         platforms: ['facebook'],              placement: 'feed',  useCaption: true,  fit: null,   note: 'Facebook takes any shape; Instagram is skipped.' },
};

// Options in preference order — the first is the default.
function fpostOptionsFor(ratio) {
  if (ratio < 0.62) return ['story', 'feedPad45', 'fbOnly'];            // 9:16-ish story art
  if (ratio < IG_FEED_MIN) return ['feedPad45', 'story', 'fbOnly'];     // tall poster (2:3, A4…)
  if (ratio <= IG_FEED_MAX) return ['feed', 'story', 'fbOnly'];         // already feed-legal
  return ['fbOnly', 'feedPad11', 'story'];                              // banner-wide
}

function initFlyerPostExisting() {
  $('fPostBtn').addEventListener('click', () => $('fPostFile').click());
  $('fPostFile').addEventListener('change', onFlyerPostPick);
  $('fPostGoBtn').addEventListener('click', onFlyerPostGo);
  $('fPostClearBtn').addEventListener('click', () => { fpost.items = []; renderFPostGrid(); });
}

// Read one picked file into { base64, mime, width, height } — dimensions come
// from the decoded image, not the filename, since the placement hangs on them.
function readPickedImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('could not read the file'));
    fr.onload = () => {
      const dataUrl = String(fr.result);
      const img = new Image();
      img.onerror = () => reject(new Error('not a readable image'));
      img.onload = () => resolve({
        label: file.name, mime: file.type || 'image/png',
        base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
        width: img.naturalWidth, height: img.naturalHeight, bytes: file.size,
      });
      img.src = dataUrl;
    };
    fr.readAsDataURL(file);
  });
}

async function onFlyerPostPick() {
  const files = Array.from($('fPostFile').files || []);
  $('fPostFile').value = '';
  if (!files.length) return;
  const btn = $('fPostBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span>Reading…';
  try {
    for (const f of files) {
      const img = await readPickedImage(f);
      const opts = fpostOptionsFor(img.width / img.height);
      fpost.items.push({ img, options: opts, choice: opts[0] });
    }
    renderFPostGrid();
  } catch (e) { toast('Could not read that file: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Choose flyer image(s)…'; }
}

function renderFPostGrid() {
  const host = $('fPostGrid'); host.innerHTML = '';
  const any = fpost.items.length > 0;
  host.classList.toggle('hidden', !any);
  $('fPostGoBtn').classList.toggle('hidden', !any);
  $('fPostClearBtn').classList.toggle('hidden', !any);
  if (!any) return;
  $('fPostGoBtn').textContent = fpost.items.length === 1 ? '📣 Post this →' : `📣 Post these ${fpost.items.length} →`;
  const tpl = $('fPostTpl').content;
  fpost.items.forEach((it, idx) => {
    const node = tpl.cloneNode(true);
    node.querySelector('img').src = `data:${it.img.mime};base64,${it.img.base64}`;
    node.querySelector('.tile-label').textContent = it.img.label;
    node.querySelector('.tile-dims').textContent = `${it.img.width}×${it.img.height} · ${(it.img.bytes / 1e6).toFixed(1)} MB`;
    const sel = node.querySelector('.f-place');
    it.options.forEach((k) => { const o = el('option'); o.value = k; o.textContent = FPOST_OPTIONS[k].label; sel.appendChild(o); });
    sel.value = it.choice;
    const note = node.querySelector('.f-note');
    note.textContent = FPOST_OPTIONS[it.choice].note;
    sel.addEventListener('change', () => { it.choice = sel.value; note.textContent = FPOST_OPTIONS[sel.value].note; });
    node.querySelector('.f-remove').addEventListener('click', () => { fpost.items.splice(idx, 1); renderFPostGrid(); });
    host.appendChild(node);
  });
}

// Hand the batch to the same preview → confirm → send dialog the composed
// flyers use, so nothing about the safety path is duplicated or bypassed.
function onFlyerPostGo() {
  if (!fpost.items.length) return;
  const plan = fpost.items.map((it) => {
    const o = FPOST_OPTIONS[it.choice];
    return { img: it.img, platforms: o.platforms, placement: o.placement, useCaption: o.useCaption, fit: o.fit, source: 'existing',
             desc: `${it.img.label} · ${o.desc}` };
  });
  openPostDialog(plan);
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
  const later = $('postLater') && $('postLater').checked;
  $('postSend').textContent = stage === 'confirm'
    ? (later ? '✓ Checks passed — Schedule it' : '✓ Preview OK — Post now')
    : 'Preview →';
}
function openPostDialog(plan) {
  post.plan = plan;
  post.video = null;
  $('postVid').classList.add('hidden'); $('postVid').removeAttribute('src');
  $('postImg').classList.remove('hidden');
  const first = plan[0];
  // Repost entries carry a thumbnail URL instead of bytes — the full asset never
  // reaches the browser, the server posts it straight from Drive.
  $('postImg').src = first.img.src || `data:${first.img.mime || 'image/png'};base64,${first.img.base64}`;
  $('postMeta').textContent = plan.length === 1
    ? `${first.img.label} · ${first.img.width}×${first.img.height}`
    : `${plan.length} placements, one click`;

  // The plan list — say exactly where each image is going. A `fit` always shows
  // it: "we are re-framing your artwork" is never something to leave implicit.
  const planHost = $('postPlan'); planHost.innerHTML = '';
  planHost.classList.toggle('hidden', plan.length === 1 && first.placement === 'feed' && first.platforms.length === 2 && !first.fit);
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

  // Always reopen in post-now mode — a schedule left ticked from last time is
  // exactly how something silently doesn't go out today.
  $('postLater').checked = false;
  $('postWhen').value = '';
  syncWhen();
  setPostStage('compose');
  $('postDialog').showModal();
}
async function onPostSend() {
  if (post.video) return onVideoPostSend();
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
  const later = $('postLater').checked;
  const when = later ? whenMs() : null;
  if (later) {
    if (!when) return toast('Pick a date & time, or untick "Schedule for later".', 'err');
    if (when <= Date.now()) return toast('That time is already past — pick a future one.', 'err');
  }
  const mode = post.stage === 'confirm' ? 'send' : 'preview';
  // Scheduling still goes through preview first: the checks that catch a broken
  // asset or an illegal placement are worth MORE on a delayed send, because
  // nobody is watching when it fires.
  if (later && mode === 'send') return onScheduleConfirmed(entries, caption, when);
  const btn = $('postSend'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${mode === 'send' ? 'Posting…' : 'Checking…'}`;
  try {
    const summaries = []; let anyFail = false;
    for (const e of entries) {
      const r = await (await fetch(`${API}/post-social`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: e.img.base64, driveFileId: e.img.driveFileId, caption: e.useCaption ? caption : '', platforms: e.platforms, placement: e.placement, fit: e.fit || undefined, mode }) })).json();
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
    if (mode === 'preview') { setPostStage('confirm'); syncWhen(); }
    else {
      $('postDialog').close(); setPostStage('compose');
      // Clear the batch once it has gone out — a batch left on screen invites a
      // second click, and a double-post is unfixable.
      if (entries.some((e) => e.source === 'existing')) { fpost.items = []; renderFPostGrid(); }
      if (entries.some((e) => e.source === 'repost')) { repost.picks.clear(); renderRepost(); }
      toast((anyFail ? '⚠ Partial send — retry ONLY the failed platform: ' : 'Posted 🎉 ') + summaries.join(' | '), anyFail ? 'err' : 'ok');
    }
  } catch (e) { toast('Social post failed: ' + e.message, 'err'); setPostStage('compose'); }
  finally { btn.disabled = false; }
}

// Queue every entry in the plan. Each becomes its own job on the rail, so a
// feed post and its Story can be scheduled together and still fire/fail apart.
async function onScheduleConfirmed(entries, caption, when) {
  const btn = $('postSend'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Scheduling…';
  try {
    const done = [];
    for (const e of entries) {
      const r = await (await fetch(`${API}/schedule-social`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: e.img.base64, driveFileId: e.img.driveFileId,
          caption: e.useCaption ? caption : '', platforms: e.platforms, placement: e.placement,
          fit: e.fit || undefined, when, label: e.img.label || e.desc,
        }) })).json();
      if (!r.ok) throw new Error(`${e.desc}: ${r.error || 'schedule failed'}`);
      done.push(e.desc);
      // Show it immediately. KV's list index is EVENTUALLY consistent — a job
      // written a second ago frequently does not appear in the next list(), so
      // a plain refresh here shows an empty queue right after you scheduled
      // something, which reads as "it didn't work". Insert what the rail just
      // confirmed, then reconcile below.
      if (r.result && r.result.id) {
        const job = { id: r.result.id, when, whenISO: r.result.whenISO, platforms: e.platforms,
          placement: e.placement, text: e.useCaption ? caption : '', label: e.img.label || e.desc, dryRun: !!r.result.dryRun };
        queue.items.push(job);
        queue.justScheduled.set(job.id, { job, at: Date.now() });
      }
    }
    $('postDialog').close(); setPostStage('compose');
    $('postLater').checked = false; syncWhen();
    if (entries.some((x) => x.source === 'existing')) { fpost.items = []; renderFPostGrid(); }
    if (entries.some((x) => x.source === 'repost')) { repost.picks.clear(); renderRepost(); }
    renderQueue();
    if (vid.maker === 'flyer') $('queuePanel').classList.remove('hidden');
    toast(`🕒 Scheduled for ${new Date(when).toLocaleString()} — ${done.join(' | ')}`, 'ok');
    // Reconcile against the rail once KV's index has caught up, so the panel
    // ends up showing the truth rather than our optimistic copy.
    setTimeout(loadQueue, 8000);
    setTimeout(loadQueue, 30000);
  } catch (e) {
    toast('Scheduling failed: ' + e.message, 'err');
    setPostStage('compose');
  } finally { btn.disabled = false; syncWhen(); }
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
  // 📤 Post a finished video as-is (the Hootsuite path — no re-cut, no chassis).
  $('vPostExistingBtn').addEventListener('click', () => $('vPostFile').click());
  $('vPostFile').addEventListener('change', () => {
    const f = $('vPostFile').files[0];
    if (!f) return;
    openVideoPostDialog({ file: f, url: URL.createObjectURL(f), label: f.name });
    $('vPostFile').value = '';
  });
  $('uploadMusBtn').addEventListener('click', () => $('musInput').click());
  $('musInput').addEventListener('change', onUploadMus);
  document.querySelectorAll('#musModeSeg .seg-btn').forEach((b) => b.addEventListener('click', () => {
    mus.mode = b.dataset.musmode === 'bed' ? 'bed' : 'replace';
    document.querySelectorAll('#musModeSeg .seg-btn').forEach((x) => x.classList.toggle('active', x.dataset.musmode === mus.mode));
  }));
  syncMusMode();
  loadVideos();
  loadMusic();
}

function syncMusMode() { $('musModeSeg').style.display = mus.selectedId ? '' : 'none'; }

async function loadMusic() {
  try {
    const j = await (await fetch(`${API}/music`)).json();
    mus.items = j.items || [];
    $('musSource').textContent = `(${j.source} · ${mus.items.length})`;
    renderMusPicker();
  } catch (e) { $('musPicker').textContent = 'music library unavailable'; }
}

function renderMusPicker() {
  const host = $('musPicker'); host.innerHTML = '';
  const none = el('div', 'thumb-item mus none' + (!mus.selectedId ? ' sel' : ''), 'No music<br><span class="muted">(recommended for TikTok/Reels)</span>');
  none.addEventListener('click', () => { mus.selectedId = null; syncMusMode(); renderMusPicker(); });
  host.appendChild(none);
  mus.items.forEach((t) => {
    const d = el('div', 'thumb-item mus' + (mus.selectedId === t.id ? ' sel' : ''), `🎵<span class="vid-name">${t.name}</span>`);
    d.title = t.name;
    d.addEventListener('click', () => { mus.selectedId = t.id; syncMusMode(); renderMusPicker(); });
    host.appendChild(d);
  });
}

async function onUploadMus() {
  const f = $('musInput').files[0]; if (!f) return;
  const btn = $('uploadMusBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span>Uploading…';
  try {
    const fd = new FormData(); fd.append('file', f);
    const r = await (await fetch(`${API}/upload-music`, { method: 'POST', body: fd })).json();
    if (!r.ok) throw new Error(r.error || 'upload failed');
    mus.selectedId = r.id;
    await loadMusic(); syncMusMode();
    toast(`“${f.name}” added — royalty-free tracks only.`, 'ok');
  } catch (e) { toast('Track upload failed: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '⬆ Add track'; $('musInput').value = ''; }
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
  if (mus.selectedId) { fd.append('musicId', mus.selectedId); fd.append('musicMode', mus.mode); }
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
    const AUDIO_LABELS = { source: 'original sound', silence: 'silent source', replace: '🎵 music', bed: '🎵 music under sound' };
    card.innerHTML = `
      <video controls playsinline preload="metadata" src="${o.url}"></video>
      <div class="tile-meta"><span class="tile-label">${o.label}</span><span class="tile-dims muted">${o.width}×${o.height} · ${o.seconds}s · ${(o.bytes / 1e6).toFixed(1)} MB · ${AUDIO_LABELS[o.audioPlan] || ''}</span></div>
      <div class="gate-row">${gateLine}</div>`;
    const row = el('div', 'tile-row');
    const dl = el('a', 'ghost sm dl-link', '⬇ MP4'); dl.href = o.url; dl.download = o.filename;
    row.appendChild(dl);
    // Post: vertical → FB video + IG Reel; wide/square → FB only (Reels want 9:16).
    const vertical = o.height > o.width;
    const pb = el('button', 'sm post-one', vertical ? '📣 Post' : '📣 FB only');
    pb.title = vertical ? 'Facebook video + Instagram Reel' : 'Facebook Page video only — IG Reels need vertical';
    pb.addEventListener('click', () => openVideoPostDialog({ token: o.token, url: o.url, label: o.label, width: o.width, height: o.height }));
    row.appendChild(pb);
    card.appendChild(row); host.appendChild(card);
  });
}

// ── Post a video (a cut via its token, or a finished upload as-is) ───────────
function openVideoPostDialog(v) {
  post.video = v; post.plan = [];
  $('postImg').classList.add('hidden');
  const pv = $('postVid'); pv.classList.remove('hidden'); pv.src = v.url;
  $('postMeta').textContent = v.width ? `${v.label} · ${v.width}×${v.height} · video` : `${v.label} · video`;
  const applyPlatforms = () => {
    const vertical = pv.videoHeight ? pv.videoHeight > pv.videoWidth : (v.height || 0) > (v.width || 0);
    $('pfFb').checked = true; $('pfFb').disabled = false;
    $('pfIg').checked = vertical; $('pfIg').disabled = !vertical;
    const planHost = $('postPlan'); planHost.innerHTML = ''; planHost.classList.remove('hidden');
    planHost.appendChild(el('div', 'post-plan-line', vertical
      ? '→ Facebook Page video + Instagram Reel (processing runs 1–2 min)'
      : '→ Facebook Page video only — IG Reels need a vertical (9:16) video'));
  };
  $('pfFb').closest('.post-platforms').style.display = '';
  if (v.width) applyPlatforms(); else pv.addEventListener('loadedmetadata', applyPlatforms, { once: true });
  $('postCaption').value = ''; $('postCaption').disabled = false; $('postCaption').placeholder = 'Write the caption…';
  $('captionIdeas').classList.add('hidden'); $('captionIdeas').innerHTML = '';
  $('suggestSource').textContent = ''; $('suggestBtn').style.display = 'none';
  setPostStage('compose');
  $('postDialog').showModal();
}

async function onVideoPostSend() {
  const v = post.video;
  const caption = $('postCaption').value.trim();
  const platforms = [];
  if ($('pfFb').checked) platforms.push('facebook');
  if ($('pfIg').checked && !$('pfIg').disabled) platforms.push('instagram');
  if (!platforms.length) return toast('Pick at least one platform.', 'err');
  const mode = post.stage === 'confirm' ? 'send' : 'preview';
  const btn = $('postSend'); btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span>${mode === 'send' ? 'Posting… (video can take 2 min)' : 'Checking…'}`;
  try {
    let r;
    if (v.file) {
      const fd = new FormData();
      fd.append('video', v.file); fd.append('caption', caption);
      fd.append('platforms', platforms.join(',')); fd.append('placement', 'feed'); fd.append('mode', mode);
      r = await (await fetch(`${API}/post-video`, { method: 'POST', body: fd })).json();
    } else {
      r = await (await fetch(`${API}/post-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoToken: v.token, caption, platforms, placement: 'feed', mode }) })).json();
    }
    if (mode === 'preview') {
      if (!r.ok) throw new Error(r.error || 'preview failed');
      return setPostStage('confirm');
    }
    const results = r.results || {};
    const bits = Object.entries(results).map(([p, o]) => o.ok ? `${p} ✓` : (o.skipped ? `${p} skipped` : `${p} ✗ FAILED`));
    const anyFail = Object.values(results).some((o) => !o.ok && !o.skipped) || (!r.ok && !Object.keys(results).length);
    $('postDialog').close(); setPostStage('compose');
    toast((anyFail ? '⚠ Partial send — retry ONLY the failed platform: ' : 'Posted 🎉 ') + (bits.join(', ') || r.error || 'sent'), anyFail ? 'err' : 'ok');
  } catch (e) { toast('Video post failed: ' + e.message, 'err'); setPostStage('compose'); }
  finally { btn.disabled = false; }
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
