// Remove.bg integration — cut the background out of a real photo so the person
// composites cleanly into the flyer's middle zone.
//
// API: POST https://api.remove.bg/v1.0/removebg, header X-Api-Key, multipart
// image_file → returns a transparent PNG. Cached in-memory by content hash so a
// repeated render of the same photo doesn't re-spend the $0.20 call.

const crypto = require('crypto');

const ENDPOINT = 'https://api.remove.bg/v1.0/removebg';
const cache = new Map();

function isConfigured() {
  return !!process.env.REMOVEBG_API_KEY;
}

async function cutout(buffer) {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) return buffer; // graceful: composite the raw photo if no key

  const form = new FormData();
  form.append('image_file', new Blob([buffer]), 'photo.png');
  form.append('size', 'auto');

  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'X-Api-Key': key }, body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Remove.bg ${res.status}: ${txt.slice(0, 200)}`);
  }
  // Spend telemetry — Remove.bg bills one credit per successful cutout.
  // (cutoutCached() cache hits never reach here, so they cost — and report — nothing.)
  require('./telemetry').reportSpend('removebg', 1);
  return Buffer.from(await res.arrayBuffer());
}

/** cutout() with an in-memory cache keyed by the source photo's hash. */
async function cutoutCached(buffer) {
  const h = crypto.createHash('sha1').update(buffer).digest('hex');
  if (cache.has(h)) return cache.get(h);
  const out = await cutout(buffer);
  cache.set(h, out);
  return out;
}

module.exports = { isConfigured, cutout, cutoutCached, ENDPOINT };
