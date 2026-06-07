// End-to-end pipeline test — no network, no real assets required.
//
// Synthesizes a 1080x1350 black/gold "master", runs it through the full
// derivation + bundle pipeline, asserts every size comes out at exact target
// dimensions, and writes the outputs to test-output/ for eyeballing.
//
//   node render-service/test-pipeline.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const brand = require('./brand');
const { deriveFamily } = require('./pipeline/derive');
const { buildBundle } = require('./pipeline/bundle');

const OUT = path.join(__dirname, '..', 'test-output');

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

// Build a synthetic master that loosely mimics a Style A flyer: black bg, gold
// headline bar near top, a colored "photo" block in the middle (gives the smart
// crop something salient to find), white text lines near the bottom.
async function makeMaster() {
  const W = 1080, H = 1350;
  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#000000"/>
  <rect x="290" y="70" width="500" height="60" rx="10" fill="#FFD700"/>
  <text x="540" y="115" font-family="sans-serif" font-size="42" font-weight="bold"
        fill="#000000" text-anchor="middle">DANZVERSITY</text>
  <!-- "photo" region: a vivid block -->
  <rect x="90" y="200" width="900" height="800" rx="16" fill="#9C27B0"/>
  <circle cx="540" cy="560" r="220" fill="#2196F3"/>
  <rect x="380" y="520" width="320" height="320" rx="20" fill="#FF5722"/>
  <text x="540" y="1080" font-family="sans-serif" font-size="64" font-weight="bold"
        fill="#FFD700" text-anchor="middle">HIP HOP SUMMER CAMP</text>
  <text x="540" y="1150" font-family="sans-serif" font-size="34"
        fill="#FFFFFF" text-anchor="middle">AGES 7-12 · TAUGHT BY JAYMIE</text>
  <text x="540" y="1230" font-family="sans-serif" font-size="24"
        fill="#FFFFFF" text-anchor="middle">DANZVERSITY.COM/CAMPS · 7531 BURNET RD AUSTIN TX</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function run() {
  console.log(`Flyer Pipeline test — brand v${brand.VERSION}\n`);
  fs.mkdirSync(OUT, { recursive: true });

  const master = await makeMaster();
  fs.writeFileSync(path.join(OUT, '_master_4x5.png'), master);
  console.log(`Synthesized master: ${master.length} bytes\n`);

  // ── Style A (organic) — expect 7 sizes ──
  console.log('Style A (organic):');
  const a = await deriveFamily(master, 'A', { slug: 'summer-camp-week-1' });
  assert(a.length === brand.ORGANIC_SIZES.length, `produced ${a.length}/${brand.ORGANIC_SIZES.length} organic sizes`);
  for (const img of a) {
    const meta = await sharp(img.buffer).metadata();
    const want = brand.sizes[img.sizeKey];
    assert(meta.width === want.w && meta.height === want.h,
      `${img.filename} = ${meta.width}x${meta.height} (want ${want.w}x${want.h}) [${img.policy}]`);
    fs.writeFileSync(path.join(OUT, img.filename), img.buffer);
  }

  // ── Style A-Lite (paid) — expect 4 sizes ──
  console.log('\nStyle A-Lite (paid):');
  const lite = await deriveFamily(master, 'A-Lite', { slug: 'summer-camp-week-1' });
  assert(lite.length === brand.PAID_SIZES.length, `produced ${lite.length}/${brand.PAID_SIZES.length} paid sizes`);
  for (const img of lite) {
    const meta = await sharp(img.buffer).metadata();
    const want = brand.sizes[img.sizeKey];
    assert(meta.width === want.w && meta.height === want.h,
      `${img.filename} = ${meta.width}x${meta.height} (want ${want.w}x${want.h}) [${img.policy}]`);
    fs.writeFileSync(path.join(OUT, img.filename), img.buffer);
  }

  // ── Bundles ──
  console.log('\nBundles:');
  const meta = await buildBundle(lite, 'meta', 'summer-camp-week-1');
  assert(meta.buffer.length > 0 && meta.sizes.length === 3, `meta bundle: ${meta.sizes.join('+')} (${meta.buffer.length} bytes)`);
  fs.writeFileSync(path.join(OUT, meta.filename), meta.buffer);

  const pmax = await buildBundle(lite, 'pmax', 'summer-camp-week-1');
  assert(pmax.buffer.length > 0 && pmax.sizes.length === 4, `pmax bundle: ${pmax.sizes.join('+')} (${pmax.buffer.length} bytes)`);
  fs.writeFileSync(path.join(OUT, pmax.filename), pmax.buffer);

  console.log(`\nOutputs written to ${OUT}`);
  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
