// Demo: ONE chassis engine, different products. Renders a Workshop and a Team
// audition from the same compositor + the per-template chassis content.
//   node render-service/test-chassis-products.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { compose } = require('./pipeline/chassis');
const { buildChassis } = require('./templates');

const OUT = path.join(__dirname, '..', 'test-output');

async function darkPlate(W, H, hue) {
  const cx = W / 2;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.46}" fill="${hue[0]}" opacity="0.5"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.30}" fill="${hue[1]}" opacity="0.45"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function person() {
  const svg = `<svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7a7a85"><circle cx="300" cy="160" r="120"/><path d="M110 900 Q110 400 300 360 Q490 400 490 900 Z"/></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const JOBS = [
  { key: 'workshop-internal', content: { name: 'HEELS 101', instructor: 'JAYMIE', datetime: 'SAT JULY 12 | 2PM', price: '$35' }, hue: ['#10384a', '#1a4a2a'], file: 'chassis-workshop_4x5.png' },
  { key: 'team-audition', content: { team: 'ELEMENTZ CREW', datetime: 'SUN AUG 24 | 1PM', ages: 'AGES 10-17', commitment: 'WEEKLY REHEARSALS' }, hue: ['#3b1a52', '#10384a'], file: 'chassis-team_4x5.png' },
];

async function run() {
  console.log('Same engine, different products\n');
  fs.mkdirSync(OUT, { recursive: true });
  const W = 1080, H = 1350;
  const pr = await person();
  for (const job of JOBS) {
    const spec = buildChassis(job.key, job.content);
    const bg = await darkPlate(W, H, job.hue);
    const buf = await compose({ background: bg, person: pr, width: W, height: H, spec });
    fs.writeFileSync(path.join(OUT, job.file), buf);
    console.log(`  ${job.key.padEnd(20)} → "${spec.headline}" | info: ${(spec.infoLines || []).join(' / ')} | cta: ${spec.cta} → ${job.file}`);
  }
  console.log('\n✅ rendered');
}
run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
