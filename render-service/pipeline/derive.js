// Size-derivation core — the heart of the Flyer Pipeline.
//
// Takes ONE Ideogram-approved master and derives every distribution size for a
// creative family. Two policies (see brand.js):
//   letterbox — pad onto pure brand black. Lossless. Nothing baked on the image
//               (headline, prices, URL) is ever cropped off. Default for the
//               text-rich Style A and hype Style B families.
//   smart     — fill-crop with saliency bias toward the dancers. Fills the frame
//               (no bars). Default for photo-dominant Style A-Lite, where the
//               photo is the point and the little text rides a bottom safe-area.
//
// The frontend shows every derived size in an approval grid, so a human eyes the
// crops before anything saves. The policy is returned per image and can be
// overridden per size, so a bad crop is a one-click re-derive, not a redo.

const sharp = require('sharp');
const brand = require('../brand');

/** Make a filesystem/URL-safe slug from any label. */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'flyer';
}

/** Read the master's intrinsic dimensions (after auto-rotate). */
async function masterMeta(masterBuffer) {
  const m = await sharp(masterBuffer).rotate().metadata();
  return { width: m.width, height: m.height, format: m.format };
}

/**
 * Derive a single target size from the master.
 * @returns {Promise<{sizeKey,label,width,height,policy,buffer,bytes}>}
 */
async function deriveSize(masterBuffer, sizeKey, opts = {}) {
  const size = brand.sizes[sizeKey];
  if (!size) throw new Error(`Unknown size: ${sizeKey}`);

  const policy = opts.policy === 'smart' ? 'smart' : 'letterbox';

  // Always flatten onto black first so any transparency in the master becomes
  // brand black (and letterbox bars match the baked background seamlessly).
  const pipeline = sharp(masterBuffer).rotate().flatten({ background: brand.LETTERBOX_FILL });

  if (policy === 'smart') {
    // Saliency-aware fill-crop. attention focuses on the highest-contrast region
    // (the dancers), which is what we want to keep when filling wide/short frames.
    const position = opts.position || sharp.strategy.attention;
    pipeline.resize(size.w, size.h, { fit: 'cover', position });
  } else {
    pipeline.resize(size.w, size.h, { fit: 'contain', background: brand.LETTERBOX_FILL });
  }

  const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  return {
    sizeKey,
    label: size.label,
    width: size.w,
    height: size.h,
    policy,
    buffer,
    bytes: buffer.length,
  };
}

/**
 * Derive the full size set for one creative family from its master.
 * @param {Buffer} masterBuffer
 * @param {'A'|'A-Lite'|'B'} familyKey
 * @param {object} opts { slug, policyBySize?, position? }
 * @returns {Promise<Array>} one entry per size, with buffer + metadata
 */
async function deriveFamily(masterBuffer, familyKey, opts = {}) {
  const fam = brand.families[familyKey];
  if (!fam) throw new Error(`Unknown family: ${familyKey}`);

  const slug = opts.slug ? slugify(opts.slug) : 'flyer';
  const sizeKeys = brand.FAMILY_SIZES[familyKey] || [];
  const defaultPolicy = brand.cropPolicyFor(familyKey);
  const overrides = opts.policyBySize || {};

  const out = [];
  for (const sk of sizeKeys) {
    const policy = overrides[sk] || defaultPolicy;
    const r = await deriveSize(masterBuffer, sk, { policy, position: opts.position });
    out.push({
      family: familyKey,
      channel: fam.channel,
      sizeKey: sk,
      label: r.label,
      width: r.width,
      height: r.height,
      policy: r.policy,
      filename: `${slug}_${familyKey}_${sk}.png`,
      buffer: r.buffer,
      bytes: r.bytes,
    });
  }
  return out;
}

module.exports = { slugify, masterMeta, deriveSize, deriveFamily };
