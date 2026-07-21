// Video engine — cut short-form clips with the LOCKED brand layer (Video
// Output Standard v1).
//
// Same doctrine as the flyer chassis: the footage varies, the brand layer never
// does. Anatomy (current short-form standard — NO title slide, the first ~1.3s
// decides the scroll):
//   • cold-open on the footage at the chosen start point
//   • burned-in HOOK text for the first 3s (code-rendered, brand fonts)
//   • subtle logo watermark throughout (top-left, inside the safe zone)
//   • 1.4s code-rendered brand END-CARD (logo / gold Bebas line / CTA / URL)
// Every output is verified by gate() — an ffprobe check of the exact encode
// contract. A failed gate FAILS the compose loudly (flyer OCR-gate doctrine).
//
// ffmpeg/ffprobe come from ffmpeg-static/ffprobe-static so the same binaries
// run on Render and locally. One ffmpeg invocation per aspect (single encode,
// concat filter — no fragile multi-pass copy-concat).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const sharp = require('sharp');
const QRCode = require('qrcode');
const brand = require('../brand');

// Binaries ship INSIDE the npm packages (@ffmpeg-installer bundles per-platform
// tarballs; ffprobe-static bundles in-package too). Do NOT switch to
// ffmpeg-static: its postinstall downloads ~120MB from GitHub releases at
// install time and truncates/fails on flaky networks — it broke the Render
// build AND two local installs on 2026-07-21. FFMPEG_PATH/FFPROBE_PATH
// override for environments that provide their own.
const FFMPEG = process.env.FFMPEG_PATH || require('@ffmpeg-installer/ffmpeg').path;
const FFPROBE = process.env.FFPROBE_PATH || require('ffprobe-static').path;

const FONTS_DIR = path.join(__dirname, '..', '..', 'fonts');
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'refs', 'logo.png');
const VS = brand.videoStandard;
const G = brand.palette.gold, WHT = brand.palette.textPrimary, BLK = brand.palette.black;

// Same font-embedding trick as the chassis: data-URI @font-face (works locally)
// + the TTFs installed into fontconfig at server startup (what Render's librsvg
// actually reads).
const _b64 = {};
function ttfB64(file) { if (!_b64[file]) _b64[file] = fs.readFileSync(path.join(FONTS_DIR, file)).toString('base64'); return _b64[file]; }
function fontDefs() {
  return `<style>@font-face{font-family:'Bebas Neue';src:url(data:font/ttf;base64,${ttfB64('BebasNeue-Regular.ttf')}) format('truetype');}` +
    `@font-face{font-family:'Inter';src:url(data:font/ttf;base64,${ttfB64('Inter-Body.ttf')}) format('truetype');}` +
    `text{font-family:'Bebas Neue',sans-serif;}</style>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wrapWords(s, maxChars) {
  const words = String(s).split(/\s+/);
  const lines = []; let cur = '';
  for (const wd of words) { if ((cur + ' ' + wd).trim().length > maxChars) { if (cur) lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); }
  if (cur) lines.push(cur);
  return lines;
}

// ── Run a binary, fail loudly with its stderr tail ───────────────────────────
function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const err = [];
    p.stderr.on('data', (c) => { err.push(c); if (err.length > 200) err.shift(); });
    const out = [];
    p.stdout.on('data', (c) => out.push(c));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString());
      else reject(new Error(`${path.basename(bin)} exited ${code}: …${Buffer.concat(err).toString().slice(-600)}`));
    });
  });
}

// ── Probe ────────────────────────────────────────────────────────────────────
async function probe(filePath) {
  const out = await run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath]);
  const j = JSON.parse(out);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const fpsOf = (s) => { if (!s || !s.r_frame_rate) return null; const [n, d] = s.r_frame_rate.split('/').map(Number); return d ? n / d : n; };
  return {
    duration: j.format ? parseFloat(j.format.duration) : null,
    bytes: j.format ? parseInt(j.format.size, 10) : null,
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps: fpsOf(v), pixFmt: v.pix_fmt, rotation: Number((v.side_data_list || []).find((s) => s.rotation != null)?.rotation ?? 0) } : null,
    audio: a ? { codec: a.codec_name, rate: parseInt(a.sample_rate, 10), channels: a.channels } : null,
  };
}

// ── Brand overlays (code-rendered, deterministic) ────────────────────────────
// Watermark: the logo, small, top-left inside the safe zone. Rendered opaque
// here — the translucency is applied by ffmpeg (colorchannelmixer) because
// attenuating an existing PNG alpha channel in sharp is unreliable.
async function watermarkPng(W, H) {
  const lw = Math.round(W * VS.watermarkWidthFrac);
  const logo = await sharp(LOGO_PATH).resize({ width: lw }).png().toBuffer();
  const canvas = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return canvas.composite([{ input: logo, top: Math.round(H * (VS.safeZones.top + 0.015)), left: Math.round(W * 0.04) }]).png().toBuffer();
}

// Hook text: wrapped Bebas lines, white on rounded translucent black pills —
// the burned-in caption look. Sits in the upper third, clear of platform UI.
async function hookPng(text, W, H) {
  const lines = wrapWords(String(text).toUpperCase(), 18);
  const fsz = Math.round(H * 0.040), lh = Math.round(fsz * 1.45), pad = Math.round(fsz * 0.55);
  const yTop = Math.round(H * 0.20);
  const parts = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${fontDefs()}</defs>`];
  lines.forEach((ln, i) => {
    const tw = Math.round(ln.length * fsz * 0.56) + pad * 2;
    const x = Math.round((W - tw) / 2), y = yTop + i * (lh + Math.round(fsz * 0.25));
    parts.push(`<rect x="${x}" y="${y}" width="${tw}" height="${lh}" rx="${Math.round(lh * 0.22)}" fill="#000000" fill-opacity="0.72"/>`);
    parts.push(`<text x="${W / 2}" y="${y + Math.round(lh * 0.74)}" font-size="${fsz}" fill="${WHT}" text-anchor="middle" letter-spacing="1.5">${esc(ln)}</text>`);
  });
  parts.push('</svg>');
  return sharp(Buffer.from(parts.join(''))).png().toBuffer();
}

// End-card: THE code chassis of video. Black frame, logo, gold Bebas headline,
// white subline, CTA pill, URL, thin gold bar — v11-clean, byte-identical every
// render. Optional QR (off by default: 1.4s is a pause-to-scan, not a read).
async function endCardPng(spec, W, H) {
  const cx = W / 2, F = (f) => Math.round(H * f);
  const t = (s, y, size, fill, o = {}) =>
    `<text x="${cx}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" letter-spacing="${o.ls || 1}"${o.inter ? ` style="font-family:'Inter'"` : ''}>${esc(s)}</text>`;
  const L = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${fontDefs()}</defs>`];
  L.push(`<rect width="${W}" height="${H}" fill="${BLK}"/>`);
  if (spec.headline) L.push(t(spec.headline, F(0.545), F(0.062), G, { ls: 2 }));
  if (spec.subhead) L.push(t(spec.subhead, F(0.60), F(0.026), WHT, { inter: true }));
  let ctaBottom = F(0.655);
  if (spec.cta) {
    const pw = Math.min(Math.round(W * 0.5), Math.max(Math.round(W * 0.3), spec.cta.length * F(0.018) + F(0.06)));
    const ph = F(0.052), px = cx - pw / 2, py = ctaBottom;
    L.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${G}"/>`);
    L.push(t(spec.cta, py + ph * 0.70, F(0.030), BLK));
    ctaBottom = py + ph;
  }
  if (spec.url) L.push(t(spec.url, ctaBottom + F(0.055), F(0.024), WHT, { ls: 3 }));
  L.push(`<rect x="0" y="${H - Math.max(4, F(0.008))}" width="${W}" height="${Math.max(4, F(0.008))}" fill="${G}"/>`);
  L.push('</svg>');

  const layers = [];
  if (fs.existsSync(LOGO_PATH)) {
    const lw = Math.round(W * 0.42);
    const logo = await sharp(LOGO_PATH).resize({ width: lw }).png().toBuffer();
    const m = await sharp(logo).metadata();
    layers.push({ input: logo, top: F(0.30) - Math.round(m.height / 2), left: Math.round((W - lw) / 2) });
  }
  if (spec.qr) {
    const qs = Math.round(W * 0.13);
    const qr = await QRCode.toBuffer(spec.qr, { type: 'png', width: qs, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
    layers.push({ input: qr, top: H - qs - F(0.06), left: W - qs - Math.round(W * 0.05) });
  }
  return sharp(Buffer.from(L.join(''))).composite(layers).png().toBuffer();
}

// ── Cut one aspect ───────────────────────────────────────────────────────────
async function cutOne({ srcPath, srcMeta, start, seconds, size, hook, endSpec, dir, slug }) {
  const { w: W, h: H } = size;
  const wmPath = path.join(dir, `wm-${size.key}.png`);
  const endPath = path.join(dir, `end-${size.key}.png`);
  fs.writeFileSync(wmPath, await watermarkPng(W, H));
  fs.writeFileSync(endPath, await endCardPng(endSpec, W, H));
  const hookPath = hook ? path.join(dir, `hook-${size.key}.png`) : null;
  if (hookPath) fs.writeFileSync(hookPath, await hookPng(hook, W, H));

  const outPath = path.join(dir, `${slug}_video_${size.key}.mp4`);
  const hasAudio = !!srcMeta.audio;
  const fadeSt = Math.max(0, seconds - 0.35).toFixed(2);

  // Video chain: fill-crop to the frame, normalize fps/SAR, watermark always,
  // hook for the first hookSeconds; end-card fades in, concat, single encode.
  const inputs = ['-ss', String(start), '-t', String(seconds), '-i', srcPath, '-i', wmPath];
  let idx = 2, hookIdx = -1;
  if (hookPath) { inputs.push('-i', hookPath); hookIdx = idx++; }
  inputs.push('-loop', '1', '-t', String(VS.endCardSeconds), '-i', endPath);
  const endIdx = idx++;

  const fc = [];
  fc.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${VS.fps},setsar=1[v0]`);
  fc.push(`[1:v]format=rgba,colorchannelmixer=aa=${VS.watermarkOpacity}[wm]`);
  fc.push(`[v0][wm]overlay=0:0[v1]`);
  fc.push(hookIdx >= 0 ? `[v1][${hookIdx}:v]overlay=0:0:enable='lte(t,${VS.hookSeconds})'[vmain]` : `[v1]null[vmain]`);
  fc.push(`[${endIdx}:v]scale=${W}:${H},setsar=1,fps=${VS.fps},fade=t=in:st=0:d=0.25[vend]`);
  // Audio: loudness-normalized to the platform target (-14 LUFS). loudnorm
  // outputs 192kHz — aresample back down. Silence when the source is mute.
  fc.push(hasAudio
    ? `[0:a]loudnorm=I=${VS.loudnormI}:TP=-1.5:LRA=11,aresample=${VS.audioRate},afade=t=out:st=${fadeSt}:d=0.35,atrim=0:${seconds}[amain]`
    : `anullsrc=r=${VS.audioRate}:cl=stereo,atrim=0:${seconds}[amain]`);
  fc.push(`anullsrc=r=${VS.audioRate}:cl=stereo,atrim=0:${VS.endCardSeconds}[aend]`);
  fc.push(`[vmain][amain][vend][aend]concat=n=2:v=1:a=1[vcat][aout]`);
  fc.push(`[vcat]format=${VS.pixFmt}[vout]`);

  await run(FFMPEG, [
    '-y', ...inputs,
    '-filter_complex', fc.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-crf', String(VS.crf),
    '-c:a', 'aac', '-b:a', VS.audioBitrate, '-ar', String(VS.audioRate),
    '-movflags', '+faststart',
    outPath,
  ]);

  const expected = seconds + VS.endCardSeconds;
  const g = await gate(outPath, { w: W, h: H, expectedSeconds: expected });
  return { path: outPath, filename: path.basename(outPath), sizeKey: size.key, label: size.label, width: W, height: H, seconds: g.probed.duration, bytes: g.probed.bytes, gate: g };
}

// ── The quality gate — every output must pass, or the compose fails ──────────
async function gate(filePath, { w, h, expectedSeconds }) {
  const p = await probe(filePath);
  const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;
  const checks = [
    { name: 'video codec', want: VS.vcodec, got: p.video && p.video.codec, ok: !!p.video && p.video.codec === VS.vcodec },
    { name: 'pixel format', want: VS.pixFmt, got: p.video && p.video.pixFmt, ok: !!p.video && p.video.pixFmt === VS.pixFmt },
    { name: 'resolution', want: `${w}x${h}`, got: p.video && `${p.video.width}x${p.video.height}`, ok: !!p.video && p.video.width === w && p.video.height === h },
    { name: 'frame rate', want: VS.fps, got: p.video && p.video.fps && Math.round(p.video.fps * 100) / 100, ok: !!p.video && near(p.video.fps, VS.fps, 0.5) },
    { name: 'audio codec', want: VS.acodec, got: p.audio && p.audio.codec, ok: !!p.audio && p.audio.codec === VS.acodec },
    { name: 'audio rate', want: VS.audioRate, got: p.audio && p.audio.rate, ok: !!p.audio && p.audio.rate === VS.audioRate },
    { name: 'duration', want: `${expectedSeconds.toFixed(1)}s`, got: p.duration && `${p.duration.toFixed(1)}s`, ok: near(p.duration, expectedSeconds, 0.4) },
  ];
  return { ok: checks.every((c) => c.ok), checks, probed: p, byConstruction: ['loudnorm -14 LUFS', 'faststart moov', `crf ${VS.crf} h264 high`] };
}

/**
 * Cut a source clip into finished platform outputs.
 * @param {object} o { srcPath, start, seconds, aspects: ['9x16',...], hook, endSpec: {headline, subhead, cta, url, qr}, slug }
 * @returns {Promise<{outputs: Array, source: object, workDir: string}>} caller owns workDir cleanup
 */
async function composeVideo(o) {
  const srcMeta = await probe(o.srcPath);
  if (!srcMeta.video) throw new Error('Source has no video stream.');
  const srcDur = srcMeta.duration || 0;
  const start = Math.max(0, Number(o.start) || 0);
  if (start >= srcDur) throw new Error(`Start ${start}s is past the end of the source (${srcDur.toFixed(1)}s).`);
  let seconds = Math.min(Number(o.seconds) || VS.defaultClipSeconds, srcDur - start);
  if (seconds < VS.minSeconds) throw new Error(`Clip would be ${seconds.toFixed(1)}s — the Standard's minimum is ${VS.minSeconds}s.`);
  if (seconds > VS.maxSeconds) seconds = VS.maxSeconds;

  const aspects = (o.aspects && o.aspects.length ? o.aspects : ['9x16']).filter((a) => brand.videoSizes[a]);
  if (!aspects.length) throw new Error('No valid aspects requested.');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvz-video-'));
  const outputs = [];
  for (const a of aspects) {
    const out = await cutOne({ srcPath: o.srcPath, srcMeta, start, seconds, size: brand.videoSizes[a], hook: o.hook, endSpec: o.endSpec || {}, dir, slug: o.slug || 'clip' });
    if (!out.gate.ok) {
      const bad = out.gate.checks.filter((c) => !c.ok).map((c) => `${c.name}: got ${c.got}, want ${c.want}`).join('; ');
      throw new Error(`Quality gate FAILED on ${a}: ${bad}`);
    }
    outputs.push(out);
  }
  return { outputs, source: { duration: srcDur, start, seconds, video: srcMeta.video, audio: srcMeta.audio }, workDir: dir };
}

function isConfigured() { return !!(FFMPEG && FFPROBE); }

// Boot self-test: actually EXECUTE the binary. A truncated ffmpeg-static
// postinstall download leaves a valid-looking exe that dies on spawn (EFTYPE)
// — /health must expose that, not just "the file exists".
let _selfTest = null;
async function selfTest() {
  if (_selfTest !== null) return _selfTest;
  try {
    const [f, p] = await Promise.all([run(FFMPEG, ['-version']), run(FFPROBE, ['-version'])]);
    _selfTest = /^ffmpeg version/.test(f) && /^ffprobe version/.test(p);
  } catch (_) { _selfTest = false; }
  return _selfTest;
}

module.exports = { composeVideo, probe, gate, endCardPng, hookPng, watermarkPng, isConfigured, selfTest, FFMPEG, FFPROBE };
