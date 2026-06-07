// Render one of each chassis layout to verify the variants.
//   node render-service/test-chassis-variants.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { compose } = require('./pipeline/chassis');
const { buildChassis } = require('./templates');

const OUT = path.join(__dirname, '..', 'test-output');

async function darkPlate(W, H, hue) {
  const cx = W / 2;
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.46}" fill="${hue[0]}" opacity="0.5"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.30}" fill="${hue[1]}" opacity="0.45"/></svg>`)).png().toBuffer();
}
async function person() {
  return sharp(Buffer.from(`<svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7a7a85"><circle cx="300" cy="160" r="120"/><path d="M110 900 Q110 400 300 360 Q490 400 490 900 Z"/></g></svg>`)).png().toBuffer();
}

const JOBS = [
  { key: 'summer-camp-evergreen', content: {}, hue: ['#3b1a52', '#10384a'], file: 'v-styleA.png' },
  { key: 'battle', content: { date: 'SAT SEPT 20', entry: '$10 ENTRY' }, hue: ['#102a4a', '#4a1020'], file: 'v-styleB.png' },
  { key: 'summer-camp-paid', content: { ages: 'AGES 7-12', instructor: 'JAYMIE' }, hue: ['#3b1a52', '#10384a'], file: 'v-alite.png' },
  { key: 'testimonial', content: { quote: 'My daughter finally found her people here', keyword: 'her people', reviewer: 'SARAH M.' }, hue: ['#1a1a1a', '#2a2010'], file: 'v-testimonial.png' },
];

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const W = 1080, H = 1350, pr = await person();
  for (const j of JOBS) {
    const spec = buildChassis(j.key, j.content);
    const bg = await darkPlate(W, H, j.hue);
    const buf = await compose({ background: bg, person: pr, width: W, height: H, spec });
    fs.writeFileSync(path.join(OUT, j.file), buf);
    console.log(`  ${spec.layout.padEnd(11)} ${j.key.padEnd(22)} → ${j.file}`);
  }
  console.log('\n✅ rendered all variants');
}
run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
