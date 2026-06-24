// Code-rendered brand chassis — the DETERMINISTIC layer.
//
// AI (a library background) and the real-photo person change; THIS never does.
// Given a content spec + canvas size, it renders the locked elements as an SVG
// with the font embedded base64 (identical on any machine) and composites them
// over the background (+ optional person cutout) with Sharp. Same input → same
// bytes. v11-clean: no neon/glow/decoration — just crisp brand text over scrims.
//
// Layouts (spec.layout): 'A' standard · 'A-Lite' paid photo-dominant ·
// 'B' hype · 'testimonial' quote-centric. Info blocks are bottom-anchored so
// sparse products don't float.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const QRCode = require('qrcode');
const brand = require('../brand');

const FONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'BebasNeue-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'refs', 'logo.png');
const G = brand.palette.gold, WHT = brand.palette.textPrimary, BLK = brand.palette.black;

let _fontB64 = null;
function fontB64() { if (_fontB64 == null) _fontB64 = fs.readFileSync(FONT_PATH).toString('base64'); return _fontB64; }
// Inter (subset, Medium) — the brand body font. Bebas is display-only; Inter
// carries all the supporting text so flyers don't read as one mono display font.
const INTER_PATH = path.join(__dirname, '..', '..', 'fonts', 'Inter-Body.ttf');
let _interB64 = null;
function interB64() { if (_interB64 == null) _interB64 = fs.readFileSync(INTER_PATH).toString('base64'); return _interB64; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function defs(topH, botStart) {
  return `<defs>
    <linearGradient id="ts" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.9"/><stop offset="0.6" stop-color="#000" stop-opacity="0.4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="bs" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.97"/><stop offset="0.5" stop-color="#000" stop-opacity="0.82"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="ps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.55" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient>
    <style>@font-face{font-family:'Bebas Neue';src:url(data:font/ttf;base64,${fontB64()}) format('truetype');}@font-face{font-family:'Inter';src:url(data:font/ttf;base64,${interB64()}) format('truetype');}text{font-family:'Bebas Neue',sans-serif;}</style>
  </defs>
  <rect x="0" y="0" width="100%" height="${topH}" fill="url(#ts)"/>
  <rect x="0" y="${botStart}" width="100%" height="${100}%" fill="url(#bs)"/>`;
}

function wrapWords(s, maxChars) {
  const words = String(s).split(/\s+/);
  const lines = []; let cur = '';
  for (const wd of words) { if ((cur + ' ' + wd).trim().length > maxChars) { if (cur) lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); }
  if (cur) lines.push(cur);
  return lines;
}

// ── Style A (standard) — also drives Style B via opts ────────────────────────
function svgStyleA(W, H, spec, opts = {}) {
  const cx = W / 2, F = (f) => Math.round(H * f);
  const topH = F(opts.scrimTop || 0.34), botStart = F(0.55);
  // Text helper. Pass o.maxW to compress a line that would overflow that width
  // (Bebas is condensed; ~0.58em/char estimate) so long content never hits the edge.
  // Text helper. Default font is Inter (body); pass o.font:'bebas' for the display
  // headline. o.maxW shrinks the FONT SIZE (keeps letterforms) if a line would overflow.
  const t = (s, y, size, fill, o = {}) => {
    const ls = o.ls || 1;
    const fam = o.font === 'bebas' ? 'Bebas Neue' : 'Inter';
    let sz = size;
    if (o.maxW) { const est = String(s).length * (sz * (fam === 'Bebas Neue' ? 0.56 : 0.60) + ls); if (est > o.maxW) sz = Math.floor(sz * o.maxW / est); }
    return `<text x="${o.x || cx}" y="${y}" font-family="${fam}" font-size="${sz}" fill="${fill}" text-anchor="middle" letter-spacing="${ls}">${esc(s)}</text>`;
  };
  const L = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`, defs(topH, botStart)];

  // Extra scrim panel concentrated behind the lower info block — locks legibility
  // of the tagline / info / price over busy plates without darkening the photo band.
  L.push(`<rect x="0" y="${F(0.60)}" width="100%" height="${F(0.40)}" fill="url(#ps)"/>`);

  // Top block (logo is composited separately, above this).
  const hSize = F(opts.headlineSize || 0.062);
  // Kicker — eyebrow line above the headline (proof / tenure / credibility).
  // Positioned relative to the headline size so it clears the big Style-B head.
  if (spec.kicker) L.push(t(spec.kicker, F(0.262) - hSize - F(0.016), F(0.022), G, { ls: 3, maxW: W * 0.9 }));
  if (spec.headline) {
    L.push(t(spec.headline, F(0.262), hSize, G, { maxW: W * 0.9, font: 'bebas' }));
    if (opts.headlineBar) L.push(`<rect x="${cx - F(0.14)}" y="${F(0.275)}" width="${F(0.28)}" height="${Math.max(3, F(0.006))}" fill="${G}"/>`);
  }
  if (spec.subhead) L.push(t(spec.subhead, F(opts.headlineBar ? 0.318 : 0.306), F(0.032), WHT, { maxW: W * 0.88 }));

  // Footer — lifted to make room for a grant-compliance line when present.
  const hasCompliance = !!spec.compliance;
  if (spec.url) L.push(t(spec.url, F(hasCompliance ? 0.905 : 0.945), F(0.022), WHT, { ls: 2 }));
  if (spec.address) L.push(t(spec.address, F(hasCompliance ? 0.926 : 0.968), F(0.019), WHT, { ls: 1.5 }));
  if (hasCompliance) {
    let cy = F(0.950);
    for (const ln of wrapWords(spec.compliance, 56)) { L.push(t(ln, cy, F(0.0132), WHT, { ls: 0.5 })); cy += F(0.017); }
  }

  // Bottom block — anchored above the footer; lifted well clear of the QR when a
  // compliance line is present (so a lineup tagline never runs under the code).
  let y = F(hasCompliance ? 0.83 : 0.912);
  if (spec.cta) {
    const pw = F(0.32), ph = F(0.050), px = cx - pw / 2, py = y - ph;
    L.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${G}"/>`);
    L.push(t(spec.cta, py + ph * 0.70, F(0.030), BLK, { maxW: pw * 0.9 }));
    y = py - F(0.024);
  }
  // Urgency strip — gold-outlined badge just above the CTA (scarcity / deadline).
  if (spec.urgency) {
    const uh = F(0.042);
    const uw = Math.min(F(0.80), Math.max(F(0.34), spec.urgency.length * F(0.0142) + F(0.06)));
    const uy = y - uh;
    L.push(`<rect x="${cx - uw / 2}" y="${uy}" width="${uw}" height="${uh}" rx="${uh / 2}" fill="#000000" fill-opacity="0.35" stroke="${G}" stroke-width="${Math.max(2, F(0.0032))}"/>`);
    L.push(t(spec.urgency, uy + uh * 0.66, F(0.0235), G, { ls: 1.5 }));
    y = uy - F(0.024);
  }
  if (spec.price) { L.push(t(spec.price, y, F(0.035), G, { maxW: W * 0.88 })); y -= F(0.046); }
  const info = (spec.infoLines || []).filter(Boolean).slice().reverse();
  for (const line of info) { L.push(t(line, y, F(0.028), WHT, { maxW: W * 0.9 })); y -= F(0.035); }
  if (info.length || spec.price) { L.push(`<rect x="${cx - F(0.10)}" y="${y}" width="${F(0.20)}" height="${Math.max(2, F(0.004))}" fill="${G}"/>`); y -= F(0.030); }
  if (spec.tagline) L.push(t(spec.tagline, y, F(0.030), WHT, { maxW: W * 0.9 }));

  L.push('</svg>');
  return L.join('');
}

// ── Style A-Lite (paid, photo-dominant, minimal) ─────────────────────────────
function svgALite(W, H, spec) {
  const cx = W / 2, F = (f) => Math.round(H * f);
  const t = (s, y, size, fill, o = {}) => `<text x="${cx}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" letter-spacing="${o.ls || 1}">${esc(s)}</text>`;
  const L = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`, defs(F(0.20), F(0.72))];
  if (spec.headline) L.push(t(spec.headline, F(0.855), F(0.058), G));
  if (spec.subhead) L.push(t(spec.subhead, F(0.900), F(0.028), WHT));
  if (spec.url) L.push(t(`${spec.url}  ·  ${spec.address || ''}`.trim().replace(/·\s*$/, ''), F(0.950), F(0.020), WHT, { ls: 1.5 }));
  // thin gold accent bar at very bottom — single brand touch for paid
  L.push(`<rect x="0" y="${H - Math.max(4, F(0.008))}" width="100%" height="${Math.max(4, F(0.008))}" fill="${G}"/>`);
  L.push('</svg>');
  return L.join('');
}

// ── Testimonial (quote-centric) ──────────────────────────────────────────────
function svgTestimonial(W, H, spec) {
  const cx = W / 2, F = (f) => Math.round(H * f);
  const t = (s, y, size, fill, o = {}) => `<text x="${cx}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" letter-spacing="${o.ls || 1}">${esc(s)}</text>`;
  const L = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`, defs(F(0.30), F(0.55))];
  // gold corner frame
  const m = F(0.04), bar = Math.max(3, F(0.005));
  L.push(`<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${bar}" fill="${G}"/><rect x="${m}" y="${H - m - bar}" width="${W - 2 * m}" height="${bar}" fill="${G}"/>`);
  // quote (wrapped), centered vertically-ish
  const lines = wrapWords(`“${spec.quote || ''}”`, 20);
  const qSize = F(0.058), lineH = F(0.072);
  let y = H / 2 - ((lines.length - 1) * lineH) / 2 - F(0.04);
  for (const ln of lines) { L.push(t(ln, y, qSize, WHT)); y += lineH; }
  if (spec.keyword) L.push(t(spec.keyword.toUpperCase(), y + F(0.01), F(0.040), G));
  if (spec.reviewer) L.push(t(`${spec.reviewer}  ★★★★★`, F(0.80), F(0.030), G));
  if (spec.url) L.push(t(spec.url, F(0.910), F(0.022), WHT, { ls: 2 }));
  if (spec.address) L.push(t(spec.address, F(0.935), F(0.019), WHT, { ls: 1.5 }));
  L.push('</svg>');
  return L.join('');
}

function chassisSVG(W, H, spec) {
  const layout = spec.layout || 'A';
  if (layout === 'A-Lite') return svgALite(W, H, spec);
  if (layout === 'testimonial') return svgTestimonial(W, H, spec);
  if (layout === 'B') return svgStyleA(W, H, spec, { headlineSize: 0.080, headlineBar: true, scrimTop: 0.40 });
  return svgStyleA(W, H, spec, { headlineSize: 0.062 });
}

async function qrPng(data, size) {
  return QRCode.toBuffer(data, { type: 'png', width: size, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
}

// QR on a contained white tile with a SCAN label — reads as an intentional CTA
// instead of a bare code floating on the art.
async function qrTile(data, qs, label) {
  const pad = Math.round(qs * 0.12);
  const labelH = label ? Math.round(qs * 0.20) : 0;
  const tw = qs + pad * 2, th = qs + pad * 2 + labelH;
  const svg =
    `<svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<style>@font-face{font-family:'Bebas Neue';src:url(data:font/ttf;base64,${fontB64()}) format('truetype');}text{font-family:'Bebas Neue',sans-serif;}</style></defs>` +
    `<rect x="0" y="0" width="${tw}" height="${th}" rx="${Math.round(pad * 1.1)}" fill="#FFFFFF"/>` +
    (label ? `<text x="${tw / 2}" y="${qs + pad * 2 + Math.round(labelH * 0.70)}" font-size="${Math.round(labelH * 0.6)}" fill="#000000" text-anchor="middle" letter-spacing="1" textLength="${tw - pad}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>` : '') +
    `</svg>`;
  const qr = await qrPng(data, qs);
  return sharp(Buffer.from(svg)).composite([{ input: qr, top: pad, left: pad }]).png().toBuffer();
}

// Feather mask sized to the photo: transparent at the very top, ramping to fully
// opaque by ~34% down. dest-in'd onto an OPAQUE photo so its top edge dissolves
// into the plate (the plate shows through the fade) instead of a hard seam.
function featherMaskSVG(w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="0.16" stop-color="#fff" stop-opacity="0.45"/>` +
    `<stop offset="0.34" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="1"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#f)"/></svg>`
  );
}

// Band mask — feathers BOTH the top and bottom edges, so a photo placed as a
// clear middle band floats between the headline (above) and the info block
// (below) with no hard seam on either side.
function bandMaskSVG(w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="0.14" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="0.88" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#b)"/></svg>`
  );
}

// Side mask — feathers the LEFT and RIGHT edges. Applied as a second dest-in
// pass after the band mask so the standard scene photo melts into the plate on
// all four sides (no hard vertical seams).
function sideMaskSVG(w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="s" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="0.09" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="0.91" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#s)"/></svg>`
  );
}

// Place the real photo over the plate, INTEGRATED rather than pasted:
//  • genuine cutout (real transparency) → floats with a soft contact shadow;
//  • standard scene photo → SMART-CROPPED to the subjects (cover + attention)
//    into a clean middle band, feathered on ALL FOUR sides + tone-graded;
//  • paid (A-Lite) scene → photo-dominant high band, top-edge feather.
async function personLayers(personInput, W, H, layout) {
  const isPaid = layout === 'A-Lite';

  // Genuine cutout, or an opaque scene photo that merely carries an alpha channel?
  const meta0 = await sharp(personInput).metadata();
  let isCutout = false;
  if (meta0.hasAlpha) {
    const a = (await sharp(personInput).stats()).channels.slice(-1)[0];
    isCutout = a && a.min < 250; // real transparent pixels exist somewhere
  }

  // ── Cutout: fit within its zone, ground it with a soft contact shadow. ──
  if (isCutout) {
    const ph = Math.round(H * (isPaid ? 0.70 : 0.29));
    const maxW = Math.round(W * (isPaid ? 0.94 : 0.86));
    const resized = await sharp(personInput).resize({ height: ph, width: maxW, fit: 'inside' }).png().toBuffer();
    const m = await sharp(resized).metadata();
    const left = Math.round((W - m.width) / 2);
    const top = isPaid ? Math.round(H * 0.13) : Math.round(H * 0.34);
    const sigma = Math.max(2, Math.round(ph * 0.02));
    const shadow = await sharp(resized).modulate({ brightness: 0 }).blur(sigma).png().toBuffer();
    return [{ input: shadow, top: top + Math.round(ph * 0.022), left }, { input: resized, top, left }];
  }

  // ── Paid scene: photo-dominant high band, top-edge feather only. ──
  if (isPaid) {
    const ph = Math.round(H * 0.70), maxW = Math.round(W * 0.94);
    const resized = await sharp(personInput).resize({ height: ph, width: maxW, fit: 'inside' })
      .modulate({ brightness: 0.94, saturation: 0.9 }).ensureAlpha().png().toBuffer();
    const m = await sharp(resized).metadata();
    const masked = await sharp(resized).composite([{ input: featherMaskSVG(m.width, m.height), blend: 'dest-in' }]).png().toBuffer();
    return [{ input: masked, top: Math.round(H * 0.13), left: Math.round((W - m.width) / 2) }];
  }

  // ── Standard scene (A/B): SMART-CROP to the dancers (cover + attention) into a
  // defined middle band, then feather all four edges + tone-grade so it melts
  // into the plate on every side. Band ends at ~63% so the info block clears it.
  const bandW = Math.round(W * 0.80), bandH = Math.round(H * 0.30);
  const top = Math.round(H * 0.335), left = Math.round((W - bandW) / 2);
  let treated = await sharp(personInput)
    .resize({ width: bandW, height: bandH, fit: 'cover', position: sharp.strategy.attention })
    .modulate({ brightness: 0.94, saturation: 0.9 })
    .ensureAlpha()
    .composite([{ input: bandMaskSVG(bandW, bandH), blend: 'dest-in' }])   // feather top + bottom
    .png().toBuffer();
  treated = await sharp(treated)
    .composite([{ input: sideMaskSVG(bandW, bandH), blend: 'dest-in' }])   // feather left + right
    .png().toBuffer();
  return [{ input: treated, top, left }];
}

/**
 * Compose a finished flyer at one size: background (+ optional person) + chassis (+ QR).
 */
async function compose(o) {
  const { width: W, height: H, spec = {} } = o;
  const layout = spec.layout || 'A';
  const layers = [];

  let base = sharp(o.background).resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).flatten({ background: brand.LETTERBOX_FILL });

  // Real photo over the plate — integrated (feathered/graded or floated with a
  // contact shadow), never a hard-pasted rectangle. See personLayers().
  if (o.person && layout !== 'testimonial') {
    for (const lyr of await personLayers(o.person, W, H, layout)) layers.push(lyr);
  }

  layers.push({ input: Buffer.from(chassisSVG(W, H, spec)), top: 0, left: 0 });

  // Logo — smaller for paid; centered top.
  if (spec.logo !== false && layout !== 'testimonial' && fs.existsSync(LOGO_PATH)) {
    const lw = Math.round(W * (layout === 'A-Lite' ? 0.24 : 0.30));
    const logoBuf = await sharp(LOGO_PATH).resize({ width: lw }).png().toBuffer();
    layers.push({ input: logoBuf, top: Math.round(H * 0.04), left: Math.round((W - lw) / 2) });
  }

  if (spec.qr) {
    const qs = Math.round(W * 0.13);
    const tile = await qrTile(spec.qr, qs, spec.cta ? 'SCAN TO REGISTER' : null);
    const tm = await sharp(tile).metadata();
    layers.push({ input: tile, top: H - tm.height - Math.round(H * 0.072), left: W - tm.width - Math.round(W * 0.04) });
  }

  // AACME grant logo (Elevate compliance) — bottom-left corner.
  if (o.aacmeLogo) {
    const lw = Math.round(W * 0.18);
    const logoBuf = await sharp(o.aacmeLogo).resize({ width: lw }).png().toBuffer();
    const lm = await sharp(logoBuf).metadata();
    layers.push({ input: logoBuf, top: H - lm.height - Math.round(H * 0.035), left: Math.round(W * 0.045) });
  }

  return base.composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = { compose, chassisSVG, qrPng, FONT_PATH, LOGO_PATH };
