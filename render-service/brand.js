// Danzversity Flyer Maker — Brand Tokens
//
// SINGLE SOURCE OF TRUTH for palette, fonts, accents, and style routing.
// All templates + render utilities import from here. Never hard-code a hex in a template.
//
// Anchored to live https://danzversity.com/assets/css/danzversity.css (verified 2026-05-27)
// and Flyer Design Standard v8 (Confluence MS page 472809473).
//
// To verify alignment with live CSS, run: node scripts/verify-brand.js
// To update: edit values here, bump VERSION, then re-run verify + regenerate plates if palette changed.

const VERSION = '8.0.0'; // matches Flyer Design Standard v8

// ---------------------------------------------------------------------------
// Core palette — Style A default (locked in v8)
// ---------------------------------------------------------------------------
const palette = {
  gold:           '#FFD700', // headlines, CTA pills, neon glow
  black:          '#000000', // backgrounds, base canvas
  textPrimary:    '#FFFFFF', // body text, info block
  textSecondary:  '#888888', // muted/secondary text
  textMuted:      '#555555', // very muted (rarely used in flyers)
  red:            '#E74C3C', // RESERVED — errors / DO NOT USE on flyers as decorative
};

// ---------------------------------------------------------------------------
// Program accent stripes — used sparingly (1-2px stripes above/below info bar)
// Only applies when a template explicitly defines an accent.
// ---------------------------------------------------------------------------
const accents = {
  youth:      '#4472C4', // youth-blue (Root Runners, Flow Finders, Vibe Builders, Elementz Crew)
  adult:      '#FFD700', // gold (same as primary — no visible stripe)
  collective: '#9C27B0', // collective-purple ((You)nity Night, Off The Grid, Family events)
  camps:      '#FF5722', // camps-orange (Summer Camp, Spring Break Camp)
  trial:      '#FF9800', // trial-orange (rarely used on flyers)
  // Elemental Dance Method tokens — for future curriculum-specific flyers
  earth:      '#4CAF50',
  water:      '#2196F3',
  air:        '#87CEEB',
  fire:       '#FF5722',
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
const fonts = {
  heading: {
    family: 'Bebas Neue',
    path:   'fonts/BebasNeue-Regular.ttf',
    fallback: 'sans-serif',
  },
  body: {
    family: 'Inter',
    weights: {
      regular:  { path: 'fonts/Inter-Regular.ttf',  weight: 400 },
      medium:   { path: 'fonts/Inter-Medium.ttf',   weight: 500 },
      semibold: { path: 'fonts/Inter-SemiBold.ttf', weight: 600 },
      bold:     { path: 'fonts/Inter-Bold.ttf',     weight: 700 },
    },
    fallback: '-apple-system, BlinkMacSystemFont, sans-serif',
  },
};

// ---------------------------------------------------------------------------
// Style routing — every template picks Style A (default) or Style B (hype)
// ---------------------------------------------------------------------------
const styles = {
  // Style A: photo-led, calm, default (anchored to Tony-approved Summer Camp Week 1 black flyer 5/26)
  A: {
    name: 'Style A — Photo-led (default)',
    background: 'plate', // pulls from backgrounds/style-a/plate-{1..4}.png
    plateDir: 'backgrounds/style-a',
    titleColor: palette.gold,
    subtitleStroke: palette.textPrimary, // white outline
    pillFill: palette.gold,
    pillText: palette.black,
    bodyText: palette.textPrimary,
    infoText: palette.textSecondary,
    photoGlowColor: palette.gold,
    photoColorGradeBlend: 0.18, // 15-22% per render spec
    photoContrast: 1.15,
    backgroundDarken: 0.28,
    topVignette: true,
  },
  // Style B: hype, Pavel-style — typography-dominant, graphic noise, urban warehouse vibe
  B: {
    name: 'Style B — Hype (Pavel-style)',
    background: 'plate',
    plateDir: 'backgrounds/style-b', // optional — falls back to style-a if missing
    plateFallback: 'backgrounds/style-a',
    titleColor: palette.gold,
    subtitleStroke: palette.gold, // gold outline (vs white on Style A)
    pillFill: palette.gold,
    pillText: palette.black,
    pillTexture: 'spray-paint',
    bodyText: palette.textPrimary,
    infoText: palette.textSecondary,
    photoGlowColor: palette.gold,
    photoColorGradeBlend: 0.22,
    photoContrast: 1.18,
    backgroundDarken: 0.32,
    topVignette: true,
  },
};

// ---------------------------------------------------------------------------
// Output sizes — all 7 built from day one
// ---------------------------------------------------------------------------
const sizes = {
  '4x5':       { name: '4:5 portrait',    width: 1080, height: 1350, useCase: 'IG/FB feed (master)' },
  '1x1':       { name: '1:1 square',      width: 1080, height: 1080, useCase: 'IG/FB feed, Nextdoor' },
  '9x16':      { name: '9:16 story',      width: 1080, height: 1920, useCase: 'IG/FB Stories, TikTok, Reels' },
  '16x9':      { name: '16:9 landscape',  width: 1920, height: 1005, useCase: 'FB event covers, program page heroes' },
  '4x3':       { name: '4:3',             width: 1200, height:  900, useCase: 'GBP post images' },
  '2x1':       { name: '2:1 banner',      width:  600, height:  300, useCase: 'Brevo email headers' },
  'site-card': { name: '1.75:1 site card', width: 560, height:  320, useCase: '/collective offering cards' },
};

const SIZE_KEYS = Object.keys(sizes);

// ---------------------------------------------------------------------------
// Neon glow recipe — locked from POC validation (April 10, 2026)
// ---------------------------------------------------------------------------
const neonGlow = {
  solid:   { passes: [{ blur: 30, intensity: 2.0 }, { blur: 12, intensity: 1.0 }, { blur: 4, intensity: 1.0 }] },
  outline: { passes: [{ blur: 25, intensity: 2.0 }, { blur:  8, intensity: 1.0 }], strokeWidth: 3 },
};

// ---------------------------------------------------------------------------
// Standard footer + address (used on every flyer)
// ---------------------------------------------------------------------------
const footer = {
  registerLine: 'REGISTER ONLINE @ DANZVERSITY.COM',
  address: 'DANZVERSITY — 7531 BURNET RD. 78757',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
module.exports = {
  VERSION,
  palette,
  accents,
  fonts,
  styles,
  sizes,
  SIZE_KEYS,
  neonGlow,
  footer,
};
