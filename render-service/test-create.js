// Create-step test — prompt assembly + ad copy (no network).
//   node render-service/test-create.js

const { assemble } = require('./pipeline/prompt');
const templates = require('./templates');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };
const noLeftoverTokens = (s) => !/\{[a-zA-Z]\w*\}/.test(s);

console.log(`Create test — ${templates.TEMPLATES.length} templates\n`);

// With all required fields filled, every template must leave no unfilled tokens.
console.log('All templates assemble cleanly (required fields filled):');
for (const t of templates.TEMPLATES) {
  const content = {};
  for (const fld of t.fields) if (fld.required) content[fld.name] = `TEST ${fld.name}`;
  const a = assemble(t.key, content);
  const clean = noLeftoverTokens(a.prompt);
  ok(clean && a.prompt.length > 100, `${t.key} (${t.family}) — ${a.prompt.length} chars${clean ? '' : ' — LEFTOVER TOKENS'}`);
  if (a.adCopy) ok(noLeftoverTokens(JSON.stringify(a.adCopy)), `${t.key} ad copy has no leftover tokens`);
}

// Token replacement actually substitutes user content.
console.log('\nToken substitution:');
const wk = assemble('summer-camp-perweek', { week: '3', price: '$99/DAY' });
ok(wk.prompt.includes('WEEK 3 • JUNE 29 - JULY 3'), 'per-week swap line computed from week=3');
ok(wk.prompt.includes('$99/DAY'), 'price override applied');
ok(noLeftoverTokens(wk.prompt), 'no leftover tokens after fill');

const ws = assemble('workshop-internal', { name: 'HEELS 101', instructor: 'JAYMIE', datetime: 'SAT JULY 12 | 2PM' });
ok(ws.prompt.includes('HEELS 101') && ws.prompt.includes('WITH JAYMIE'), 'workshop name + instructor injected');

// Family / channel / style-ref routing.
console.log('\nRouting:');
ok(assemble('summer-camp-paid', {}).channel === 'paid', 'summer-camp-paid → paid channel');
ok(assemble('summer-camp-evergreen', {}).channel === 'organic', 'evergreen → organic channel');
ok(assemble('younity-nights', {}).styleRefs.includes('pavel-masterclass.png'), 'Style B → Pavel style ref');
ok(assemble('adult-paid', {}).styleRefs.includes('summer-camp-paid-v1.png'), 'A-Lite → paid-v1 style ref');

// Negative prompt + palette present.
console.log('\nBrand attachments:');
const a = assemble('summer-camp-evergreen', {});
ok(a.negativePrompt.includes('neon text') && a.negativePrompt.includes('glow effects on text'), 'v11 negative prompt attached');
ok(a.palette.join(',') === '#000000,#FFD700,#FFFFFF,#888888', 'v11 palette attached');
ok(a.aspectRatio === '4x5', 'master aspect ratio = 4x5');

// Required-field flagging.
console.log('\nValidation:');
ok(assemble('workshop-internal', {}).missingRequired.includes('name'), 'flags missing required field (workshop name)');

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
