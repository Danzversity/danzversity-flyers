// Danzversity Flyer Pipeline — frontend logic (vanilla JS, same-origin API).

const API = ''; // same origin (served by the render-service, or set to the API URL in prod)

const FAMILIES = [
  { key: 'A',      label: 'Style A master',       sub: 'text-rich · organic feed/stories/email/print', channel: 'organic', chk: 'famA' },
  { key: 'A-Lite', label: 'Style A-Lite master',  sub: 'photo-dominant · Meta paid + Google PMax',      channel: 'paid',    chk: 'famALite' },
  { key: 'B',      label: 'Style B master',       sub: 'hype · battles, name-talent, (You)nity Nights', channel: 'organic', chk: 'famB' },
];

const state = {
  files: { 'A': null, 'A-Lite': null, 'B': null }, // File objects
  images: [],       // derived images from /process
  template: '',
  month: '',
  slug: '',
  driveConfigured: false,
  activeTab: 'organic',
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  // default month = current YYYY-MM
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

  checkHealth();
  initCreate();
}

async function checkHealth() {
  try {
    const r = await fetch(`${API}/health`);
    const h = await r.json();
    $('brandVer').textContent = (h.brandVersion || '11').replace(/\.0\.0$/, '');
    setDriveBadge(h.driveConfigured);
  } catch (e) {
    setDriveBadge(false, true);
  }
}
function setDriveBadge(configured, errored) {
  const b = $('driveBadge');
  state.driveConfigured = !!configured;
  if (errored) { b.textContent = 'API offline'; b.className = 'badge badge-off'; return; }
  b.textContent = configured ? 'Drive: connected' : 'Drive: not configured';
  b.className = 'badge ' + (configured ? 'badge-ok' : 'badge-off');
}

// ── Dropzones ─────────────────────────────────────────────────────────────────
function buildDropzones() {
  const host = $('masters');
  host.innerHTML = '';
  FAMILIES.forEach((f) => {
    const dz = el('div', 'dropzone');
    dz.id = `dz_${f.key}`;
    dz.dataset.fam = f.key;
    dz.innerHTML = `
      <div class="dz-thumb">+</div>
      <div class="dz-text">
        <span class="dz-title">${f.label}</span>
        <span class="dz-channel ${f.channel}">${f.channel}</span>
        <span class="dz-sub">${f.sub}</span>
      </div>`;
    const input = el('input');
    input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    input.addEventListener('change', () => input.files[0] && setMaster(f.key, input.files[0]));
    dz.appendChild(input);
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) setMaster(f.key, file);
    });
    host.appendChild(dz);
  });
}

function setMaster(famKey, file) {
  state.files[famKey] = file;
  const dz = $(`dz_${famKey}`);
  dz.classList.add('filled');
  const url = URL.createObjectURL(file);
  dz.querySelector('.dz-thumb').style.backgroundImage = `url(${url})`;
  dz.querySelector('.dz-thumb').textContent = '';
  dz.querySelector('.dz-sub').textContent = file.name;
}

function syncFamilyVisibility() {
  FAMILIES.forEach((f) => {
    const on = $(f.chk).checked;
    $(`dz_${f.key}`).classList.toggle('hidden', !on);
  });
}

function requestedFamilies() {
  return FAMILIES.filter((f) => $(f.chk).checked).map((f) => f.key);
}

// ── Generate ──────────────────────────────────────────────────────────────────
async function onGenerate() {
  const template = $('template').value.trim();
  if (!template) return toast('Enter a template / event name first.', 'err');
  const fams = requestedFamilies();
  if (!fams.length) return toast('Pick at least one family.', 'err');
  const haveMaster = fams.some((k) => state.files[k]) || state.files['A'] || state.files['A-Lite'] || state.files['B'];
  if (!haveMaster) return toast('Drop at least one master image.', 'err');

  state.template = template;
  state.month = $('month').value;

  const fd = new FormData();
  fd.append('template', template);
  fd.append('month', state.month);
  fd.append('families', fams.join(','));
  if (state.files['A']) fd.append('masterA', state.files['A']);
  if (state.files['A-Lite']) fd.append('masterALite', state.files['A-Lite']);
  if (state.files['B']) fd.append('masterB', state.files['B']);

  const btn = $('generateBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Generating…';
  try {
    const r = await fetch(`${API}/process`, { method: 'POST', body: fd });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Process failed');
    state.images = data.images;
    state.slug = data.slug;
    state.driveConfigured = data.driveConfigured;
    setDriveBadge(data.driveConfigured);
    renderResults(data);
    toast(`Generated ${data.counts.total} images in ${data.renderMs} ms.`, 'ok');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate all sizes';
  }
}

// ── Results ───────────────────────────────────────────────────────────────────
function renderResults(data) {
  $('resultsPanel').classList.remove('hidden');
  $('summary').innerHTML =
    `<b>${data.template}</b> · ${data.counts.total} images ` +
    `(${data.counts.organic} organic, ${data.counts.paid} paid) · ${data.renderMs} ms · slug <code>${data.slug}</code>`;

  const warn = $('warnings');
  warn.innerHTML = '';
  (data.warnings || []).forEach((w) => warn.appendChild(el('div', 'note note-warn', '⚠ ' + w)));

  $('cntOrganic').textContent = data.counts.organic;
  $('cntPaid').textContent = data.counts.paid;
  $('saveDrive').disabled = !data.driveConfigured;
  $('saveDrive').title = data.driveConfigured ? '' : 'Set GOOGLE_SERVICE_ACCOUNT on the server to enable';

  const hasPaid = state.images.some((i) => i.channel === 'paid');
  $('dlMeta').disabled = !hasPaid;
  $('dlPmax').disabled = !hasPaid;

  setTab(data.counts.organic ? 'organic' : 'paid');
}

function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  renderGrid();
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  const tpl = $('tileTpl').content;
  state.images
    .map((img, idx) => ({ img, idx }))
    .filter(({ img }) => img.channel === state.activeTab)
    .forEach(({ img, idx }) => {
      const node = tpl.cloneNode(true);
      const tile = node.querySelector('.tile');
      tile.dataset.idx = idx;
      node.querySelector('img').src = `data:image/png;base64,${img.base64}`;
      node.querySelector('.tile-label').textContent = `${img.label} · ${img.family}`;
      node.querySelector('.tile-dims').textContent = `${img.width}×${img.height}`;
      node.querySelectorAll('.seg-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.policy === img.policy);
        b.addEventListener('click', () => reDerive(idx, b.dataset.policy));
      });
      node.querySelector('.dl-one').addEventListener('click', () => downloadOne(img));
      grid.appendChild(node);
    });
}

// Re-derive one tile with a new crop policy (fit/fill), via /derive-one.
async function reDerive(idx, policy) {
  const img = state.images[idx];
  if (!img || img.policy === policy) return;
  const file = state.files[img.derivedFrom] || state.files[img.family];
  if (!file) return toast('Master no longer in memory — re-upload to re-crop.', 'err');

  const tile = document.querySelector(`.tile[data-idx="${idx}"]`);
  if (tile) tile.classList.add('busy');
  try {
    const fd = new FormData();
    fd.append('master', file);
    fd.append('family', img.family);
    fd.append('sizeKey', img.sizeKey);
    fd.append('policy', policy);
    fd.append('slug', state.slug);
    const r = await fetch(`${API}/derive-one`, { method: 'POST', body: fd });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    state.images[idx] = { ...img, ...data.image, derivedFrom: img.derivedFrom };
    renderGrid();
  } catch (e) {
    toast('Re-crop failed: ' + e.message, 'err');
    if (tile) tile.classList.remove('busy');
  }
}

// ── Downloads ─────────────────────────────────────────────────────────────────
function b64ToBlob(b64, type = 'image/png') {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadOne(img) {
  triggerDownload(b64ToBlob(img.base64), img.filename);
}
async function downloadZip(images, zipName) {
  if (!images.length) return toast('Nothing to download.', 'err');
  const zip = new JSZip();
  images.forEach((i) => zip.file(i.filename, i.base64, { base64: true }));
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, zipName || 'flyers.zip');
}
async function downloadBundle(key, sizeKeys) {
  const want = new Set(sizeKeys);
  const picked = state.images.filter((i) => i.family === 'A-Lite' && want.has(i.sizeKey));
  if (!picked.length) return toast(`No Style A-Lite images for the ${key} bundle. Generate the paid family first.`, 'err');
  await downloadZip(picked, `${state.slug}_${key}-bundle.zip`);
  toast(`${key.toUpperCase()} bundle: ${picked.map((p) => p.sizeKey).join(', ')}`, 'ok');
}

// ── Drive ─────────────────────────────────────────────────────────────────────
async function onSaveDrive() {
  if (!state.driveConfigured) return toast('Drive not configured on the server.', 'err');
  if (!state.month) return toast('Set a month for Drive filing.', 'err');
  const btn = $('saveDrive');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving…';
  try {
    const payload = {
      template: state.template,
      month: state.month,
      images: state.images.map((i) => ({ filename: i.filename, base64: i.base64, channel: i.channel })),
    };
    const r = await fetch(`${API}/save-to-drive`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    const w = $('warnings');
    w.appendChild(el('div', 'note note-ok', `☁ Saved ${data.savedCount}/${state.images.length} to Drive · FLYERS/${state.template}/${state.month}/`));
    toast(`Saved ${data.savedCount} to Drive.`, 'ok');
  } catch (e) {
    toast('Drive save failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '☁ Save all to Drive';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast ' + (kind || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4200);
}

// ════════════════════════════════════════════════════════════════════════════
// ① CREATE — template picker → prompt/generate → pick master → flows into sizing
// ════════════════════════════════════════════════════════════════════════════
const create = { templates: [], ideogramConfigured: false };

async function initCreate() {
  try {
    const r = await fetch(`${API}/templates`);
    const j = await r.json();
    create.templates = j.templates || [];
    create.ideogramConfigured = !!j.ideogramConfigured;
  } catch (e) {
    return; // API offline; Create stays empty, upload step still works
  }

  const sel = $('tplSelect');
  const groups = {};
  create.templates.forEach((t) => { (groups[t.group] = groups[t.group] || []).push(t); });
  sel.innerHTML = '';
  Object.keys(groups).forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g;
    groups[g].forEach((t) => {
      const o = document.createElement('option'); o.value = t.key;
      o.textContent = t.label + (t.channel === 'paid' ? '  ·  paid' : '');
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  sel.addEventListener('change', onTemplateChange);

  $('genBtn').textContent = create.ideogramConfigured ? 'Generate 4 with Ideogram' : 'Get prompt + ad copy';
  $('genHint').textContent = create.ideogramConfigured
    ? 'pick a winner → it flows into sizing below'
    : 'Ideogram key not set — guided mode: paste the prompt into Ideogram, then drop your winner in ②';
  $('genBtn').addEventListener('click', onCreateGenerate);
  $('ctaUrl').addEventListener('blur', () => checkUrl($('ctaUrl').value));
  onTemplateChange();
}

function currentTemplate() { return create.templates.find((t) => t.key === $('tplSelect').value); }

function onTemplateChange() {
  const t = currentTemplate(); if (!t) return;
  $('ctaUrl').value = t.defaultUrl || '';
  checkUrl(t.defaultUrl);
  const host = $('tplFields'); host.innerHTML = '';
  t.fields.forEach((fld) => {
    const lab = el('label', 'field');
    lab.appendChild(document.createTextNode(fld.label + (fld.required ? ' *' : '')));
    const inp = el('input'); inp.type = 'text'; inp.id = 'fld_' + fld.name;
    inp.placeholder = fld.placeholder || ''; if (fld.default) inp.value = fld.default;
    lab.appendChild(inp); host.appendChild(lab);
  });
  ['candidates', 'guided', 'adcopy'].forEach((id) => $(id).classList.add('hidden'));
}

function collectContent() {
  const t = currentTemplate(); const c = {};
  t.fields.forEach((fld) => { const v = $('fld_' + fld.name).value.trim(); if (v) c[fld.name] = v; });
  c.url = $('ctaUrl').value.trim();
  return c;
}

async function checkUrl(u) {
  const e = $('urlStatus'); if (!u) { e.textContent = ''; return; }
  e.textContent = '· checking'; e.className = 'url-status';
  try {
    const r = await fetch(`${API}/verify-url?u=` + encodeURIComponent(u));
    const j = await r.json();
    const good = j.ok && j.status >= 200 && j.status < 400;
    e.textContent = good ? `· ${j.status} ✓` : `· ${j.status || 'fail'} ✗`;
    e.className = 'url-status ' + (good ? 'ok' : 'bad');
  } catch (_) { e.textContent = '· err'; e.className = 'url-status bad'; }
}

async function onCreateGenerate() {
  const t = currentTemplate(); if (!t) return;
  const content = collectContent();
  const missing = t.fields.filter((fld) => fld.required && !content[fld.name]);
  if (missing.length) return toast('Fill required: ' + missing.map((m) => m.label).join(', '), 'err');

  const btn = $('genBtn'); const orig = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Working…';
  try {
    const r = await fetch(`${API}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey: t.key, content, numImages: 4 }),
    });
    const j = await r.json();
    if (r.status === 503 || j.mode === 'guided') renderGuided(j.assembled);
    else if (j.ok) renderCandidates(j, t);
    else throw new Error(j.error || 'failed');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function renderCandidates(j, t) {
  const host = $('candidates'); host.innerHTML = '<h3>Pick your winner</h3>'; host.classList.remove('hidden');
  $('guided').classList.add('hidden');
  if (j.styleRefsMissing && j.styleRefsMissing.length) {
    host.appendChild(el('div', 'note note-warn', '⚠ Style refs missing (add to assets/refs/): ' + j.styleRefsMissing.join(', ') + ' — generated prompt-only.'));
  }
  const grid = el('div', 'cand-grid');
  j.candidates.forEach((c) => {
    const card = el('div', 'cand');
    card.innerHTML = `<div class="cand-thumb"><img src="data:image/png;base64,${c.base64}" alt=""></div>`;
    const use = el('button', 'primary sm'); use.textContent = 'Use this →';
    use.addEventListener('click', () => useCandidate(c, j, t));
    card.appendChild(use); grid.appendChild(card);
  });
  host.appendChild(grid);
  if (j.adCopy) renderAdCopy(j.adCopy);
  host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderGuided(a) {
  const host = $('guided'); host.classList.remove('hidden'); $('candidates').classList.add('hidden');
  host.innerHTML = '<h3>Guided mode — generate in Ideogram</h3>';
  host.appendChild(el('div', 'note note-warn', 'Ideogram key not set. Paste the prompt into Ideogram 3.0 (aspect 4:5, Magic Prompt OFF), upload the style references, pick the cleanest of 4, then drop the winner into ② below.'));
  host.appendChild(copyBlock('Prompt', a.prompt));
  host.appendChild(copyBlock('Negative prompt', a.negativePrompt));
  host.appendChild(el('div', 'kv', `<b>Style refs:</b> ${a.styleRefs.join(', ')} &nbsp;·&nbsp; <b>Aspect:</b> ${a.aspectRatio} &nbsp;·&nbsp; <b>Palette:</b> ${a.palette.join(' ')} &nbsp;·&nbsp; <b>URL:</b> ${a.urlStatus ? a.urlStatus.status : '?'}`));
  if (a.adCopy) renderAdCopy(a.adCopy);
  host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copyBlock(label, text) {
  const wrap = el('div', 'copyblock');
  const head = el('div', 'copyblock-head'); head.appendChild(el('span', null, label));
  const btn = el('button', 'ghost sm'); btn.textContent = 'Copy';
  btn.addEventListener('click', () => { navigator.clipboard.writeText(text); toast(label + ' copied', 'ok'); });
  head.appendChild(btn);
  const ta = el('textarea'); ta.readOnly = true; ta.rows = Math.min(6, Math.max(2, Math.ceil(text.length / 60))); ta.value = text;
  wrap.appendChild(head); wrap.appendChild(ta);
  return wrap;
}

function renderAdCopy(ad) {
  const host = $('adcopy'); host.classList.remove('hidden'); host.innerHTML = '<h3>Ad copy <span class="muted">— paste into Ads Manager</span></h3>';
  if (ad.meta) {
    host.appendChild(el('h4', null, 'Meta'));
    host.appendChild(copyBlock('Primary text', ad.meta.primaryText));
    host.appendChild(copyBlock('Headline', ad.meta.headline));
    host.appendChild(copyBlock('Description', ad.meta.description));
    host.appendChild(el('div', 'kv', `<b>CTA:</b> ${ad.meta.cta} &nbsp;·&nbsp; <b>URL:</b> ${ad.meta.url}`));
  }
  if (ad.pmax) {
    host.appendChild(el('h4', null, 'Google PMax'));
    host.appendChild(copyBlock('Short headlines', ad.pmax.shortHeadlines.join('\n')));
    host.appendChild(copyBlock('Long headlines', ad.pmax.longHeadlines.join('\n')));
    host.appendChild(copyBlock('Descriptions', ad.pmax.descriptions.join('\n')));
    host.appendChild(copyBlock('Long description', ad.pmax.longDescription));
  }
}

// Pick a generated candidate → set it as the master for its family + run sizing.
function useCandidate(c, j, t) {
  const file = new File([b64ToBlob(c.base64)], `${t.key}-master.png`, { type: 'image/png' });
  const fam = j.family;
  if (fam === 'A') $('famA').checked = true;
  else if (fam === 'A-Lite') $('famALite').checked = true;
  else $('famB').checked = true;
  syncFamilyVisibility();
  setMaster(fam, file);
  $('template').value = t.label.replace(/🔥/g, '').replace(/—\s*(Paid|Evergreen|Per Week)/i, '').trim() || t.label;
  toast('Master selected → sizing all formats…', 'ok');
  onGenerate();
}

document.addEventListener('DOMContentLoaded', init);
