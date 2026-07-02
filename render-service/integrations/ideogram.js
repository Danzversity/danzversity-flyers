// Ideogram 3.0 generation client.
//
// Contract (verified against developer.ideogram.ai, June 2026):
//   POST https://api.ideogram.ai/v1/ideogram-v3/generate
//   Header: Api-Key: <key>
//   Body: multipart/form-data
//     prompt (required), negative_prompt, aspect_ratio (e.g. "4x5"),
//     num_images, rendering_speed (FLASH|TURBO|DEFAULT|QUALITY),
//     magic_prompt (AUTO|ON|OFF), style_reference_images (file array, ≤10MB total)
//   Response: { data: [ { url, seed, resolution, style_type, ... } ] }
//   Image URLs are time-limited — we download them to buffers immediately.
//
// Style references are the locked brand anchors (approved flyer + logo). Drop the
// files into assets/refs/ (names in templates.STYLE_REFS); missing ones are
// skipped gracefully so generation still runs prompt-only.

const fs = require('fs');
const path = require('path');

const ENDPOINT = 'https://api.ideogram.ai/v1/ideogram-v3/generate';
const REFS_DIR = path.join(__dirname, '..', '..', 'assets', 'refs');

function isConfigured() {
  return !!process.env.IDEOGRAM_API_KEY;
}

function loadStyleRefs(filenames) {
  const refs = [];
  const missing = [];
  for (const fn of filenames || []) {
    const p = path.join(REFS_DIR, fn);
    if (fs.existsSync(p)) refs.push({ name: fn, buffer: fs.readFileSync(p) });
    else missing.push(fn);
  }
  return { refs, missing };
}

/**
 * Generate N candidate masters. Returns buffers (downloaded from the time-limited
 * Ideogram URLs) plus which style refs were used/missing.
 * @returns {Promise<{candidates:Array<{buffer:Buffer,seed:number,resolution:string}>, styleRefsUsed:string[], styleRefsMissing:string[]}>}
 */
async function generate({ prompt, negativePrompt, aspectRatio = '4x5', numImages = 4, renderingSpeed = 'DEFAULT', styleRefFiles = [] }) {
  const key = process.env.IDEOGRAM_API_KEY;
  if (!key) throw new Error('IDEOGRAM_API_KEY not set');
  if (!prompt) throw new Error('prompt is required');

  const { refs, missing } = loadStyleRefs(styleRefFiles);

  const form = new FormData();
  form.append('prompt', prompt);
  if (negativePrompt) form.append('negative_prompt', negativePrompt);
  form.append('aspect_ratio', aspectRatio);
  form.append('num_images', String(numImages));
  form.append('rendering_speed', renderingSpeed);
  form.append('magic_prompt', 'OFF'); // v11: exact words, not Ideogram's rewrite
  for (const r of refs) form.append('style_reference_images', new Blob([r.buffer]), r.name);

  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Api-Key': key }, body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Ideogram ${res.status}: ${txt.slice(0, 400)}`);
  }
  const json = await res.json();

  const candidates = [];
  for (const d of json.data || []) {
    if (!d.url) continue;
    const ir = await fetch(d.url);
    if (!ir.ok) continue;
    const ab = await ir.arrayBuffer();
    candidates.push({ buffer: Buffer.from(ab), seed: d.seed, resolution: d.resolution, styleType: d.style_type });
  }
  if (!candidates.length) throw new Error('Ideogram returned no usable images');

  // Spend telemetry — Ideogram bills per generated image, whether we keep it or not.
  require('./telemetry').reportSpend('ideogram', (json.data || []).length || numImages);

  return { candidates, styleRefsUsed: refs.map((r) => r.name), styleRefsMissing: missing };
}

module.exports = { isConfigured, generate, loadStyleRefs, ENDPOINT, REFS_DIR };
