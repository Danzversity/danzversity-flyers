// Bundle export — zips upload-ready creative sets so there's zero manual
// renaming/cropping before pushing to Meta Ads Manager or Google PMax.
//
//   Meta bundle  → Style A-Lite 4:5 + 1:1 + 9:16   (Meta's 3 paid placements)
//   PMax bundle  → Style A-Lite 4:5 + 1:1 + 9:16 + 1.91:1  (full PMax coverage)
//
// Both pull from the paid family. Bundle definitions live in brand.js so the
// size sets stay in one place.

const archiver = require('archiver');
const brand = require('../brand');

/**
 * Zip an array of {filename, buffer} into a single Buffer.
 * @returns {Promise<Buffer>}
 */
function zipBuffer(files) {
  return new Promise((resolve, reject) => {
    if (!files || !files.length) return reject(new Error('Nothing to zip'));
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', (c) => chunks.push(c));
    archive.on('warning', (e) => { if (e.code !== 'ENOENT') reject(e); });
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const f of files) archive.append(f.buffer, { name: f.filename });
    archive.finalize();
  });
}

/** Filter an array of derived A-Lite images down to a bundle's size set. */
function pickBundle(derivedAlite, bundleKey) {
  const def = brand.bundles[bundleKey];
  if (!def) throw new Error(`Unknown bundle: ${bundleKey}`);
  const wanted = new Set(def.sizes);
  const picked = derivedAlite.filter((d) => wanted.has(d.sizeKey));
  const found = new Set(picked.map((d) => d.sizeKey));
  const missing = def.sizes.filter((s) => !found.has(s));
  return { picked, missing, def };
}

/**
 * Build a bundle zip from already-derived A-Lite images.
 * @returns {Promise<{buffer:Buffer, filename:string, sizes:string[], missing:string[]}>}
 */
async function buildBundle(derivedAlite, bundleKey, slug) {
  const { picked, missing, def } = pickBundle(derivedAlite, bundleKey);
  if (!picked.length) throw new Error(`No images for ${bundleKey} bundle (need ${def.sizes.join(', ')})`);
  const buffer = await zipBuffer(picked.map((p) => ({ filename: p.filename, buffer: p.buffer })));
  return {
    buffer,
    filename: `${slug || 'flyer'}_${bundleKey}-bundle.zip`,
    sizes: picked.map((p) => p.sizeKey),
    missing,
  };
}

module.exports = { zipBuffer, pickBundle, buildBundle };
