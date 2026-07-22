// Danzversity Flyer Maker — Brand Tokens & Distribution Model
//
// SINGLE SOURCE OF TRUTH for palette, fonts, families, the size matrix, and
// the paid/organic distribution rules. resize.js, bundle.js, gdrive.js and
// server.js all import from here. Never hard-code a hex, a pixel size, or a
// bundle definition anywhere else.
//
// Anchored to live https://danzversity.com/assets/css/danzversity.css (verified 2026-05-27)
// and Flyer Design Standard v11 (Confluence MS page 472809473).
//
// ── What this tool is (v11 reality) ──────────────────────────────────────────
// This is NOT the old 11-layer neon compositing engine. The v11 brand RETIRED
// that aesthetic (text glow / neon / decorative graphics around the photo are
// now in Ideogram's negative prompt). The approved master is produced in
// Ideogram by a human (brand-approved). THIS TOOL takes that master and does
// the repetitive, hours-eating downstream work: derive every distribution size,
// trim the paid family, package Meta/PMax bundles, file into Drive, push site
// cards. Master in → everything out.

const VERSION = '11.0.0'; // tracks Flyer Design Standard v11

// ---------------------------------------------------------------------------
// Core palette — locked, verified from production CSS (v11)
// ---------------------------------------------------------------------------
const palette = {
  gold:          '#FFD700', // headlines, accents, CTA — THE brand color
  black:         '#000000', // page background, canvas base, letterbox fill
  textPrimary:   '#FFFFFF', // body text
  textSecondary: '#888888', // muted/subhead
  textMuted:     '#555555', // fine print
  red:           '#E74C3C', // RESERVED — errors / extreme urgency only. NEVER decorative.
};

// Letterbox / canvas fill is always pure brand black, which makes padding
// invisible against the brand and lossless for text-rich masters.
const LETTERBOX_FILL = { r: 0, g: 0, b: 0, alpha: 1 };

// ---------------------------------------------------------------------------
// Program accents — used sparingly as thin stripes/badges, never replacing gold
// ---------------------------------------------------------------------------
const accents = {
  youth:      '#4472C4', // youth-blue (Root Runners, Flow Finders, Vibe Builders, Elementz Crew)
  adult:      '#FFD700', // gold (same as primary)
  collective: '#9C27B0', // collective-purple ((You)nity Nights, family events)
  camps:      '#FF5722', // camps-orange (Summer Camp, Spring Break Camp)
  trial:      '#FF9800', // trial-orange
  // Elemental Dance Method curriculum tokens
  earth:      '#4CAF50',
  water:      '#2196F3',
  air:        '#87CEEB',
  fire:       '#FF5722',
};

// ---------------------------------------------------------------------------
// Typography (locked) — informational. This tool does not render text;
// Ideogram bakes it into the master. Kept here as the brand record.
// ---------------------------------------------------------------------------
const fonts = {
  heading: { family: 'Bebas Neue', note: 'condensed all-caps; site headline font' },
  body:    { family: 'Inter', note: 'paragraphs + small text' },
};

// ---------------------------------------------------------------------------
// Style packs (July 4, 2026) — curated variety for the compose flow.
// Presets, not sliders: every option is brand-approved, so the chassis stays
// locked while the operator still gets real choice. Defaults reproduce the
// classic v11 look byte-identically.
//
// displayFonts drive the HEADLINE ONLY (kicker/info/footer stay Bebas/Inter).
//   widthFactor — average glyph width ÷ font-size, used by the overflow
//                 shrink estimate (Bebas is condensed: 0.56; wider fonts more)
//   scale       — base headline size multiplier so wide fonts don't shout
// ---------------------------------------------------------------------------
const displayFonts = {
  classic: { label: 'Classic', file: 'BebasNeue-Regular.ttf',          family: 'Bebas Neue',           widthFactor: 0.56, scale: 1.00 },
  marker:  { label: 'Marker',  file: 'PermanentMarker-Regular.ttf',    family: 'Permanent Marker',     widthFactor: 0.72, scale: 0.80 },
  tag:     { label: 'Tag',     file: 'SedgwickAveDisplay-Regular.ttf', family: 'Sedgwick Ave Display', widthFactor: 0.70, scale: 0.84 },
  block:   { label: 'Block',   file: 'Bungee-Regular.ttf',             family: 'Bungee',               widthFactor: 0.82, scale: 0.72 },
};

// Accent presets recolor the accent layer (kicker, urgency pill, CTA, bars,
// price). All values are existing brand/program colors; red stays reserved.
const styleAccents = {
  gold:   { label: 'Gold',   hex: palette.gold },
  orange: { label: 'Orange', hex: '#FF5722' }, // camps-orange
  amber:  { label: 'Amber',  hex: '#FF9800' }, // trial-orange
  blue:   { label: 'Blue',   hex: '#4472C4' }, // youth-blue
  purple: { label: 'Purple', hex: '#9C27B0' }, // collective-purple
};

// headline: 'accent' = headline in the accent color (classic look when gold);
//           'white'  = white headline, accents still carry the color.
const headlineTreatments = ['accent', 'white'];

function sanitizeStyle(s) {
  const st = s && typeof s === 'object' ? s : {};
  return {
    font: displayFonts[st.font] ? st.font : 'classic',
    accent: styleAccents[st.accent] ? st.accent : 'gold',
    headline: headlineTreatments.includes(st.headline) ? st.headline : 'accent',
  };
}

// ---------------------------------------------------------------------------
// Creative families (Flyer Design Standard v11, Standing Rule 4)
//   channel    — where it runs (drives which size set + Drive bucket)
//   cropPolicy — how downstream sizes are derived from the master:
//                'letterbox' = pad onto black, lossless (safe for text-rich)
//                'smart'     = fill-crop with focal bias (photo-dominant)
// ---------------------------------------------------------------------------
const families = {
  'A': {
    key: 'A',
    label: 'Style A — Text-Rich (organic)',
    channel: 'organic',
    cropPolicy: 'letterbox', // text lives on the image; never crop it off
    textCoverage: '35-40%',
    photoCoverage: '45-50%',
  },
  'A-Lite': {
    key: 'A-Lite',
    label: 'Style A-Lite — Photo-Dominant (paid)',
    channel: 'paid',
    cropPolicy: 'smart', // photo dominates; minimal text sits in a bottom safe-area
    textCoverage: '15-18%',
    photoCoverage: '65-70%',
  },
  'B': {
    key: 'B',
    label: 'Style B — Hype (battles, name-talent, (You)nity Nights)',
    channel: 'organic',
    cropPolicy: 'letterbox',
    textCoverage: '40-50%',
    photoCoverage: 'varies',
  },
};

// ---------------------------------------------------------------------------
// Size matrix (v11) — 8 sizes. `master` flags the three ratios best generated
// directly in Ideogram (the 3-pass workflow); the tool can still derive them.
// `safeArea` (smart-crop families) reserves a fraction of canvas height at the
// named edge so baked text isn't cropped out.
// ---------------------------------------------------------------------------
const sizes = {
  '4x5':       { key: '4x5',       label: '4:5 portrait',     w: 1080, h: 1350, master: true,  useCase: 'IG/FB feed — the master' },
  '1x1':       { key: '1x1',       label: '1:1 square',       w: 1080, h: 1080, master: true,  useCase: 'IG/FB feed, Nextdoor, PMax square' },
  '9x16':      { key: '9x16',      label: '9:16 story',       w: 1080, h: 1920, master: true,  useCase: 'Stories, Reels, TikTok' },
  '16x9':      { key: '16x9',      label: '16:9 landscape',   w: 1920, h: 1005, master: false, useCase: 'FB event cover, program page hero' },
  '4x3':       { key: '4x3',       label: '4:3',              w: 1200, h:  900, master: false, useCase: 'GBP post image' },
  '2x1':       { key: '2x1',       label: '2:1 email banner', w:  600, h:  300, master: false, useCase: 'Brevo email header' },
  'site-card': { key: 'site-card', label: '1.75:1 site card', w:  560, h:  320, master: false, useCase: '/collective offering card' },
  '1.91x1':    { key: '1.91x1',    label: '1.91:1 landscape', w: 1200, h:  628, master: false, useCase: 'Google PMax / Display landscape (paid)' },
};

// Which sizes each channel ships.
const ORGANIC_SIZES = ['4x5', '1x1', '9x16', '16x9', '4x3', '2x1', 'site-card']; // 7
const PAID_SIZES    = ['4x5', '1x1', '9x16', '1.91x1'];                          // 4

// Per-family size set. Style B is organic-only (name-talent events skip paid).
const FAMILY_SIZES = {
  'A':      ORGANIC_SIZES,
  'A-Lite': PAID_SIZES,
  'B':      ORGANIC_SIZES,
};

// For smart-crop families, reserve this fraction of height at the bottom edge
// (where Style A-Lite's 3 text lines + gold accent bar live) so fill-crops of
// wide ratios don't slice the logo/headline/URL off.
const SMART_CROP_BOTTOM_SAFE = 0.28;
const SMART_CROP_TOP_SAFE    = 0.10; // small logo sits at top

// ---------------------------------------------------------------------------
// VIDEO (Video Output Standard v1) — the short-form clip pipeline's tokens.
// Same philosophy as flyers: the brand layer is code-locked and deterministic;
// only the footage varies. Anatomy per the current short-form standard:
// cold-open hook (NO title slide — first ~1.3s decides the scroll) + burned-in
// hook text (first 3s) + subtle corner watermark + a 1.4s code-rendered brand
// end-card. Every output must pass the ffprobe gate below before it ships.
// ---------------------------------------------------------------------------
const videoSizes = {
  '9x16': { key: '9x16', label: '9:16 vertical', w: 1080, h: 1920, useCase: 'TikTok, Reels, YouTube Shorts, Stories' },
  '1x1':  { key: '1x1',  label: '1:1 square',    w: 1080, h: 1080, useCase: 'IG/FB feed video' },
  '16x9': { key: '16x9', label: '16:9 wide',     w: 1920, h: 1080, useCase: 'YouTube standard, FB feed' },
};

// Machine-enforced gate values + by-construction encode settings. If an output
// fails ANY gate check the compose FAILS LOUDLY — same doctrine as the flyer
// OCR gate: the machine checks what tired eyes miss.
const videoStandard = {
  fps: 30,
  vcodec: 'h264',            // H.264 High — universal ingest on TikTok/YT/Meta
  pixFmt: 'yuv420p',
  crf: 20,
  acodec: 'aac',
  audioRate: 48000,
  audioBitrate: '128k',
  loudnormI: -14,            // -14 LUFS — platform normalization target
  minSeconds: 3,             // shorter than this is a misfire, not a post
  maxSeconds: 90,            // hard cap (Shorts ≤ 60s stays eligible via UI default)
  defaultClipSeconds: 30,
  hookSeconds: 3.0,          // burned-in hook text shows for the first 3s
  endCardSeconds: 1.4,       // code-rendered brand end-card
  watermarkWidthFrac: 0.14,  // logo watermark width as a fraction of frame W
  watermarkOpacity: 0.55,
  // Music (v1.5): OFF by default — TikTok/Reels want trending audio added
  // in-app, and burned-in popular songs get muted/claimed. Library tracks are
  // royalty-free only. 'bed' mixes music under the source at this pre-mix
  // ratio (loudnorm still sets the final level).
  musicBedVolume: 0.22,
  // Safe zones (9:16): keep critical text out of TikTok's UI — right-side icon
  // rail (~ right 15%), bottom caption zone (~ bottom 18%), top bar (~ top 8%).
  safeZones: { top: 0.08, bottom: 0.18, right: 0.15 },
};

// ---------------------------------------------------------------------------
// Upload-ready bundles (v11) — both pull from the Style A-Lite paid family.
//   Meta paid placements: 4:5 + 1:1 + 9:16
//   Google PMax: square + portrait + landscape (we ship 4:5/1:1/9:16/1.91:1)
// ---------------------------------------------------------------------------
const bundles = {
  meta: { key: 'meta', label: 'Meta paid bundle', family: 'A-Lite', sizes: ['4x5', '1x1', '9x16'] },
  pmax: { key: 'pmax', label: 'Google PMax bundle', family: 'A-Lite', sizes: ['4x5', '1x1', '9x16', '1.91x1'] },
};

// ---------------------------------------------------------------------------
// Distribution / address reference (v11). The tool does not render text — these
// are the canonical strings the master should already carry, kept for docs.
// ---------------------------------------------------------------------------
const brandRef = {
  url: 'DANZVERSITY.COM',
  addressStacked: ['7531 BURNET RD', 'AUSTIN, TX 78757'],
  addressCompact: '7531 BURNET RD, AUSTIN TX',
};

// ---------------------------------------------------------------------------
// Google Drive layout — FLYERS/{Template}/{YYYY-MM}/{Organic|Paid}/
// ---------------------------------------------------------------------------
const DRIVE_ROOT = 'FLYERS';
function driveBucket(channel) {
  if (channel === 'video') return 'Video';
  return channel === 'paid' ? 'Paid' : 'Organic';
}
function drivePathSegments(template, yyyymm, channel) {
  return [DRIVE_ROOT, template, yyyymm, driveBucket(channel)];
}

// ---------------------------------------------------------------------------
// RETIRED in v11 (kept as an intentional record, not for use):
//   The old neon-glow recipe (3-pass gaussian text glow), audio-waveform bars,
//   instructor ovals, pill banners, per-template color routing (blue/orange/
//   gold-green/purple) and Remove.bg cutout compositing. The brand moved to a
//   minimalist photo-led look; those decorative elements are now negative-
//   prompted in Ideogram. Do not reintroduce them into this pipeline.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sizesForFamily(familyKey) {
  return (FAMILY_SIZES[familyKey] || []).map((k) => sizes[k]);
}
function cropPolicyFor(familyKey) {
  return (families[familyKey] || {}).cropPolicy || 'letterbox';
}
function channelFor(familyKey) {
  return (families[familyKey] || {}).channel || 'organic';
}

module.exports = {
  VERSION,
  palette,
  accents,
  fonts,
  displayFonts,
  styleAccents,
  sanitizeStyle,
  LETTERBOX_FILL,
  families,
  sizes,
  ORGANIC_SIZES,
  PAID_SIZES,
  FAMILY_SIZES,
  SMART_CROP_BOTTOM_SAFE,
  SMART_CROP_TOP_SAFE,
  bundles,
  videoSizes,
  videoStandard,
  brandRef,
  DRIVE_ROOT,
  driveBucket,
  drivePathSegments,
  // helpers
  sizesForFamily,
  cropPolicyFor,
  channelFor,
};
