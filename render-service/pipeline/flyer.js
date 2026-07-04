// composeFlyer — the heart of the wiring.
//
// template + content + background plate + person cutout → a finished flyer in
// every distribution size. The chassis is rendered NATIVELY at the portrait
// "master" ratios (4:5, 1:1, 9:16) so the locked text is razor-sharp where it
// matters most; the wide/derived sizes are produced from the 4:5 master via the
// proven derive step (letterbox for organic, smart-crop for paid).

const brand = require('../brand');
const templates = require('../templates');
const gdrive = require('../integrations/gdrive');
const { compose } = require('./chassis');
const { deriveSize, slugify } = require('./derive');

const NATIVE = ['4x5', '1x1', '9x16']; // chassis renders cleanly at these portrait ratios

function entry(sizeKey, buffer, channel, family, slug, native) {
  const sz = brand.sizes[sizeKey];
  return {
    sizeKey, label: sz.label, width: sz.w, height: sz.h,
    channel, family, native,
    filename: `${slug}_${family}_${sizeKey}.png`,
    buffer, bytes: buffer.length,
  };
}

/**
 * @param {object} o {templateKey, content, background:Buffer, person:Buffer|null, slug?,
 *                    style?: {font,accent,headline}, masterOnly?: boolean}
 * masterOnly renders just the 4:5 master — used by /compose-variants for fast previews.
 * @returns {Promise<{templateKey,family,channel,slug,layout,style,spec,images:[]}>}
 */
async function composeFlyer(o) {
  const tpl = templates.byKey[o.templateKey];
  if (!tpl) throw new Error(`Unknown template: ${o.templateKey}`);
  if (!o.background) throw new Error('background is required');

  const spec = templates.buildChassis(o.templateKey, o.content || {});
  if (!spec) throw new Error(`No chassis for template: ${o.templateKey}`);
  spec.style = brand.sanitizeStyle(o.style);

  const family = tpl.family;                       // 'A' | 'A-Lite' | 'B'
  const channel = family === 'A-Lite' ? 'paid' : 'organic';
  const sizeKeys = o.masterOnly ? ['4x5'] : (brand.FAMILY_SIZES[family] || brand.ORGANIC_SIZES);
  const slug = slugify(o.slug || (o.content && o.content.title) || tpl.label);
  const person = spec.layout === 'testimonial' ? null : (o.person || null);
  // Grant-compliance flyers (e.g. (You)nity) carry the AACME logo — fetched once.
  const aacmeLogo = spec.compliance ? await gdrive.getAacmeLogo() : null;

  const out = [];
  let master = null;

  // Native portrait renders.
  for (const sk of sizeKeys) {
    if (!NATIVE.includes(sk)) continue;
    const sz = brand.sizes[sk];
    const buf = await compose({ background: o.background, person, width: sz.w, height: sz.h, spec, aacmeLogo });
    if (sk === '4x5') master = buf;
    out.push(entry(sk, buf, channel, family, slug, true));
  }
  if (!master && out.length) master = out[0].buffer;

  // Derived wides from the 4:5 master.
  for (const sk of sizeKeys) {
    if (NATIVE.includes(sk)) continue;
    const policy = family === 'A-Lite' ? 'smart' : 'letterbox';
    const r = await deriveSize(master, sk, { policy });
    out.push(entry(sk, r.buffer, channel, family, slug, false));
  }

  out.sort((a, b) => sizeKeys.indexOf(a.sizeKey) - sizeKeys.indexOf(b.sizeKey));
  return { templateKey: o.templateKey, family, channel, slug, layout: spec.layout, style: spec.style, spec, images: out };
}

module.exports = { composeFlyer, NATIVE };
