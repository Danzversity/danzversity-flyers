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
const create = { templates: [], backgrounds: [], people: [], selectedBg: null, bgFile: null, selectedPersonId: null, photoFile: null, mode: 'photo' };

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
  initPostDialog();
  checkHealth();
  initCreate();
}

async function checkHealth() {
  try { const h = await (await fetch(`${API}/health`)).json(); $('brandVer').textContent = (h.brandVersion || '11').replace(/\.0\.0$/, ''); setDriveBadge(h.driveConfigured); }
  catch (e) { setDriveBadge(false, true); }
}
function setDriveBadge(configured, errored) {
  const b = $('driveBadge'); state.driveConfigured = !!configured;
  if (errored) { b.textContent = 'API offline'; b.className = 'badge badge-off'; return; }
  b.textContent = configured ? 'Drive: connected' : 'Drive: not configured';
  b.className = 'badge ' + (configured ? 'badge-ok' : 'badge-off');
}

// ── ① COMPOSE ──────────────────────────────────────────────────────────────────
async function initCreate() {
  try { const j = await (await fetch(`${API}/templates`)).json(); create.templates = j.templates || []; }
  catch (e) { return; }
  const sel = $('tplSelect');
  const groups = {}; create.templates.forEach((t) => { (groups[t.group] = groups[t.group] || []).push(t); });
  sel.innerHTML = '';
  Object.keys(groups).forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g;
    groups[g].forEach((t) => { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label + (t.channel === 'paid' ? '  ·  paid' : ''); og.appendChild(o); });
    sel.appendChild(og);
  });
  sel.addEventListener('change', onTemplateChange);
  $('ctaUrl').addEventListener('blur', () => checkUrl($('ctaUrl').value));
  $('composeBtn').addEventListener('click', onCompose);
  $('uploadBgBtn').addEventListener('click', () => $('bgInput').click());
  $('bgInput').addEventListener('change', onUploadBg);
  $('addPhotoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', onPickPhoto);
  document.querySelectorAll('#modeToggle .seg-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  setMode('scene');
  onTemplateChange();
  loadLibraries();
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
  if (!create.backgrounds.length) host.innerHTML = '<span class="muted">No saved backgrounds — upload one above, or add to the Drive library.</span>';
  create.backgrounds.forEach((b) => {
    const d = el('div', 'thumb-item' + (create.selectedBg === b.id && !create.bgFile ? ' sel' : '')); d.title = b.name;
    d.innerHTML = `<img src="${thumb('backgrounds', b.id)}" alt="" loading="lazy">`;
    d.addEventListener('click', () => { create.selectedBg = b.id; create.bgFile = null; $('bgChosen').textContent = ''; renderBgPicker(); });
    host.appendChild(d);
  });
}

function onUploadBg() {
  const f = $('bgInput').files[0]; if (!f) return;
  create.bgFile = f; create.selectedBg = null;
  $('bgChosen').textContent = 'Using upload: ' + f.name + ($('saveBg').checked ? ' (will save to library)' : '');
  renderBgPicker();
}

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

async function onCompose() {
  const t = currentTemplate(); if (!t) return;
  const content = collectContent();
  const missing = t.fields.filter((fld) => fld.required && !content[fld.name]);
  if (missing.length) return toast('Fill required: ' + missing.map((m) => m.label).join(', '), 'err');
  if (create.mode === 'photo') {
    if (!create.photoFile && !create.selectedPersonId) return toast('Full-bleed: upload or pick a photo.', 'err');
  } else if (!create.selectedBg && !create.bgFile) {
    return toast('Pick or upload a background.', 'err');
  }

  if (!$('qrToggle').checked) content.qr = false;
  const fd = new FormData();
  fd.append('templateKey', t.key);
  fd.append('content', JSON.stringify(content));
  fd.append('mode', create.mode);
  if (create.bgFile) { fd.append('background', create.bgFile); if ($('saveBg').checked) fd.append('saveBg', 'true'); }
  else if (create.selectedBg) fd.append('backgroundId', create.selectedBg);
  if (create.photoFile) { fd.append('photo', create.photoFile); if ($('savePhoto').checked) fd.append('savePhoto', 'true'); }
  else if (create.selectedPersonId) fd.append('personId', create.selectedPersonId);

  const btn = $('composeBtn'); const orig = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Composing…';
  try {
    const data = await (await fetch(`${API}/compose`, { method: 'POST', body: fd })).json();
    if (!data.ok) throw new Error(data.error || 'compose failed');
    data.template = t.label.replace(/🔥/g, '').trim();
    renderResults(data);
    if (data.adCopy) renderAdCopy(data.adCopy); else $('adcopy').classList.add('hidden');
    toast(`Composed ${data.counts.total} sizes in ${data.renderMs} ms.`, 'ok');
    $('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { toast('Error: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = orig; }
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

  $('resultsPanel').classList.remove('hidden');
  $('summary').innerHTML = `<b>${state.template}</b> · ${state.images.length} images (${organic} organic, ${paid} paid) · ${data.renderMs} ms · slug <code>${state.slug}</code>`;
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
function renderGrid() {
  const grid = $('grid'); grid.innerHTML = ''; const tpl = $('tileTpl').content;
  state.images.map((img, idx) => ({ img, idx })).filter(({ img }) => img.channel === state.activeTab).forEach(({ img, idx }) => {
    const node = tpl.cloneNode(true); const tile = node.querySelector('.tile'); tile.dataset.idx = idx;
    node.querySelector('img').src = `data:image/png;base64,${img.base64}`;
    node.querySelector('.tile-label').textContent = `${img.label} · ${img.family}`;
    node.querySelector('.tile-dims').textContent = `${img.width}×${img.height}`;
    node.querySelector('.dl-one').addEventListener('click', () => downloadOne(img));
    node.querySelector('.post-one').addEventListener('click', () => openPostDialog(img));
    grid.appendChild(node);
  });
}

// ── Social (danzversity-social rail: preview → confirm → send) ──────────────
// One dialog, two clicks: "Preview →" validates with the rail, then the same
// button becomes "Post now" so nothing publishes on a single click.
const post = { img: null, stage: 'compose' };
function initPostDialog() {
  $('postCancel').addEventListener('click', () => $('postDialog').close());
  $('postSend').addEventListener('click', onPostSend);
  // Any edit invalidates a passed preview — force a fresh one.
  ['postCaption', 'pfFb', 'pfIg'].forEach((id) => $(id).addEventListener('input', () => setPostStage('compose')));
}
function setPostStage(stage) {
  post.stage = stage;
  $('postSend').textContent = stage === 'confirm' ? '✓ Preview OK — Post now' : 'Preview →';
}
function openPostDialog(img) {
  post.img = img;
  $('postImg').src = `data:image/png;base64,${img.base64}`;
  $('postMeta').textContent = `${img.label} · ${img.width}×${img.height}`;
  $('postCaption').value = '';
  setPostStage('compose');
  $('postDialog').showModal();
}
async function onPostSend() {
  const img = post.img; if (!img) return;
  const caption = $('postCaption').value.trim();
  const platforms = [];
  if ($('pfFb').checked) platforms.push('facebook');
  if ($('pfIg').checked) platforms.push('instagram');
  if (!platforms.length) return toast('Pick at least one platform.', 'err');
  const mode = post.stage === 'confirm' ? 'send' : 'preview';
  const btn = $('postSend'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${mode === 'send' ? 'Posting…' : 'Checking…'}`;
  try {
    const r = await (await fetch(`${API}/post-social`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: img.base64, caption, platforms, mode }) })).json();
    if (!r.ok) throw new Error(r.error || `${mode} failed`);
    if (mode === 'preview') { setPostStage('confirm'); }
    else { $('postDialog').close(); setPostStage('compose'); toast('Posted to ' + platforms.join(' + ') + ' 🎉', 'ok'); }
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

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, kind) { const t = $('toast'); t.textContent = msg; t.className = 'toast ' + (kind || ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4200); }

document.addEventListener('DOMContentLoaded', init);
