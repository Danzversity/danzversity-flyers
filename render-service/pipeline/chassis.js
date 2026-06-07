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
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function defs(topH, botStart) {
  return `<defs>
    <linearGradient id="ts" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.85"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="bs" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.92"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <style>@font-face{font-family:'Bebas Neue';src:url(data:font/ttf;base64,${fontB64()}) format('truetype');}text{font-family:'Bebas Neue',sans-serif;}</style>
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
  const topH = F(opts.scrimTop || 0.34), botStart = F(0.58);
  const t = (s, y, size, fill, o = {}) => `<text x="${o.x || cx}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" letter-spacing="${o.ls || 1}">${esc(s)}</text>`;
  const L = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`, defs(topH, botStart)];

  // Top block (logo is composited separately, above this).
  const hSize = F(opts.headlineSize || 0.062);
  if (spec.headline) {
    L.push(t(spec.headline, F(0.262), hSize, G));
    if (opts.headlineBar) L.push(`<rect x="${cx - F(0.14)}" y="${F(0.275)}" width="${F(0.28)}" height="${Math.max(3, F(0.006))}" fill="${G}"/>`);
  }
  if (spec.subhead) L.push(t(spec.subhead, F(opts.headlineBar ? 0.318 : 0.306), F(0.032), WHT));

  // Footer (fixed).
  if (spec.url) L.push(t(spec.url, F(0.945), F(0.022), WHT, { ls: 2 }));
  if (spec.address) L.push(t(spec.address, F(0.968), F(0.019), WHT, { ls: 1.5 }));

  // Bottom block — anchored just above the footer, stacked upward.
  let y = F(0.912);
  if (spec.cta) {
    const pw = F(0.32), ph = F(0.050), px = cx - pw / 2, py = y - ph;
    L.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${G}"/>`);
    L.push(t(spec.cta, py + ph * 0.70, F(0.030), BLK));
    y = py - F(0.024);
  }
  if (spec.price) { L.push(t(spec.price, y, F(0.035), G)); y -= F(0.046); }
  const info = (spec.infoLines || []).filter(Boolean).slice().reverse();
  for (const line of info) { L.push(t(line, y, F(0.028), WHT)); y -= F(0.035); }
  if (info.length || spec.price) { L.push(`<rect x="${cx - F(0.10)}" y="${y}" width="${F(0.20)}" height="${Math.max(2, F(0.004))}" fill="${G}"/>`); y -= F(0.030); }
  if (spec.tagline) L.push(t(spec.tagline, y, F(0.030), WHT));

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

/**
 * Compose a finished flyer at one size: background (+ optional person) + chassis (+ QR).
 */
async function compose(o) {
  const { width: W, height: H, spec = {} } = o;
  const layout = spec.layout || 'A';
  const layers = [];

  let base = sharp(o.background).resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).flatten({ background: brand.LETTERBOX_FILL });

  // Person cutout — bigger + higher for paid (photo-dominant); skipped for testimonial.
  if (o.person && layout !== 'testimonial') {
    const ph = Math.round(H * (layout === 'A-Lite' ? 0.70 : 0.60));
    const personBuf = await sharp(o.person).resize({ height: ph }).png().toBuffer();
    const pm = await sharp(personBuf).metadata();
    const top = layout === 'A-Lite' ? Math.round(H * 0.13) : (H - ph - Math.round(H * 0.06));
    layers.push({ input: personBuf, top, left: Math.round((W - pm.width) / 2) });
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
    layers.push({ input: await qrPng(spec.qr, qs), top: H - qs - Math.round(H * 0.085), left: W - qs - Math.round(W * 0.04) });
  }

  return base.composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = { compose, chassisSVG, qrPng, FONT_PATH, LOGO_PATH };
