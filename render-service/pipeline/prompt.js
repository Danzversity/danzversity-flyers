// Prompt assembler + URL verifier — the bridge from form content to a
// ready-to-generate Ideogram request (and the ad copy that rides alongside it).

const templates = require('../templates');

const TOKEN = /\{(\w+)\}/g;

function fillTokens(str, values) {
  return String(str).replace(TOKEN, (m, key) => (values[key] != null && values[key] !== '' ? values[key] : m));
}

/**
 * Build the full Ideogram request payload + ad copy for a template + content.
 * Pure (no network). Returns everything the Create step needs.
 */
function assemble(templateKey, content = {}) {
  const t = templates.byKey[templateKey];
  if (!t) throw new Error(`Unknown template: ${templateKey}`);

  // Start from defaults, layer user content, then add computed tokens (e.g. weekLine).
  const filled = {};
  for (const fld of t.fields) {
    const v = content[fld.name];
    filled[fld.name] = v != null && String(v).trim() !== '' ? String(v).trim() : (fld.default || '');
  }
  const expanded = templates.expandContent(t, { ...filled, ...content });
  for (const k of Object.keys(expanded)) if (filled[k] == null || filled[k] === '') filled[k] = expanded[k];

  const body = fillTokens(t.body, filled);
  const prompt = `${templates.OPENERS[t.family]}\n\n${body}`;

  // Ad copy: deep-fill the same tokens (e.g. the {week} in the Meta UTM url).
  let adCopy = null;
  if (t.adCopy) adCopy = JSON.parse(fillTokens(JSON.stringify(t.adCopy), filled));

  // Flag any required field the user left blank — surfaces in the UI, doesn't throw.
  const missing = t.fields.filter((fld) => fld.required && !filled[fld.name]).map((fld) => fld.name);

  return {
    templateKey,
    label: t.label,
    family: t.family,
    channel: t.family === 'A-Lite' ? 'paid' : 'organic',
    prompt,
    negativePrompt: templates.NEGATIVE_PROMPT,
    palette: templates.PALETTE,
    styleRefs: templates.STYLE_REFS[t.family],
    aspectRatio: '4x5',
    magicPrompt: 'OFF',
    url: (content.url && String(content.url).trim()) || t.defaultUrl,
    adCopy,
    missingRequired: missing,
  };
}

/**
 * Live-check a CTA URL (Flyer Design Standard Standing Rule 1). Follows
 * redirects; a 2xx/3xx final is OK. Never throws.
 */
async function verifyUrl(url) {
  if (!url) return { url, ok: false, status: 0, error: 'no url' };
  const opts = { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (DanzversityFlyerPipeline)' } };
  try {
    let res = await fetch(url, { method: 'HEAD', ...opts });
    if (res.status === 405 || res.status === 501) res = await fetch(url, { method: 'GET', ...opts });
    return { url, ok: res.status >= 200 && res.status < 400, status: res.status, finalUrl: res.url };
  } catch (e) {
    return { url, ok: false, status: 0, error: e.message };
  }
}

module.exports = { assemble, verifyUrl, fillTokens };
