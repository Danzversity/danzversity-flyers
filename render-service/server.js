// Danzversity Flyer Pipeline — API + static frontend.
//
// Master in → everything out. Upload an Ideogram-approved master, get back every
// distribution size for each creative family (Style A organic / Style A-Lite paid),
// plus one-click Meta/PMax bundles and Drive save.
//
// Endpoints:
//   GET  /health               service + brand status
//   POST /process              multipart masters -> all sizes (JSON, base64)
//   POST /export-meta-bundle   multipart A-Lite master -> Meta zip (4:5+1:1+9:16)
//   POST /export-pmax-bundle   multipart A-Lite master -> PMax zip (+1.91:1)
//   POST /save-to-drive        JSON base64 images -> FLYERS/{tpl}/{YYYY-MM}/{bucket}
//
// The frontend (served at /) does client-side zipping for instant downloads; the
// bundle endpoints exist for headless/API/cron use.

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');

const brand = require('./brand');
const templates = require('./templates');
const { deriveFamily, deriveSize, slugify, masterMeta } = require('./pipeline/derive');
const { buildBundle } = require('./pipeline/bundle');
const { assemble, verifyUrl } = require('./pipeline/prompt');
const { composeFlyer } = require('./pipeline/flyer');
const library = require('./pipeline/library');
const gdrive = require('./integrations/gdrive');
const ideogram = require('./integrations/ideogram');
const removebg = require('./integrations/removebg');

const app = express();
const PORT = process.env.PORT || 3001;
const VERSION = '1.0.0';

// ── Middleware ───────────────────────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()) }));

// Lightweight security headers.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Optional password gate — active only when FLYERS_PASSWORD is set. /health is
// always exempt so platform health checks work.
const FLYERS_USER = process.env.FLYERS_USER || 'danzversity';
const FLYERS_PASSWORD = process.env.FLYERS_PASSWORD || '';
if (FLYERS_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
      if (u === FLYERS_USER && p === FLYERS_PASSWORD) return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Danzversity Flyer Pipeline"');
    return res.status(401).send('Authentication required');
  });
}

app.use(express.json({ limit: '80mb' })); // base64 images for /save-to-drive

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 4 },
});

// Serve the frontend (Cloudflare Pages serves it in prod; this is for local dev).
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseFamilies(raw) {
  const valid = Object.keys(brand.families); // ['A','A-Lite','B']
  if (!raw) return ['A', 'A-Lite'];
  const req = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  const picked = req.filter((f) => valid.includes(f));
  return picked.length ? picked : ['A', 'A-Lite'];
}

// Map an uploaded multer .fields() result to { A, 'A-Lite', B } buffers.
function mastersFromFiles(files) {
  const pick = (k) => (files && files[k] && files[k][0] ? files[k][0].buffer : null);
  return { A: pick('masterA'), 'A-Lite': pick('masterALite'), B: pick('masterB') };
}

function imagePayload(d, includeBase64 = true) {
  const o = {
    family: d.family,
    channel: d.channel,
    sizeKey: d.sizeKey,
    label: d.label,
    filename: d.filename,
    width: d.width,
    height: d.height,
    policy: d.policy,
    bytes: d.bytes,
  };
  if (includeBase64) o.base64 = d.buffer.toString('base64');
  return o;
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'danzversity-flyer-pipeline',
    version: VERSION,
    brandVersion: brand.VERSION,
    driveConfigured: gdrive.isConfigured(),
    ideogramConfigured: ideogram.isConfigured(),
    removebgConfigured: removebg.isConfigured(),
    library: library.status(),
    templateCount: templates.TEMPLATES.length,
    families: Object.values(brand.families).map((f) => ({ key: f.key, label: f.label, channel: f.channel })),
    sizes: Object.values(brand.sizes).map((s) => ({ key: s.key, label: s.label, w: s.w, h: s.h })),
    bundles: Object.values(brand.bundles).map((b) => ({ key: b.key, label: b.label, sizes: b.sizes })),
  });
});

// ── CREATE step ──────────────────────────────────────────────────────────────
// List templates + their content fields.
app.get('/templates', (req, res) => {
  res.json({ ok: true, ideogramConfigured: ideogram.isConfigured(), templates: templates.listTemplates() });
});

// Assemble the Ideogram prompt + ad copy from form content, and live-check the URL.
// No generation — this is the "guided" output and the preview before generating.
app.post('/assemble', async (req, res) => {
  try {
    const { templateKey, content } = req.body || {};
    if (!templateKey) return res.status(400).json({ ok: false, error: 'templateKey required' });
    const a = assemble(templateKey, content || {});
    const urlStatus = await verifyUrl(a.url);
    res.json({ ok: true, ...a, urlStatus, ideogramConfigured: ideogram.isConfigured() });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Generate candidate masters via Ideogram. If no key, returns 503 + the assembled
// prompt so the frontend can run in guided mode (paste into Ideogram by hand).
app.post('/generate', async (req, res) => {
  const t0 = Date.now();
  try {
    const { templateKey, content, numImages } = req.body || {};
    if (!templateKey) return res.status(400).json({ ok: false, error: 'templateKey required' });
    const a = assemble(templateKey, content || {});
    const urlStatus = await verifyUrl(a.url);

    if (!ideogram.isConfigured()) {
      return res.status(503).json({ ok: false, mode: 'guided', error: 'IDEOGRAM_API_KEY not set', assembled: { ...a, urlStatus } });
    }

    const n = Math.min(Math.max(parseInt(numImages, 10) || 4, 1), 8);
    const out = await ideogram.generate({
      prompt: a.prompt, negativePrompt: a.negativePrompt, aspectRatio: a.aspectRatio, numImages: n, styleRefFiles: a.styleRefs,
    });
    res.json({
      ok: true, mode: 'generated', templateKey, family: a.family, channel: a.channel,
      url: a.url, urlStatus, adCopy: a.adCopy,
      styleRefsUsed: out.styleRefsUsed, styleRefsMissing: out.styleRefsMissing,
      generateMs: Date.now() - t0,
      candidates: out.candidates.map((c, i) => ({ index: i, seed: c.seed, resolution: c.resolution, base64: c.buffer.toString('base64') })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Standalone URL check (Standing Rule 1).
app.get('/verify-url', async (req, res) => {
  const u = req.query.u;
  if (!u) return res.status(400).json({ ok: false, error: '?u= required' });
  res.json({ ok: true, ...(await verifyUrl(String(u))) });
});

// ── COMPOSE (hybrid model: library background + real photo + code chassis) ────
app.get('/backgrounds', async (req, res) => {
  try { res.json({ ok: true, source: library.status().backgrounds, items: await library.list('backgrounds') }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/people', async (req, res) => {
  try { res.json({ ok: true, source: library.status().people, items: await library.list('people') }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Small JPEG thumbnail of a library asset (works for Drive + local).
app.get('/thumb', async (req, res) => {
  try {
    const kind = req.query.kind === 'people' ? 'people' : 'backgrounds';
    if (!req.query.id) return res.status(400).end();
    const buf = await library.get(kind, String(req.query.id));
    const out = await sharp(buf).resize(240, 300, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(out);
  } catch (e) { res.status(404).end(); }
});
app.post('/upload-background', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'file required' });
    res.json({ ok: true, ...(await library.upload('backgrounds', req.file.originalname || `bg-${Date.now()}.png`, req.file.buffer, req.file.mimetype || 'image/png')) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post('/upload-person', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'file required' });
    res.json({ ok: true, ...(await library.upload('people', req.file.originalname || `person-${Date.now()}.png`, req.file.buffer, req.file.mimetype || 'image/png')) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Compose a flyer: library background + (uploaded or library) person + chassis → all sizes.
app.post('/compose', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'background', maxCount: 1 }]), async (req, res) => {
  const t0 = Date.now();
  try {
    const templateKey = req.body.templateKey;
    if (!templateKey) return res.status(400).json({ ok: false, error: 'templateKey required' });

    let content = {};
    if (req.body.content) { try { content = JSON.parse(req.body.content); } catch (_) { return res.status(400).json({ ok: false, error: 'content must be JSON' }); } }

    // mode: 'photo' = the photo fills the frame (full-bleed); 'plate' = cut-out person on a background plate.
    const mode = req.body.mode === 'plate' ? 'plate' : 'photo';

    // Gather the photo (uploaded, optionally saved to library, OR a library person).
    let photoBuf = null;
    const photoUp = req.files && req.files.photo && req.files.photo[0];
    if (photoUp) {
      photoBuf = photoUp.buffer;
      if (req.body.savePhoto === 'true') { try { await library.upload('people', photoUp.originalname || `photo-${Date.now()}.png`, photoUp.buffer, photoUp.mimetype || 'image/png'); } catch (_) { /* non-fatal */ } }
    } else if (req.body.personId) {
      photoBuf = await library.get('people', req.body.personId);
    }

    // Gather the background plate (uploaded, optionally saved, OR a library bg).
    let plateBuf = null;
    const bgUp = req.files && req.files.background && req.files.background[0];
    if (bgUp) {
      plateBuf = bgUp.buffer;
      if (req.body.saveBg === 'true') { try { await library.upload('backgrounds', bgUp.originalname || `bg-${Date.now()}.png`, bgUp.buffer, bgUp.mimetype || 'image/png'); } catch (_) { /* non-fatal */ } }
    } else if (req.body.backgroundId) {
      plateBuf = await library.get('backgrounds', req.body.backgroundId);
    }

    let background, person = null;
    if (mode === 'photo') {
      if (!photoBuf) return res.status(400).json({ ok: false, error: 'Full-bleed mode needs a photo.' });
      background = photoBuf; // the photo IS the background — no rectangle, no second plate
    } else {
      if (!plateBuf) return res.status(400).json({ ok: false, error: 'Cut-out mode needs a background plate.' });
      background = plateBuf;
      person = photoBuf ? await removebg.cutoutCached(photoBuf) : null; // cut the person out onto the plate
    }

    const result = await composeFlyer({ templateKey, content, background, person, slug: req.body.slug || content.title });
    const images = result.images.map((i) => ({
      family: i.family, channel: i.channel, sizeKey: i.sizeKey, label: i.label,
      filename: i.filename, width: i.width, height: i.height, native: i.native, bytes: i.bytes,
      base64: i.buffer.toString('base64'),
    }));

    let adCopy = null;
    try { adCopy = assemble(templateKey, content).adCopy; } catch (_) { /* non-fatal */ }

    res.json({
      ok: true, templateKey, mode, family: result.family, channel: result.channel, slug: result.slug, layout: result.layout,
      month: content.month || '', driveConfigured: gdrive.isConfigured(), adCopy,
      counts: { total: images.length }, renderMs: Date.now() - t0, images,
    });
  } catch (e) {
    console.error('/compose error:', e.stack || e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const processUpload = upload.fields([
  { name: 'masterA', maxCount: 1 },
  { name: 'masterALite', maxCount: 1 },
  { name: 'masterB', maxCount: 1 },
]);

app.post('/process', processUpload, async (req, res) => {
  const t0 = Date.now();
  try {
    const template = (req.body.template || 'flyer').trim();
    const slug = slugify(req.body.slug || template);
    const month = (req.body.month || '').trim(); // YYYY-MM, used by /save-to-drive
    const requested = parseFamilies(req.body.families);

    const masters = mastersFromFiles(req.files);
    const anyMaster = masters.A || masters['A-Lite'] || masters.B;
    if (!anyMaster) {
      return res.status(400).json({ ok: false, error: 'No master uploaded. Send masterA and/or masterALite.' });
    }

    const warnings = [];
    const images = [];
    for (const fam of requested) {
      // Prefer the family's own master; fall back to any uploaded master.
      let buf = masters[fam];
      let derivedFrom = fam;
      if (!buf) {
        const fallbackKey = ['A', 'A-Lite', 'B'].find((k) => masters[k]);
        buf = masters[fallbackKey];
        derivedFrom = fallbackKey;
        warnings.push(`${fam}: no ${fam} master uploaded — derived from ${fallbackKey} master. For best results upload a dedicated ${fam} master.`);
      }
      const derived = await deriveFamily(buf, fam, { slug });
      for (const d of derived) images.push({ ...imagePayload(d), derivedFrom });
    }

    const organic = images.filter((i) => i.channel === 'organic').length;
    const paid = images.filter((i) => i.channel === 'paid').length;

    res.json({
      ok: true,
      template,
      slug,
      month,
      brandVersion: brand.VERSION,
      driveConfigured: gdrive.isConfigured(),
      renderMs: Date.now() - t0,
      counts: { organic, paid, total: images.length },
      families: requested,
      warnings,
      images,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Shared handler for the two bundle endpoints.
function bundleHandler(bundleKey) {
  return async (req, res) => {
    try {
      const master = req.file ? req.file.buffer : null;
      if (!master) return res.status(400).json({ ok: false, error: 'Upload the Style A-Lite master as "master".' });
      const slug = slugify(req.body.slug || req.body.template || 'flyer');
      const derived = await deriveFamily(master, 'A-Lite', { slug });
      const bundle = await buildBundle(derived, bundleKey, slug);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${bundle.filename}"`);
      res.send(bundle.buffer);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  };
}

app.post('/export-meta-bundle', upload.single('master'), bundleHandler('meta'));
app.post('/export-pmax-bundle', upload.single('master'), bundleHandler('pmax'));

// Re-derive a single size with an explicit policy — backs the grid's fit/fill
// toggle so a bad smart-crop is a one-click fix, not a full reprocess.
app.post('/derive-one', upload.single('master'), async (req, res) => {
  try {
    const master = req.file ? req.file.buffer : null;
    if (!master) return res.status(400).json({ ok: false, error: 'Upload the master as "master".' });
    const family = parseFamilies(req.body.family)[0];
    const sizeKey = (req.body.sizeKey || '').trim();
    if (!brand.sizes[sizeKey]) return res.status(400).json({ ok: false, error: `Unknown sizeKey: ${sizeKey}` });
    const policy = ['smart', 'letterbox'].includes(req.body.policy) ? req.body.policy : brand.cropPolicyFor(family);
    const slug = slugify(req.body.slug || req.body.template || 'flyer');
    const r = await deriveSize(master, sizeKey, { policy });
    res.json({
      ok: true,
      image: {
        family,
        channel: brand.channelFor(family),
        sizeKey,
        label: r.label,
        width: r.width,
        height: r.height,
        policy: r.policy,
        filename: `${slug}_${family}_${sizeKey}.png`,
        bytes: r.bytes,
        base64: r.buffer.toString('base64'),
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/save-to-drive', async (req, res) => {
  try {
    if (!gdrive.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Drive not configured (GOOGLE_SERVICE_ACCOUNT missing).' });
    }
    const { template, month, images } = req.body || {};
    if (!template || !month) return res.status(400).json({ ok: false, error: 'template and month (YYYY-MM) are required.' });
    if (!Array.isArray(images) || !images.length) return res.status(400).json({ ok: false, error: 'images[] is required.' });

    const decoded = images.map((i) => ({
      filename: i.filename,
      channel: i.channel === 'paid' ? 'paid' : 'organic',
      buffer: Buffer.from(i.base64, 'base64'),
    }));

    const t0 = Date.now();
    const { results, savedCount } = await gdrive.saveImages(template, month, decoded);
    res.json({ ok: true, savedCount, saveMs: Date.now() - t0, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Multer / generic error guard.
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ ok: false, error: err.message });
  next();
});

app.listen(PORT, () => {
  console.log(`Danzversity Flyer Pipeline v${VERSION} (brand v${brand.VERSION}) on :${PORT}`);
  console.log(`Drive: ${gdrive.isConfigured() ? 'configured' : 'NOT configured'} | CORS: ${corsOrigin} | Auth: ${FLYERS_PASSWORD ? 'ON' : 'off'}`);
});

module.exports = app;
