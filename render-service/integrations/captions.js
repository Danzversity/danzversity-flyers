// Caption suggestions for the social-post dialog.
//
// Two tiers, graceful degradation (same pattern as social/telemetry):
//   1. AI (Claude claude-opus-4-8, structured JSON output) when
//      ANTHROPIC_API_KEY is set — 3 distinct captions in brand voice.
//   2. Deterministic template captions built from the flyer's own filled
//      fields — always available, zero setup, zero cost.
//
// Raw node:https, NOT the Anthropic SDK: the SDK rides undici/fetch, which is
// broken on Render (same failure that killed googleapis and verifyUrl).
// Standing rule: ALL outbound HTTP in this service goes over node:https.

const https = require('https');
const templates = require('../templates');
const telemetry = require('./telemetry');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-opus-4-8';

// Verbatim AACME publicity statement — grant obligation on every (You)nity
// marketing piece, captions included. Appended deterministically, never left
// to the model. (The "a Elevate" grammar is intentional — do NOT fix it.)
const AACME_STATEMENT = 'This project is supported in part by a Elevate Grant of Austin Arts, Culture, Music and Entertainment.';

function isConfigured() { return !!API_KEY; }

// ── Deterministic fallback ───────────────────────────────────────────────────
// Three caption patterns assembled from the filled chassis spec.
function templateCaptions(templateKey, content) {
  const spec = templates.buildChassis(templateKey, content || {});
  const t = templates.byKey[templateKey];
  const link = (content && content.url) || (t && t.defaultUrl) || 'https://danzversity.com';
  const bits = {
    headline: spec.headline || (t ? t.label : 'Danzversity'),
    subhead: spec.subhead || '',
    tagline: spec.tagline || '',
    price: spec.price || '',
    urgency: spec.urgency || '',
    cta: spec.cta || 'Register now',
  };
  const line = (...parts) => parts.filter(Boolean).join(' · ');

  const captions = [
    `🔥 ${bits.headline}${bits.subhead ? ' — ' + bits.subhead : ''}. ${line(bits.tagline, bits.urgency)}${bits.tagline || bits.urgency ? '. ' : ''}${bits.cta} → ${link}\n\n#Danzversity #AustinTX #HipHop #StreetDance`,
    `${bits.headline} at Danzversity, 7531 Burnet Rd, Austin. ${line(bits.subhead, bits.price)}${bits.subhead || bits.price ? '. ' : ''}Details + sign-up: ${link}`,
    `${bits.headline}. ${bits.cta}: ${link} 🎤`,
  ].map((c) => (spec.compliance ? `${c}\n\n${AACME_STATEMENT}` : c));

  return captions;
}

// ── AI captions (Claude over node:https) ─────────────────────────────────────
const SYSTEM = `You write social media captions for Danzversity, a hip-hop and street dance cultural academy in Austin, TX (7531 Burnet Rd, danzversity.com). Est. 2016, 5.0 stars on Google.

Brand voice rules (hard requirements):
- Motto territory: "culture over competition", the Elemental Dance Method. Energetic, warm, real — street-dance culture, not corporate.
- NEVER name "the culture", "the family", or "the movement" as things people join — show belonging, don't announce it.
- For youth programs say "kid" or "child", never call children "dancers".
- Never use the words "workout" or "competition".
- Honest urgency only — use a scarcity line only if one is provided in the flyer data.
- Emoji welcome but restrained (1-3). Hashtags: 3-5 max, on the first (hype) caption only.
- Every caption must include the event's key facts (what/when if given) and end with the link.`;

const SCHEMA = {
  type: 'object',
  properties: {
    captions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 3 captions: (1) hype with hashtags, (2) info-forward, (3) short and punchy',
    },
  },
  required: ['captions'],
  additionalProperties: false,
};

function anthropicRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode !== 200) return reject(new Error((j.error && j.error.message) || `anthropic ${res.statusCode}`));
          resolve(j);
        } catch (e) { reject(new Error('anthropic: bad response')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('anthropic: timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function aiCaptions(templateKey, content) {
  const spec = templates.buildChassis(templateKey, content || {});
  const t = templates.byKey[templateKey];
  const link = (content && content.url) || (t && t.defaultUrl) || 'https://danzversity.com';

  const facts = {
    event: spec.headline, details: spec.subhead, lineup: spec.tagline,
    info: spec.infoLines, price: spec.price, urgency: spec.urgency,
    cta: spec.cta, link,
    audience: t ? t.group : '',
    free_event: /free/i.test(spec.cta || '') || /free/i.test(spec.kicker || ''),
  };

  const response = await anthropicRequest({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `Write 3 Facebook/Instagram captions for this flyer. Flyer facts (only use what's here — do not invent dates, prices, or claims):\n${JSON.stringify(facts, null, 2)}`,
    }],
  });

  telemetry.reportSpend('anthropic', 1); // fire-and-forget, same $50/mo watchdog pool

  if (response.stop_reason === 'refusal') throw new Error('anthropic: refused');
  const text = (response.content || []).find((b) => b.type === 'text');
  if (!text) throw new Error('anthropic: no text block');
  let captions = JSON.parse(text.text).captions.filter((c) => typeof c === 'string' && c.trim());
  if (!captions.length) throw new Error('anthropic: empty captions');
  // AACME statement is a deterministic append — never trust the model with a
  // verbatim grant obligation.
  if (spec.compliance) captions = captions.map((c) => `${c}\n\n${AACME_STATEMENT}`);
  return captions.slice(0, 3);
}

/**
 * Suggest captions. Tries AI when configured; always lands on the template
 * fallback rather than failing. Returns {source: 'ai'|'template', captions}.
 */
async function suggest(templateKey, content) {
  if (!templates.byKey[templateKey]) throw new Error(`Unknown template: ${templateKey}`);
  if (isConfigured()) {
    try {
      return { source: 'ai', captions: await aiCaptions(templateKey, content) };
    } catch (e) {
      console.warn('AI captions failed, using template fallback:', e.message);
    }
  }
  return { source: 'template', captions: templateCaptions(templateKey, content) };
}

module.exports = { suggest, isConfigured };
