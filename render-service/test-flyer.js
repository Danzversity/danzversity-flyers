// composeFlyer test — full compose loop with stand-in background + person.
//   node render-service/test-flyer.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const brand = require('./brand');
const { composeFlyer } = require('./pipeline/flyer');

const OUT = path.join(__dirname, '..', 'test-output');

async function darkPlate(W, H) {
  const cx = W / 2;
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.5}" fill="#2a1640" opacity="0.5"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.32}" fill="#0f3a4c" opacity="0.45"/></svg>`)).png().toBuffer();
}
async function person() {
  return sharp(Buffer.from(`<svg width="700" height="1000" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7a7a85"><circle cx="350" cy="170" r="130"/><path d="M120 1000 Q120 440 350 400 Q580 440 580 1000 Z"/></g></svg>`)).png().toBuffer();
}

let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failures++; };

async function run() {
  console.log('composeFlyer — full size set from template + bg + person\n');
  fs.mkdirSync(OUT, { recursive: true });
  const bg = await darkPlate(1200, 1500);
  const pr = await person();

  const res = await composeFlyer({ templateKey: 'summer-camp-evergreen', content: {}, background: bg, person: pr, slug: 'summer-camp' });
  console.log(`  family=${res.family} channel=${res.channel} layout=${res.layout} images=${res.images.length}\n`);

  ok(res.images.length === brand.ORGANIC_SIZES.length, `produced ${res.images.length}/${brand.ORGANIC_SIZES.length} organic sizes`);
  for (const img of res.images) {
    const m = await sharp(img.buffer).metadata();
    const want = brand.sizes[img.sizeKey];
    ok(m.width === want.w && m.height === want.h, `${img.filename} = ${m.width}x${m.height} (want ${want.w}x${want.h}) ${img.native ? '[native]' : '[derived]'}`);
    fs.writeFileSync(path.join(OUT, `flyer_${img.sizeKey}.png`), img.buffer);
  }

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
