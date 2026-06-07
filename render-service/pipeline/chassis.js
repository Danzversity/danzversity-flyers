// Code-rendered brand chassis — the DETERMINISTIC layer.
//
// AI (a library background) and the real-photo person change; THIS never does.
// Given a content spec + canvas size, it renders the locked elements — logo,
// gold Bebas Neue headline, exact event info, CTA pill, footer, QR — as an SVG
// with the font embedded base64 (so it renders identically on any machine), then
// composites them over the background (+ optional person cutout) with Sharp.
//
// v11-clean: no neon, no glow, no decorative graphics — just crisp brand text
// over dark scrims for legibility on any plate. Same input → byte-identical PNG.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const QRCode = require('qrcode');
const brand = require('../brand');

const FONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'BebasNeue-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'refs', 'logo.png');

let _fontB64 = null;
function fontB64() {
  if (_fontB64 == null) _fontB64 = fs.readFileSync(FONT_PATH).toString('base64');
  return _fontB64;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Build the chassis SVG (scrims + all text + CTA pill). Positions are fractions
// of the canvas, so one layout scales to every size.
function chassisSVG(W, H, spec) {
  const g = brand.palette.gold, w = brand.palette.textPrimary, blk = brand.palette.black;
  const cx = W / 2;
  const F = (frac) => Math.round(H * frac); // size/position helper (by height)
  const lines = [];

  // Scrims — dark gradients top & bottom for legibility over any plate.
  const defs = `<defs>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.85"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botScrim" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.92"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <style>@font-face{font-family:'Bebas Neue';src:url(data:font/ttf;base64,${fontB64()}) format('truetype');}
      text{font-family:'Bebas Neue',sans-serif;}</style>
  </defs>`;
  lines.push(`<rect x="0" y="0" width="${W}" height="${F(0.34)}" fill="url(#topScrim)"/>`);
  lines.push(`<rect x="0" y="${F(0.60)}" width="${W}" height="${F(0.40)}" fill="url(#botScrim)"/>`);

  const text = (s, y, size, fill, opts = {}) =>
    `<text x="${opts.x || cx}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${opts.anchor || 'middle'}" letter-spacing="${opts.ls || 1}"${opts.weight ? ` font-weight="${opts.weight}"` : ''}>${esc(s)}</text>`;

  // ── Top block (under logo, which is composited separately) ──
  // Headline sits clear below the logo (logo occupies ~0.04–0.185 H).
  if (spec.headline) lines.push(text(spec.headline, F(0.262), F(0.062), g));
  if (spec.subhead) lines.push(text(spec.subhead, F(0.306), F(0.032), w));

  // ── Bottom block (tuned so the CTA always clears the fixed footer) ──
  let y = F(0.620);
  if (spec.tagline) { lines.push(text(spec.tagline, y, F(0.030), w)); y += F(0.034); }
  // thin gold accent line
  lines.push(`<rect x="${cx - F(0.10)}" y="${y}" width="${F(0.20)}" height="${Math.max(2, F(0.004))}" fill="${g}"/>`);
  y += F(0.040);
  for (const line of spec.infoLines || []) { lines.push(text(line, y, F(0.028), w)); y += F(0.035); }
  if (spec.price) { lines.push(text(spec.price, y + F(0.004), F(0.035), g)); y += F(0.050); }

  // CTA pill
  if (spec.cta) {
    const pw = F(0.32), ph = F(0.050), px = cx - pw / 2, py = y;
    lines.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${g}"/>`);
    lines.push(text(spec.cta, py + ph * 0.70, F(0.030), blk, { x: cx }));
  }

  // Footer (small caps URL + address) — fixed near the very bottom
  if (spec.url) lines.push(text(spec.url, F(0.945), F(0.022), w, { ls: 2 }));
  if (spec.address) lines.push(text(spec.address, F(0.968), F(0.019), w, { ls: 1.5 }));

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${defs}${lines.join('')}</svg>`;
}

async function qrPng(data, size) {
  // dark modules on white, with quiet zone — scannable.
  return QRCode.toBuffer(data, { type: 'png', width: size, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
}

/**
 * Compose a finished flyer: background (+ optional person) + code chassis (+ QR).
 * @param {object} o
 * @param {Buffer} o.background  background plate buffer (from the library)
 * @param {Buffer} [o.person]    optional background-removed person PNG
 * @param {number} o.width  @param {number} o.height
 * @param {object} o.spec    chassis content (headline, subhead, infoLines, price, cta, url, address, qr)
 * @returns {Promise<Buffer>} PNG
 */
async function compose(o) {
  const { width: W, height: H, spec = {} } = o;
  const layers = [];

  // Base: background plate, cover-cropped to canvas, flattened on black.
  let base = sharp(o.background).resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).flatten({ background: brand.LETTERBOX_FILL });

  // Person cutout (optional) — sits lower-center, ~62% of height.
  if (o.person) {
    const ph = Math.round(H * 0.62);
    const personBuf = await sharp(o.person).resize({ height: ph }).png().toBuffer();
    const pm = await sharp(personBuf).metadata();
    layers.push({ input: personBuf, top: H - ph - Math.round(H * 0.06), left: Math.round((W - pm.width) / 2) });
  }

  // Chassis SVG (scrims + text + pill).
  layers.push({ input: Buffer.from(chassisSVG(W, H, spec)), top: 0, left: 0 });

  // Logo — composited on top of the top scrim for crispness, centered.
  if (spec.logo !== false && fs.existsSync(LOGO_PATH)) {
    const lw = Math.round(W * 0.30);
    const logoBuf = await sharp(LOGO_PATH).resize({ width: lw }).png().toBuffer();
    layers.push({ input: logoBuf, top: Math.round(H * 0.04), left: Math.round((W - lw) / 2) });
  }

  // QR (optional) — white box lower-right, raised to clear the footer.
  if (spec.qr) {
    const qs = Math.round(W * 0.13);
    const qr = await qrPng(spec.qr, qs);
    layers.push({ input: qr, top: H - qs - Math.round(H * 0.085), left: W - qs - Math.round(W * 0.04) });
  }

  return base.composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = { compose, chassisSVG, qrPng, FONT_PATH, LOGO_PATH };
