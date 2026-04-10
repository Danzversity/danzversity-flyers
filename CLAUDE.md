# Danzversity Flyer Maker

## What This Is

A hybrid AI+code flyer compositing engine for Danzversity — a hip-hop and street dance academy in Austin, TX. Users fill out a form with event details, optionally upload a hero photo, and the system generates 3 branded flyer variants at 3 sizes (9 total images), with approval before saving to Google Drive.

**Architecture doc:** https://danzversity.atlassian.net/wiki/spaces/bsp/pages/475725826

## Architecture

```
flyers.danzversity.com (Cloudflare Pages — frontend/)
  │ Form: template, event title, dates, instructor, time, price, CTA URL, photo upload
  ▼
render-service/ (Node.js on Render, ~$7/mo)
  │ Sharp compositing, Remove.bg, Ideogram, QR code gen
  │ Generates 3 variants × 3 sizes = 9 PNGs
  ▼
Approval grid → Google Drive save
  /Danzversity Flyers/[Type]/[YYYY-MM]/[event-slug]_[variant]_[size].png
```

## Brand Rules (NON-NEGOTIABLE)

These are locked. Every flyer must have ALL of these elements. No exceptions.

### Colors (per template)
- **Masterclass:** Blue `#3CC8FF` glow, `#82E6FF` bright, `#0A2850` deep
- **Series/Program:** Orange `#FF6B35` (breakin'), variable per program
- **Workshop:** Gold `#FFD700` + Green accents
- **Event:** Purple + Gold

### Typography
- **Primary font:** Bebas Neue (bundled at `fonts/BebasNeue-Regular.ttf`)
- **Title treatment:** Solid white fill with multi-layer blue/color neon glow (3 gaussian blur passes: 30px, 12px, 4px)
- **Subtitle treatment:** Outline/hollow letters with neon stroke glow (stroke_width: 3-4, same 3-pass glow)
- **Info text:** Bebas Neue, white, various sizes

### Required Elements (every flyer, every template)
1. **Danzversity graffiti logo** — transparent PNG, top-center, ~38-42% of canvas width
2. **Black pill banner** — rounded rect below logo, contains event type label (MASTERCLASS, WORKSHOP, etc.)
3. **Audio waveform texture** — vertical bars at top-left and top-right edges, template accent color, alpha 120-220
4. **Hero zone** — cut-out subject(s) on branded background with color-graded tint matching template palette
5. **Neon title** — event name in massive Bebas Neue with multi-layer glow
6. **Outline subtitle** — secondary text in hollow neon letters
7. **Floating instructor oval** — neon-glowing ellipse with instructor name + time, positioned mid-right
8. **Bottom info block** — DATES: label + date text + address line ("DANZVERSITY - 7531 BURNET RD. 78757")
9. **Footer bar** — solid dark bar at bottom: "REGISTER ONLINE @ WWW.DANZVERSITY.COM | SPOTS ARE STRICTLY LIMITED!" with accent-colored highlights on URL and "STRICTLY LIMITED!"
10. **QR code** (when CTA URL provided) — generated from URL, white padding box, ~15% of canvas width

### Output Sizes
- **1:1:** 1080×1080 (Instagram feed, Facebook)
- **9:16:** 1080×1920 (Stories, Reels, TikTok)
- **4:5:** 1080×1350 (Instagram portrait — highest engagement)

### Logo Source
- Canonical: `https://i.postimg.cc/syPRP0XL/Danzversity-Logo-Cropped.png`
- Also bundled locally at `assets/logo.png` (transparent version)

## Tech Stack

- **Runtime:** Node.js 20+
- **Image compositing:** Sharp (https://sharp.pixelplumbing.com/)
- **Background removal:** Remove.bg API ($0.20/image)
- **Background generation:** Ideogram v3 API (~$0.08-0.20/image)
- **QR codes:** `qrcode` npm package
- **Fonts:** Bebas Neue (OFL licensed, bundled), Inter (for body text if needed)
- **Frontend:** Vanilla HTML/CSS/JS (no framework — matches main site pattern)
- **Hosting:** Render (render.com) for the Node service, Cloudflare Pages for the frontend
- **Storage:** Google Drive API (service account, googleapis npm package)

## API Keys

All stored as environment variables on Render. Documented in Confluence Credentials Inventory (page 467599362).

- `IDEOGRAM_API_KEY` — Ideogram v3 background generation
- `REMOVEBG_API_KEY` — Remove.bg background removal
- `GOOGLE_SERVICE_ACCOUNT` — JSON blob, Google Drive write access

## How the Compositing Engine Works

The engine builds flyers as a layer stack, composited bottom-up with Sharp:

```
Layer 0: Background plate (from library or fresh Ideogram generation)
         → Resize/crop to target dimensions
         → Darken 25-30% for text legibility
         → Top vignette (dark gradient fading down from top, ~55% height)

Layer 1: Audio waveform overlay
         → Vertical bars, 6px spacing, random heights 8-90px
         → Template accent color, alpha 120-220
         → Left 30% and right 30% of canvas, around y=75-165

Layer 2: Hero photo (if provided)
         → Remove.bg API removes background → RGBA PNG
         → Color grade: blend 15-22% with template accent color
         → Contrast enhance 1.15-1.18x
         → Resize to 55-65% of canvas height
         → Position: centered or slightly offset, below title zone
         → Composite glow behind subject (accent color, blur 35-40px)

Layer 3: Logo
         → Transparent PNG, resized to 38-42% of canvas width
         → Position: top-center, y=25-35

Layer 4: Pill banner
         → Rounded rectangle, fill (8,8,8,245), outline (70,70,70)
         → Inner highlight line at 3px inset
         → Bebas Neue text centered inside, white

Layer 5: Neon title
         → Bebas Neue, size 180-220px (scales with canvas)
         → 3-pass glow: blur 30px (×2 intensity), blur 12px, blur 4px
         → Solid white fill on top

Layer 6: Outline subtitle
         → Bebas Neue, size 95-115px
         → 3-pass outline glow: stroke_width 3-4, blur 25px (×2), blur 8px, blur at stroke
         → Final: thin white inner stroke (1px) for highlight

Layer 7: Instructor oval
         → Neon glow ring: 20 concentric ellipses with increasing alpha
         → Solid accent ring (5px) + white inner ring (2px)
         → Bebas Neue text inside: instructor name (36-38px) + time (52-56px)

Layer 8: Info block
         → Dark gradient overlay for legibility
         → "DATES:" label (58-72px)
         → Date text (82-96px) with drop shadow (3px offset, 4px blur)
         → Address line (32-36px)

Layer 9: Footer bar
         → Solid fill (8,8,8), 60-65px height
         → Gray top border (2px)
         → Two-tone text: white for labels, accent color for URL + "STRICTLY LIMITED!"

Layer 10: QR code (optional)
         → Generated from CTA URL
         → White padding box behind for scannability
         → ~15% of canvas width
         → Position: lower-left or lower-right depending on template
```

## Variant Logic

When generating a flyer, produce 3 variants:

- **Variant A:** User-uploaded photo as hero, primary background plate
- **Variant B:** Same photo, different background plate from library (different lighting/angle)
- **Variant C:** No photo — typography-dominant (giant title + logo + color wash fills hero zone)

All 3 variants render at all 3 sizes = 9 total images.

## Background Plate Library

Pre-generated Ideogram backgrounds stored in `backgrounds/` directory, organized by template color:

```
backgrounds/
├── blue/          ← Masterclass (4+ plates)
├── orange/        ← Breakin'/Series (4+ plates)
├── gold-green/    ← Workshop (4+ plates)
└── purple/        ← Event (4+ plates)
```

Prompts used to generate these (for regeneration/refresh):
- **Blue:** "Empty dark urban brick alley at night, dramatic deep blue and cyan lighting, cinematic atmosphere, motion blur light streaks, graffiti walls in shadow, hazy fog, dramatic perspective, vertical composition, wide negative space in upper third for text overlay, no people, no text, no logos, photorealistic, moody, electric blue color grading"
- **Orange:** Same but "warm orange and amber lighting, fire tones, energetic motion blur"
- **Gold-Green:** Same but "warm golden and green lighting, earth tones, organic atmosphere"
- **Purple:** Same but "deep purple and magenta lighting, dramatic shadows, event stage atmosphere"

## Directory Structure

```
danzversity-flyers/
├── CLAUDE.md                    ← You are here
├── package.json
├── render-service/
│   ├── server.js                ← Express API server
│   ├── render.js                ← Core compositing engine
│   ├── templates/
│   │   ├── masterclass.js       ← Template: layout coords, colors, font sizes
│   │   ├── workshop.js
│   │   ├── series.js
│   │   └── event.js
│   ├── integrations/
│   │   ├── removebg.js          ← Remove.bg API wrapper
│   │   ├── ideogram.js          ← Ideogram v3 API wrapper
│   │   ├── qrcode.js            ← QR code generator
│   │   └── gdrive.js            ← Google Drive upload
│   └── utils/
│       ├── color-grade.js       ← Photo color grading
│       ├── neon-text.js         ← Multi-layer neon glow text rendering
│       └── resize.js            ← Smart crop/resize with face detection
├── frontend/
│   ├── index.html               ← Form + approval grid
│   ├── style.css                ← Dark theme matching danzversity.com
│   └── app.js                   ← Form handling, preview display, approve flow
├── fonts/
│   ├── BebasNeue-Regular.ttf    ← OFL licensed
│   └── OFL.txt
├── assets/
│   └── logo.png                 ← Transparent Danzversity graffiti logo
└── backgrounds/
    ├── blue/
    ├── orange/
    ├── gold-green/
    └── purple/
```

## Build Steps (Session 1)

1. `npm init` + install sharp, express, cors, qrcode, googleapis, multer, dotenv
2. Bundle Bebas Neue font at `fonts/BebasNeue-Regular.ttf`
3. Download + convert logo to transparent PNG at `assets/logo.png`
4. Build `render.js` — core compositing engine that takes JSON input and produces a flyer PNG
5. Build `templates/masterclass.js` — layout coordinates, colors, font sizes for the masterclass template
6. Build `integrations/removebg.js` — Remove.bg API wrapper
7. Build `integrations/ideogram.js` — Ideogram v3 API wrapper (for fresh background generation)
8. Build `integrations/qrcode.js` — QR code generator wrapper
9. Build `server.js` — Express server with POST /render endpoint
10. Test: `node render-service/server.js` → POST /render with test JSON → verify output PNG
11. Generate 4 blue background plates using Ideogram and save to `backgrounds/blue/`

## Proof of Concept Reference

A working Python proof of concept was validated on April 10, 2026. Key learnings:

- Remove.bg produces production-quality cutouts even on complex backgrounds (graffiti mural behind subject). Cost: $0.20/image. rembg (free) is decent but has edge artifacts.
- Ideogram v3 with prompt "Empty dark urban brick alley at night, dramatic deep blue and cyan lighting..." produces perfect flyer backgrounds.
- Bebas Neue at 180-220px renders the exact poster typography from existing Danzversity flyers.
- Multi-layer neon glow (3 gaussian blur passes at 30/12/4px, doubled first pass) matches the existing brand look.
- Outline-style subtitle (stroke_width 3-4, same blur passes, transparent fill) matches the CHOREOGRAPHY treatment.
- Color grading (15-22% blend toward template accent color + 1.15x contrast) makes any photo look like it belongs in the template.
- Full 9-layer composite renders in under 3 seconds on basic hardware.
- Hero should be 55-65% of canvas height and positioned so head is clearly visible below the title text.

## Danzversity Brand Context

- **Business:** Hip-hop and street dance cultural academy, 7531 Burnet Rd, Austin TX 78757
- **Website:** danzversity.com (static HTML on Netlify)
- **Brand colors:** Black `#000`, Gold `#FFD700`, Red `#E74C3C`
- **Brand font:** Bebas Neue (headlines), Inter (body)
- **Logo:** Graffiti-style "DANZVERSITY" text, white/teal/gray on transparent
- **Vibe:** Urban, energetic, inclusive, street dance culture. Not corporate. Not cute. Not generic fitness.
- **Standard footer:** "REGISTER ONLINE @ WWW.DANZVERSITY.COM | SPOTS ARE STRICTLY LIMITED!"
- **Standard address:** "DANZVERSITY - 7531 BURNET RD. 78757"

## Environment Setup

```bash
git clone https://github.com/Danzversity/danzversity-flyers.git
cd danzversity-flyers
npm install
# Create .env with:
# IDEOGRAM_API_KEY=...
# REMOVEBG_API_KEY=...
# PORT=3001
node render-service/server.js
```
