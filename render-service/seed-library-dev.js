// Dev-only: seed the local library/ fallback with stand-in plates so the compose
// flow is testable without Drive credentials. (Prod reads from Drive.)
//   node render-service/seed-library-dev.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'library');
const bgDir = path.join(root, 'backgrounds');
const pDir = path.join(root, 'people');
fs.mkdirSync(bgDir, { recursive: true });
fs.mkdirSync(pDir, { recursive: true });

(async () => {
  const W = 1200, H = 1500, cx = W / 2;
  const plate = await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0a0a0a"/><circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.5}" fill="#2a1640" opacity="0.5"/><circle cx="${cx}" cy="${H * 0.44}" r="${W * 0.32}" fill="#0f3a4c" opacity="0.45"/></svg>`)).png().toBuffer();
  fs.writeFileSync(path.join(bgDir, 'dev-plate.png'), plate);
  const person = await sharp(Buffer.from(`<svg width="700" height="1000" xmlns="http://www.w3.org/2000/svg"><g fill="#7a7a85"><circle cx="350" cy="170" r="130"/><path d="M120 1000 Q120 440 350 400 Q580 440 580 1000 Z"/></g></svg>`)).png().toBuffer();
  fs.writeFileSync(path.join(pDir, 'dev-person.png'), person);
  console.log('seeded library/backgrounds/dev-plate.png + library/people/dev-person.png');
})();
