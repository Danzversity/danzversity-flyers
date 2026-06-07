// Chassis proof — renders the code chassis over a (synthetic) centered subject
// on a symmetric dark plate, and renders it TWICE to prove byte-identical output.
//   node render-service/test-chassis.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { compose } = require('./pipeline/chassis');

const OUT = path.join(__dirname, '..', 'test-output');

// Symmetric dark, graffiti-ish stand-in plate (until the real background library lands).
async function darkPlate(W, H) {
  const cx = W / 2;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.46}" fill="#2a1640" opacity="0.55"/>
    <circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.30}" fill="#0f3a4c" opacity="0.45"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Centered "person" placeholder (transparent PNG) so we can verify centering.
async function personPlaceholder() {
  const W = 600, H = 900;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7a7a85">
      <circle cx="300" cy="160" r="120"/>
      <path d="M110 900 Q110 400 300 360 Q490 400 490 900 Z"/>
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const SPEC = {
  logo: true,
  headline: 'HIP HOP SUMMER CAMP',
  subhead: 'SUMMER 2026',
  tagline: "MORE THAN MOVES — IT'S CULTURE.",
  infoLines: ['AGES 7-12 | 9AM-3PM', 'TAUGHT BY JAYMIE OROZCO-HOWARD', 'FRIDAY SHOWCASE FOR FAMILIES'],
  price: '$85/DAY | $395/WEEK',
  cta: 'REGISTER NOW',
  url: 'DANZVERSITY.COM/CAMPS',
  address: '7531 BURNET RD · AUSTIN, TX 78757',
  qr: 'https://danzversity.com/camps',
};

async function run() {
  console.log('Chassis proof — code-rendered, deterministic, centered subject\n');
  fs.mkdirSync(OUT, { recursive: true });
  const W = 1080, H = 1350;
  const bg = await darkPlate(W, H);
  const person = await personPlaceholder();

  const a = await compose({ background: bg, person, width: W, height: H, spec: SPEC });
  const b = await compose({ background: bg, person, width: W, height: H, spec: SPEC });

  fs.writeFileSync(path.join(OUT, 'chassis-summer-camp_4x5.png'), a);
  const meta = await sharp(a).metadata();
  const identical = Buffer.compare(a, b) === 0;
  console.log(`  rendered: ${meta.width}x${meta.height}, ${a.length} bytes`);
  console.log(`  ${identical ? '✓' : '✗'} two renders byte-for-byte identical: ${identical}`);
  console.log(`\n  output → ${path.join(OUT, 'chassis-summer-camp_4x5.png')}`);
  console.log(identical ? '\n✅ DETERMINISTIC' : '\n❌ NON-DETERMINISTIC');
  process.exit(identical ? 0 : 1);
}
run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
