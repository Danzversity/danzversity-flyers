// Flyer template registry — the CREATE step's source of truth.
//
// Every template from Flyer Design Standard v11 (Confluence MS 472809473),
// encoded as data: which family it belongs to, the Ideogram prompt (with
// {tokens} for the variable bits), the content fields that fill those tokens,
// the default CTA URL, and — for paid families — the Meta + PMax ad-copy
// templates (the messaging that gets stripped off the image lives here).
//
// The prompt openers, negative prompt, and palette are verbatim v11. Do not
// re-describe colors/fonts/layout in a template body — the style reference does
// the design work (v11 Pro Tip #8). Keep bodies short and content-only.

// ── Shared v11 constants ─────────────────────────────────────────────────────
const PALETTE = ['#000000', '#FFD700', '#FFFFFF', '#888888'];

const NEGATIVE_PROMPT = [
  'realistic human faces', 'neon pink', 'rainbow colors', 'stock photo poses',
  'corporate aesthetic', 'cartoon characters', 'competition trophies', 'generic fitness',
  'busy cluttered background', 'blurry text', 'mustard yellow', 'mismatched fonts',
  'red accents', 'decorative graphics around the photo', 'glow effects on text',
  'gradient overlays', 'neon text', 'geometric shapes around photo',
].join(', ');

const OPENERS = {
  'A': 'Promotional flyer with pure black background (#000000). Bebas Neue condensed all-caps font for all headlines. Pure gold (#FFD700) for the main headline. White (#FFFFFF) for body text. Same minimalist photo-led layout, calm hierarchy, and clean spacing as the uploaded style reference.',
  'A-Lite': 'Promotional image with pure black background (#000000). Bebas Neue condensed all-caps font. Pure gold (#FFD700) for the headline. White (#FFFFFF) for body text. Same minimalist photo-led design language as the uploaded style reference. Photo-dominant layout with generous, intentional negative space.',
  'B': 'Promotional flyer matching the uploaded style reference exactly. Same layout, same dark moody atmosphere, same urban warehouse lighting, same typography style.',
};

// Locked style-reference image filenames per family (placed in assets/refs/ when
// available). Slot 1 = the approved canonical flyer; slot 2 = the graffiti logo.
const STYLE_REFS = {
  'A': ['summer-camp-evergreen-v10.png', 'logo.png'],
  'A-Lite': ['summer-camp-paid-v1.png', 'logo.png'],
  'B': ['pavel-masterclass.png', 'logo.png'],
};

// Address tokens are split (v11 address-mangling fix) and constant.
const ADDRESS = '"7531 BURNET RD" "AUSTIN, TX 78757"';

// Per-week swap table (Summer Camp).
const CAMP_WEEKS = {
  '1': 'WEEK 1 • JUNE 15-19',
  '2': 'WEEK 2 • JUNE 22-26',
  '3': 'WEEK 3 • JUNE 29 - JULY 3',
  '4': 'WEEK 4 • JULY 28 - AUGUST 1',
  '5': 'WEEK 5 • AUGUST 4-8',
};

// ── Field helpers ────────────────────────────────────────────────────────────
const f = (name, label, placeholder, def = '', required = false) => ({ name, label, placeholder, default: def, required });

// Reusable ad-copy builders (paid families). Returns the v11 Meta + PMax templates.
function campAdCopy() {
  return {
    meta: {
      primaryText: 'Summer Camp at Danzversity. Ages 7-12. $85/day or $395/week. June-August. Taught by Jaymie. Friday showcase for families.',
      headline: 'Hip Hop Summer Camp — Ages 7-12',
      description: '$85/day or $395/week',
      cta: 'Sign Up',
      url: 'https://www.danzversity.com/registration/camp/?utm_source=meta&utm_medium=paid&utm_campaign=summer-camp-2026',
    },
    pmax: {
      shortHeadlines: ['Summer Camp Austin · Ages 7-12', 'Hip Hop Summer Camp 2026', '$85/day or $395/week', 'Taught by Jaymie Howard', 'Friday Showcase Included'],
      longHeadlines: ['Real Hip Hop Summer Camp for Kids 7-12 — Taught by Jaymie at Danzversity Austin'],
      descriptions: [
        'Five weeks of immersive hip hop. $85/day or $395/week. Friday showcase for families.',
        'Real culture, real movement. Ages 7-12. 9 AM-3 PM. Taught by Jaymie Howard.',
        'North Austin\'s hip hop dance studio. Summer Camp 2026 registration open now.',
        'Sibling discount auto-applies. Spring Break sold out — Summer fills fast.',
      ],
      longDescription: 'Summer Camp 2026 at Danzversity Austin — five weeks of real hip hop for ages 7-12.',
      businessName: 'Danzversity',
      cta: 'Sign Up',
    },
  };
}

function genericPaidAdCopy(program, url) {
  return {
    meta: {
      primaryText: `${program} at Danzversity — real hip hop culture in North Austin. More than moves, it's culture.`,
      headline: `${program} — Danzversity Austin`,
      description: 'First class free',
      cta: 'Learn More',
      url,
    },
    pmax: {
      shortHeadlines: [`${program} Austin`, 'Danzversity Hip Hop', 'More Than Moves', 'Real Hip Hop Culture', 'North Austin Dance'],
      longHeadlines: [`${program} at Danzversity — Real Hip Hop Culture in North Austin`],
      descriptions: [
        `${program} at Danzversity. Real culture, real movement. North Austin.`,
        'More than moves — it\'s culture. Taught by working artists.',
        'North Austin\'s hip hop and street dance academy.',
        'First class free. No experience needed.',
      ],
      longDescription: `${program} at Danzversity Austin — learn the method, live the culture.`,
      businessName: 'Danzversity',
      cta: 'Learn More',
    },
  };
}

// ── Templates ────────────────────────────────────────────────────────────────
// Each: { key, label, family, group, defaultUrl, fields, body, adCopy? }
// Full prompt = OPENERS[family] + "\n\n" + body (with {tokens} replaced).
const TEMPLATES = [
  // ----- SUMMER CAMP -----
  {
    key: 'summer-camp-evergreen', label: 'Summer Camp — Evergreen', family: 'A', group: 'Summer Camp',
    defaultUrl: 'https://danzversity.com/camps',
    fields: [
      f('dates', 'Dates', 'JUNE 15–19 · WEEK 1', 'SUMMER 2026'),
      f('benefit', 'Hook line', '5 DAYS · ONE CREW · FRIDAY SHOWCASE', '5 DAYS · ONE CREW · FRIDAY SHOWCASE'),
      f('ages', 'Ages / hours', 'AGES 7-12 · 9AM-3PM', 'AGES 7-12 · 9AM-3PM'),
      f('instructor', 'Instructor', 'JAYMIE', 'JAYMIE'),
      f('price', 'Price / value', '$395/WEEK · DAY $85', '$395/WEEK · DAY $85'),
      f('urgency', 'Urgency', 'ONLY 15 SPOTS A WEEK', 'ONLY 15 SPOTS A WEEK'),
    ],
    body: 'The central photo is a vivid, high-saturation shot of real Danzversity kids posed confidently against the studio\'s outdoor graffiti wall. Rich color in the graffiti — deep purples, bright pinks, vibrant teals, electric blues, splashes of orange. Warm natural sunlight on the kids. High contrast between the kids and the wall. Danzversity teal graffiti logo at top center. The text "HIP HOP SUMMER CAMP" in large Bebas Neue all-caps gold letters. Below that "SUMMER 2026" in white Bebas Neue. The vibrant photo in the middle. The text "MORE THAN MOVES — IT\'S CULTURE." in white below the photo. A thin gold accent line. The text "{ages}" in white. The text "TAUGHT BY {instructor}" in white. The text "FRIDAY SHOWCASE FOR FAMILIES" in white. The text "{price}" in gold. A gold pill button with "REGISTER NOW" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM/CAMPS" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
  {
    key: 'summer-camp-perweek', label: 'Summer Camp — Per Week', family: 'A', group: 'Summer Camp',
    defaultUrl: 'https://danzversity.com/camps',
    fields: [
      f('week', 'Week (1-5)', '1', '1', true),
      f('benefit', 'Hook line', '5 DAYS · ONE CREW · FRIDAY SHOWCASE', '5 DAYS · ONE CREW · FRIDAY SHOWCASE'),
      f('ages', 'Ages / hours', 'AGES 7-12 · 9AM-3PM', 'AGES 7-12 · 9AM-3PM'),
      f('instructor', 'Instructor', 'JAYMIE', 'JAYMIE'),
      f('price', 'Price / value', '$395/WEEK · DAY $85', '$395/WEEK · DAY $85'),
      f('urgency', 'Urgency', 'ONLY 15 SPOTS A WEEK', 'ONLY 15 SPOTS A WEEK'),
    ],
    body: 'The central photo is a vivid, high-saturation shot of real Danzversity kids posed confidently against the studio\'s outdoor graffiti wall. Rich color in the graffiti — deep purples, bright pinks, vibrant teals, electric blues, splashes of orange. Warm natural sunlight on the kids. Danzversity teal graffiti logo at top center. The text "HIP HOP SUMMER CAMP" in large Bebas Neue all-caps gold letters. Below that "{weekLine}" in white Bebas Neue. The vibrant photo in the middle. The text "MORE THAN MOVES — IT\'S CULTURE." in white. A thin gold accent line. The text "{ages}" in white. The text "TAUGHT BY {instructor}" in white. The text "FRIDAY SHOWCASE FOR FAMILIES" in white. The text "{price}" in gold. A gold pill button with "REGISTER NOW" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM/CAMPS" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
  {
    key: 'summer-camp-paid', label: 'Summer Camp — Paid 🔥', family: 'A-Lite', group: 'Summer Camp',
    defaultUrl: 'https://www.danzversity.com/registration/camp/',
    fields: [
      f('instructor', 'Instructor (short)', 'JAYMIE', 'JAYMIE'),
      f('ages', 'Ages', 'AGES 7-12', 'AGES 7-12'),
    ],
    body: 'The central photo is a vivid, high-saturation shot of real Danzversity kids posed confidently against the studio\'s outdoor graffiti wall. Rich color in the graffiti — deep purples, bright pinks, vibrant teals, electric blues, splashes of orange. Warm natural sunlight on the kids. High contrast. The photo fills approximately 70% of the canvas, centered with even black margins above and below. Centered at the top: small Danzversity teal graffiti logo. The vibrant photo in the middle. Below the photo, centered, on three clean lines with breathing room between them: "HIP HOP SUMMER CAMP" in large Bebas Neue all-caps gold letters; "{ages} · TAUGHT BY {instructor}" in small white Bebas Neue all-caps; "DANZVERSITY.COM/CAMPS · 7531 BURNET RD AUSTIN TX" in tiny white small caps. No prices, no CTA button, no dates, no tagline, no decorative elements. Photo and three short lines of text only.',
    adCopy: campAdCopy(),
  },

  // ----- YOUTH -----
  {
    key: 'youth-allages', label: 'Youth — All Ages', family: 'A', group: 'Youth',
    defaultUrl: 'https://danzversity.com/youth',
    fields: [f('ages', 'Ages', 'AGES 2-17', 'AGES 2-17')],
    body: 'A vivid, high-saturation photo of kids and teens dancing in the studio. Warm studio lighting, rich color, high contrast. Danzversity teal graffiti logo at top center. The text "HIP HOP DANCE" in large Bebas Neue all-caps gold letters. Below that "{ages}" in white Bebas Neue. The vibrant photo in the middle. The text "MORE THAN MOVES — IT\'S CULTURE." in white. A thin gold accent line. The text "ROOT RUNNERS • FLOW FINDERS • VIBE BUILDERS • ELEMENTZ CREW" in white. A gold pill button with "ENROLL NOW" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM/YOUTH" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
  {
    key: 'youth-paid', label: 'Youth — Paid 🔥', family: 'A-Lite', group: 'Youth',
    defaultUrl: 'https://www.danzversity.com/registration/',
    fields: [f('instructor', 'Instructor (short)', 'JAYMIE', 'JAYMIE'), f('ages', 'Ages', 'AGES 2-17', 'AGES 2-17')],
    body: 'A vivid, high-saturation photo of kids dancing in the studio. Warm studio lighting, rich color, high contrast. The photo fills approximately 70% of the canvas. Centered at the top: small Danzversity teal graffiti logo. The vibrant photo in the middle. Below the photo, on three clean lines: "HIP HOP DANCE CLASSES" in large Bebas Neue all-caps gold letters; "{ages} · TAUGHT BY {instructor}" in small white Bebas Neue; "DANZVERSITY.COM/YOUTH · 7531 BURNET RD AUSTIN TX" in tiny white small caps. No prices, no CTA button, no dates, no tagline, no decorative elements.',
    adCopy: genericPaidAdCopy('Hip Hop Dance for Kids', 'https://www.danzversity.com/registration/?utm_source=meta&utm_medium=paid&utm_campaign=youth-2026'),
  },

  // ----- ADULT -----
  {
    key: 'adult', label: 'Adult Program', family: 'A', group: 'Adult',
    defaultUrl: 'https://danzversity.com/adults',
    fields: [f('price', 'Price', '$69/MO UNLIMITED | $20 DROP-IN', '$69/MO UNLIMITED | $20 DROP-IN')],
    body: 'A vivid, high-saturation photo of adult dancers in the studio. Warm dramatic lighting, rich color, high contrast. Danzversity teal graffiti logo at top center. The text "ADULT HIP HOP" in large Bebas Neue all-caps gold letters. Below that "NO EXPERIENCE NEEDED" in white. The vibrant photo in the middle. The text "MORE THAN MOVES — IT\'S CULTURE." in white. A thin gold accent line. The text "{price}" in gold. The text "FIRST CLASS FREE" in white. A gold pill button with "START YOUR JOURNEY" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM/ADULTS" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
  {
    key: 'adult-paid', label: 'Adult — Paid 🔥', family: 'A-Lite', group: 'Adult',
    defaultUrl: 'https://www.danzversity.com/registration/',
    fields: [],
    body: 'A vivid, high-saturation photo of adult dancers in the studio. Warm dramatic lighting, rich color, high contrast. The photo fills approximately 70% of the canvas. Centered at the top: small Danzversity teal graffiti logo. The vibrant photo in the middle. Below the photo, on three clean lines: "ADULT HIP HOP" in large Bebas Neue all-caps gold letters; "FIRST CLASS FREE · NO EXPERIENCE NEEDED" in small white Bebas Neue; "DANZVERSITY.COM/ADULTS · 7531 BURNET RD AUSTIN TX" in tiny white small caps. No prices, no CTA button, no dates, no tagline, no decorative elements.',
    adCopy: genericPaidAdCopy('Adult Hip Hop', 'https://www.danzversity.com/registration/?utm_source=meta&utm_medium=paid&utm_campaign=adult-2026'),
  },

  // ----- BREAKIN' -----
  {
    key: 'breakin', label: "Breakin' Series", family: 'A', group: "Breakin'",
    defaultUrl: 'https://danzversity.com/breakin',
    fields: [
      f('time', 'Day / time', 'MONDAYS 6PM', 'MONDAYS'),
      f('ages', 'Ages', 'AGES 8+', 'ALL AGES'),
      f('price', 'Price', '$160 / 8 WEEKS', '$160 / 8 WEEKS'),
    ],
    body: 'A vivid, high-saturation photo of a b-boy in freeze pose in the studio. Dramatic lighting, rich color, high contrast. Danzversity teal graffiti logo at top center. The text "BREAKIN\' SERIES" in large Bebas Neue all-caps gold letters. Below that "8-WEEK PROGRAM" in white. The vibrant photo in the middle. A thin gold accent line. The text "{time}" in white. The text "{ages}" in white. The text "{price}" in gold. A gold pill button with "REGISTER NOW" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM/BREAKIN" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
  {
    key: 'breakin-paid', label: "Breakin' — Paid 🔥", family: 'A-Lite', group: "Breakin'",
    defaultUrl: 'https://www.danzversity.com/registration/',
    fields: [f('time', 'Day', 'MONDAYS', 'MONDAYS')],
    body: 'A vivid, high-saturation photo of a b-boy in freeze pose in the studio. Dramatic lighting, rich color, high contrast. The photo fills approximately 70% of the canvas. Centered at the top: small Danzversity teal graffiti logo. The vibrant photo in the middle. Below the photo, on three clean lines: "BREAKIN\' SERIES" in large Bebas Neue all-caps gold letters; "8-WEEK PROGRAM · {time}" in small white Bebas Neue; "DANZVERSITY.COM/BREAKIN · 7531 BURNET RD AUSTIN TX" in tiny white small caps. No prices, no CTA button, no dates, no tagline, no decorative elements.',
    adCopy: genericPaidAdCopy("Breakin' Series", 'https://www.danzversity.com/registration/?utm_source=meta&utm_medium=paid&utm_campaign=breakin-2026'),
  },

  // ----- (YOU)NITY NIGHTS (Style B) -----
  {
    key: 'younity-nights', label: '(You)nity Nights', family: 'B', group: 'Events',
    defaultUrl: 'https://danzversity.com',
    fields: [f('schedule', 'When', '3RD FRIDAY | 7-9PM', '3RD FRIDAY | 7-9PM')],
    body: 'Pure black background with gold and purple accents. The text "(YOU)NITY NIGHTS" in large bold distressed stamp-style letters at top. Below that "MORE THAN MOVES — IT\'S CULTURE" in white. The text "FREE MONTHLY EVENT" in a purple badge. Warm community gathering vibe. The text "LIVE PERFORMANCES | WORKSHOPS | OPEN MIC" in white. The text "{schedule}" in gold. At bottom, two lines of white small caps: "DANZVERSITY.COM" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },

  // ----- WORKSHOP (internal, Style A) -----
  {
    key: 'workshop-internal', label: 'Workshop — Internal', family: 'A', group: 'Workshops',
    defaultUrl: 'https://danzversity.com',
    fields: [
      f('name', 'Workshop name', 'HEELS 101', '', true),
      f('instructor', 'Instructor', 'JAYMIE', '', true),
      f('datetime', 'Date | time', 'SAT JULY 12 | 2PM', '', true),
      f('price', 'Price', '$35', '$35'),
    ],
    body: 'A vivid, high-saturation photo of dancers in the studio. Warm dramatic lighting. Danzversity teal graffiti logo at top center. The text "{name}" in large Bebas Neue all-caps gold letters. Below that "WITH {instructor}" in white. The vibrant photo in the middle. A thin gold accent line. The text "{datetime}" in white. The text "{price}" in gold. A gold pill button with "REGISTER NOW" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
  {
    key: 'workshop-nametalent', label: 'Workshop / Masterclass — Name Talent', family: 'B', group: 'Workshops',
    defaultUrl: 'https://danzversity.com',
    fields: [
      f('name', 'Workshop name', 'PAVEL MASTERCLASS', '', true),
      f('instructor', 'Instructor', 'PAVEL', '', true),
      f('datetime', 'Date | time', 'SAT AUG 9 | 3PM', '', true),
      f('price', 'Price', '$50', '$50'),
    ],
    body: 'The text "{name}" in large bold letters at top. Below that "WITH {instructor}" in gold. Dancer silhouette in spotlight. The text "{datetime}" in white. A gold pill with "{price}". A gold pill button with "REGISTER NOW" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },

  // ----- DANCE BATTLE (Style B) -----
  {
    key: 'battle', label: 'Dance Battle', family: 'B', group: 'Events',
    defaultUrl: 'https://danzversity.com',
    fields: [
      f('date', 'Date', 'SAT SEPT 20', '', true),
      f('entry', 'Entry fee', '$10 ENTRY', '$10 ENTRY'),
    ],
    body: 'The text "DANCE BATTLE" in large bold aggressive letters at top with spray paint drip effects. Retro fighting game energy. Silhouettes of two dancers facing off in a cypher. The text "1V1 ALL STYLES" in white. The text "{date}" in white. A gold pill with "{entry}". The text "STEP IN THE CYPHER" in gold. At bottom, two lines of white small caps: "DANZVERSITY.COM" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },

  // ----- COUPLES (Style A) -----
  {
    key: 'couples', label: 'Couples Class', family: 'A', group: 'Events',
    defaultUrl: 'https://danzversity.com',
    fields: [f('datetime', 'Date | time', 'FRI FEB 13 | 7PM', '', true), f('price', 'Price', '$40/COUPLE', '$40/COUPLE')],
    body: 'A vivid, high-saturation photo of two dancers moving together. Warm romantic lighting. Danzversity teal graffiti logo at top center. The text "COUPLES DANCE NIGHT" in large Bebas Neue all-caps gold letters. Below that "NO EXPERIENCE REQUIRED" in white. The vibrant photo in the middle. A thin gold accent line. The text "{datetime}" in white. The text "{price}" in gold. A gold pill button with "BOOK YOUR SPOT" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },

  // ----- TEAM AUDITION (Style A) -----
  {
    key: 'team-audition', label: 'Team Audition', family: 'A', group: 'Teams',
    defaultUrl: 'https://danzversity.com/teams',
    fields: [
      f('team', 'Team name', 'ELEMENTZ CREW', '', true),
      f('datetime', 'Date | time', 'SUN AUG 24 | 1PM', '', true),
      f('ages', 'Ages', 'AGES 10-17', 'AGES 10-17'),
      f('commitment', 'Commitment', 'WEEKLY REHEARSALS', 'WEEKLY REHEARSALS'),
    ],
    body: 'A vivid, dramatic photo with spotlight on empty dance floor. Rich color, high contrast. Danzversity teal graffiti logo at top center. The text "{team} AUDITIONS" in large Bebas Neue all-caps gold letters. The vibrant photo in the middle. A thin gold accent line. The text "{datetime}" in white. The text "{ages}" in white. The text "{commitment}" in white. A gold pill button with "SIGN UP" in black Bebas Neue. At bottom, two lines of white small caps: "DANZVERSITY.COM/TEAMS" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },

  // ----- TESTIMONIAL (Style B) -----
  {
    key: 'testimonial', label: 'Testimonial Graphic', family: 'B', group: 'Social',
    defaultUrl: 'https://danzversity.com',
    fields: [
      f('quote', 'Quote (max 15 words)', 'My daughter found her people here', '', true),
      f('keyword', 'Gold keyword in quote', 'her people', '', true),
      f('reviewer', 'Reviewer name', 'SARAH M.', '', true),
    ],
    body: 'Street art aesthetic, gold spray paint border with rough edges and paint drips. Large white quote text reading "{quote}" with "{keyword}" highlighted in gold bold. Below quote: "{reviewer} ★★★★★" in white with gold stars. Dark dancer silhouettes in bottom corners. No realistic people. At bottom, two lines of white small caps: "DANZVERSITY.COM" and "7531 BURNET RD · AUSTIN, TX 78757".',
  },
];

// ── Lookups + token expansion ────────────────────────────────────────────────
const byKey = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));

function listTemplates() {
  return TEMPLATES.map((t) => ({
    key: t.key, label: t.label, family: t.family, group: t.group,
    channel: t.family === 'A-Lite' ? 'paid' : 'organic',
    defaultUrl: t.defaultUrl,
    fields: t.fields,
    hasAdCopy: !!t.adCopy,
  }));
}

// Derive any computed tokens (e.g. the per-week swap line) from raw content.
function expandContent(template, content) {
  const c = { ...content };
  if (template.key === 'summer-camp-perweek') {
    const wk = String(c.week || '1').trim();
    c.weekLine = CAMP_WEEKS[wk] || `WEEK ${wk}`;
  }
  return c;
}

// ── Chassis content per template (the code-rendered LOCKED layer) ────────────
// The skeleton is shared across products — this is only what fills each slot.
// {tokens} are filled from form content. layout: 'A' (standard) | 'A-Lite' (paid,
// minimal) | 'B' (hype) | 'testimonial' (quote-centric).
const FOOTER_ADDRESS = '7531 BURNET RD · AUSTIN, TX 78757';

const CHASSIS = {
  'summer-camp-evergreen': { layout: 'A', kicker: "AUSTIN'S HIP-HOP HOME · 10 YEARS", headline: 'HIP HOP SUMMER CAMP', subhead: '{dates}', tagline: '{benefit}', infoLines: ['{ages} · WITH {instructor}'], price: '{price}', urgency: '{urgency}', cta: 'REGISTER NOW', url: 'DANZVERSITY.COM/CAMPS', qr: true },
  'summer-camp-perweek': { layout: 'A', kicker: "AUSTIN'S HIP-HOP HOME · 10 YEARS", headline: 'HIP HOP SUMMER CAMP', subhead: '{weekLine}', tagline: '{benefit}', infoLines: ['{ages} · WITH {instructor}'], price: '{price}', urgency: '{urgency}', cta: 'REGISTER NOW', url: 'DANZVERSITY.COM/CAMPS', qr: true },
  'summer-camp-paid': { layout: 'A-Lite', headline: 'HIP HOP SUMMER CAMP', subhead: '{ages} · TAUGHT BY {instructor}', url: 'DANZVERSITY.COM/CAMPS', qr: false },
  'youth-allages': { layout: 'A', headline: 'HIP HOP DANCE', subhead: '{ages}', tagline: "MORE THAN MOVES — IT'S CULTURE.", infoLines: ['ROOT RUNNERS • FLOW FINDERS', 'VIBE BUILDERS • ELEMENTZ CREW'], cta: 'ENROLL NOW', url: 'DANZVERSITY.COM/YOUTH', qr: true },
  'youth-paid': { layout: 'A-Lite', headline: 'HIP HOP DANCE CLASSES', subhead: '{ages} · TAUGHT BY {instructor}', url: 'DANZVERSITY.COM/YOUTH', qr: false },
  'adult': { layout: 'A', headline: 'ADULT HIP HOP', subhead: 'NO EXPERIENCE NEEDED', tagline: "MORE THAN MOVES — IT'S CULTURE.", infoLines: ['FIRST CLASS FREE'], price: '{price}', cta: 'START YOUR JOURNEY', url: 'DANZVERSITY.COM/ADULTS', qr: true },
  'adult-paid': { layout: 'A-Lite', headline: 'ADULT HIP HOP', subhead: 'FIRST CLASS FREE · NO EXPERIENCE NEEDED', url: 'DANZVERSITY.COM/ADULTS', qr: false },
  'breakin': { layout: 'A', headline: "BREAKIN' SERIES", subhead: '8-WEEK PROGRAM', infoLines: ['{time}', '{ages}'], price: '{price}', cta: 'REGISTER NOW', url: 'DANZVERSITY.COM/BREAKIN', qr: true },
  'breakin-paid': { layout: 'A-Lite', headline: "BREAKIN' SERIES", subhead: '8-WEEK PROGRAM · {time}', url: 'DANZVERSITY.COM/BREAKIN', qr: false },
  'younity-nights': { layout: 'B', headline: '(YOU)NITY NIGHTS', subhead: 'FREE MONTHLY EVENT', tagline: "MORE THAN MOVES — IT'S CULTURE", infoLines: ['LIVE PERFORMANCES | WORKSHOPS | OPEN MIC', '{schedule}'], url: 'DANZVERSITY.COM', qr: true },
  'workshop-internal': { layout: 'A', headline: '{name}', subhead: 'WITH {instructor}', infoLines: ['{datetime}'], price: '{price}', cta: 'REGISTER NOW', url: 'DANZVERSITY.COM', qr: true },
  'workshop-nametalent': { layout: 'B', headline: '{name}', subhead: 'WITH {instructor}', infoLines: ['{datetime}'], price: '{price}', cta: 'REGISTER NOW', url: 'DANZVERSITY.COM', qr: true },
  'battle': { layout: 'B', headline: 'DANCE BATTLE', subhead: '1V1 ALL STYLES', infoLines: ['{date}', '{entry}'], cta: 'STEP IN THE CYPHER', url: 'DANZVERSITY.COM', qr: true },
  'couples': { layout: 'A', headline: 'COUPLES DANCE NIGHT', subhead: 'NO EXPERIENCE REQUIRED', infoLines: ['{datetime}'], price: '{price}', cta: 'BOOK YOUR SPOT', url: 'DANZVERSITY.COM', qr: true },
  'team-audition': { layout: 'A', headline: '{team} AUDITIONS', infoLines: ['{datetime}', '{ages}', '{commitment}'], cta: 'SIGN UP', url: 'DANZVERSITY.COM/TEAMS', qr: true },
  'testimonial': { layout: 'testimonial', quote: '{quote}', keyword: '{keyword}', reviewer: '{reviewer}', url: 'DANZVERSITY.COM', qr: false },
};

// Fill a template's chassis content from form input → ready for the compositor.
function buildChassis(key, content = {}) {
  const t = byKey[key];
  if (!t) throw new Error(`Unknown template: ${key}`);
  const base = CHASSIS[key];
  if (!base) return null;

  const filled = {};
  for (const fld of t.fields) {
    const v = content[fld.name];
    filled[fld.name] = v != null && String(v).trim() !== '' ? String(v).trim() : (fld.default || '');
  }
  const expanded = expandContent(t, { ...filled, ...content });
  for (const k of Object.keys(expanded)) if (filled[k] == null || filled[k] === '') filled[k] = expanded[k];

  const fill = (s) => String(s).replace(/\{(\w+)\}/g, (m, k) => (filled[k] != null ? filled[k] : '')).replace(/\s{2,}/g, ' ').trim();

  const spec = { layout: base.layout, logo: true };
  if (base.kicker) { const v = fill(base.kicker); if (v) spec.kicker = v; }
  if (base.headline) spec.headline = fill(base.headline);
  if (base.subhead) { const v = fill(base.subhead); if (v) spec.subhead = v; }
  if (base.tagline) spec.tagline = fill(base.tagline);
  if (base.infoLines) spec.infoLines = base.infoLines.map(fill).filter(Boolean);
  if (base.price) { const v = fill(base.price); if (v) spec.price = v; }
  if (base.cta) spec.cta = fill(base.cta);
  if (base.urgency) { const v = fill(base.urgency); if (v) spec.urgency = v; }
  if (base.quote) spec.quote = fill(base.quote);
  if (base.keyword) spec.keyword = fill(base.keyword);
  if (base.reviewer) spec.reviewer = fill(base.reviewer);
  spec.url = fill(base.url) || 'DANZVERSITY.COM';
  spec.address = FOOTER_ADDRESS;
  if (base.qr && content.qr !== false) spec.qr = content.qrUrl || t.defaultUrl;
  return spec;
}

module.exports = {
  PALETTE, NEGATIVE_PROMPT, OPENERS, STYLE_REFS, ADDRESS, CAMP_WEEKS,
  TEMPLATES, byKey, listTemplates, expandContent,
  CHASSIS, FOOTER_ADDRESS, buildChassis,
};
