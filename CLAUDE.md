# Danzversity Flyer Maker

## What this is

A start-to-finish flyer tool on a **hybrid model**: AI provides the *visuals*, real photos provide the *people*, and **code provides the locked brand chassis** — identical every render.

- **① Compose** — pick a template, fill the info, pick a **background** from the library + a **real photo** (cut out via Remove.bg), toggle QR → the code chassis (logo, gold Bebas headline, exact info, CTA, QR, footer) is stamped over it → a finished master.
- **② Size & ship** — the master derives into all distribution sizes, packages Meta/PMax bundles, and saves to the dated Drive tree. (Or drop your own finished master here.)

**Why hybrid:** AI text/layout is inconsistent (that's why the old full-AI path made you pick from 4). Code-rendered text is **byte-identical every time**. AI is used only where it's strong — backgrounds — and those are **captured into an approved library** so they're free + repeatable.

> The chassis is the LOCKED layer — do not make it AI-generated. Backgrounds (library) and the person photo are what vary. Brand spec: Flyer Design Standard v11, Confluence **MS `472809473`**. Status page: BSP `475725826`.

## The two libraries (Drive-backed, browser-managed)

So Jaymie / a hire can manage assets without code, the pools live in Google Drive:
- **Backgrounds** → `FLYERS/_backgrounds` (`BG_FOLDER_ID`)
- **People photos** → `FLYERS/_people` (`PEOPLE_FOLDER_ID`)

Add via the tool ("+ Add background" / "Upload photo") or by dropping files straight into the Drive folder. `pipeline/library.js` reads Drive via the service account in prod, and falls back to local `library/` dirs in dev (seed with `node render-service/seed-library-dev.js`).

## Chassis (`pipeline/chassis.js`) — the deterministic layer

SVG with Bebas Neue embedded base64 → composited over background (+ person) with Sharp. Layouts dispatch on `spec.layout`: **A** (standard) · **A-Lite** (paid, photo-dominant, minimal, no QR) · **B** (hype) · **testimonial** (quote). Dark scrims keep text legible on any plate. Per-product content lives in `templates.js` `CHASSIS` / `buildChassis()`.

`pipeline/flyer.js` `composeFlyer()` renders the chassis **natively** at the portrait masters (4:5, 1:1, 9:16) for crispness, and **derives** the wide sizes from the 4:5 master.

## Structure

```
render-service/
  server.js               API + serves the frontend (single origin)
  brand.js                palette / families / size matrix / bundles / Drive layout
  templates.js            16 templates: fields, CHASSIS content per product, ad copy
  pipeline/chassis.js     code chassis compositor (4 layouts)
  pipeline/flyer.js       composeFlyer — bg + person + chassis → all sizes
  pipeline/library.js     backgrounds/people pools (Drive + local fallback)
  pipeline/derive.js      Sharp size derivation (letterbox / smart-crop)
  pipeline/bundle.js      Meta / PMax zips
  pipeline/prompt.js      ad-copy assembler + live URL verify
  integrations/gdrive.js  Drive (library + dated save)
  integrations/removebg.js  photo cutout, cached by hash
  integrations/ideogram.js  optional background generation
  test-*.js               offline tests (chassis determinism, composeFlyer, sizes, assembler)
fonts/BebasNeue-Regular.ttf · assets/refs/logo.png
frontend/                 ① Compose + ② Size & ship (dark urban)
library/                  local dev fallback (prod uses Drive)  [gitignored]
render.yaml               Render single-origin deploy
```

## API

- `GET /health` · `GET /templates`
- `GET /backgrounds` · `GET /people` · `GET /thumb?kind=&id=` · `POST /upload-background` · `POST /upload-person`
- **`POST /compose`** — templateKey + content + backgroundId + (photo|personId) → all sizes (the main path)
- `POST /process` — manual master(s) → all sizes · `POST /derive-one`
- `POST /export-meta-bundle` · `POST /export-pmax-bundle` · `POST /save-to-drive`
- `POST /assemble` (ad copy + prompt) · `GET /verify-url`

## Run

```bash
npm install
npm test                                   # size/bundle pipeline
node render-service/test-chassis.js        # chassis determinism
node render-service/test-flyer.js          # full compose loop
node render-service/seed-library-dev.js    # seed local library for dev
npm start                                  # http://localhost:3001
```

## Go-live (production)

1. Provision the Render service from the repo (`render.yaml`).
2. **Share the `FLYERS` Drive folder with the service account** (so the libraries + save work).
3. Env on Render: `GOOGLE_SERVICE_ACCOUNT`, `FLYERS_ROOT_FOLDER_ID`, `BG_FOLDER_ID`, `PEOPLE_FOLDER_ID`, `REMOVEBG_API_KEY`, optional `IDEOGRAM_API_KEY` (background generation), optional `FLYERS_USER`/`FLYERS_PASSWORD`.
4. Point `flyers.danzversity.com` at the Render service.

## Discipline

- `brand.js` and `templates.js` are the single sources of truth — never hard-code hexes/sizes/copy elsewhere.
- The chassis is code-locked and deterministic — keep it that way.
- Real-people photos live only in the private Drive, never committed.
