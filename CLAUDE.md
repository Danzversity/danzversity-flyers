# Danzversity Flyer Pipeline

## What this is

A **start-to-finish flyer tool**: pick a template → fill the details → generate the on-brand master with Ideogram (or get the exact prompt to run it yourself) → it flows straight into sizing, bundles, and Drive.

**① CREATE** — pick one of the v11 templates and fill a short form. The tool assembles the exact Ideogram prompt + negative prompt + palette + locked style refs, verifies the CTA URL live (Standing Rule 1), generates 4 candidate masters (you pick the winner), and produces the Meta + PMax **ad copy**. No key? Guided mode hands you the prompt + copy to paste into Ideogram by hand.

**② SIZE & SHIP** — the chosen master is derived into every distribution size, trimmed for the paid family, packaged into Meta/PMax bundles, and saved into the dated Drive tree — with an approval grid + per-tile fit/fill re-crop before anything ships.

> ⚠️ This is NOT the old 11-layer neon compositing engine. Flyer Design Standard v11 retired that aesthetic — neon / text-glow / decorative graphics around the photo are now Ideogram **negative prompts**. Do not reintroduce Remove.bg cutouts, Ideogram background plates, neon SVG text, instructor ovals, audio-waveform bars, or per-color (blue/orange/…) template routing.

- **Brand source of truth:** Flyer Design Standard v11 — Confluence **MS `472809473`**. Pull it before changing families or sizes.
- **Architecture / build status:** Confluence **BSP `475725826`**.
- **GitHub:** `Danzversity/danzversity-flyers`.

## Families & sizes (`render-service/brand.js` is the single source of truth)

| Family | Channel | Sizes | Crop default |
|---|---|---|---|
| Style A — Text-Rich | organic | 4:5, 1:1, 9:16, 16:9, 4:3, 2:1, site-card (7) | letterbox (lossless) |
| Style A-Lite — Photo-Dominant | paid | 4:5, 1:1, 9:16, 1.91:1 (4) | smart fill-crop |
| Style B — Hype | organic | same 7 as A | letterbox |

- **Letterbox** pads onto pure brand black (`#000`) — invisible against the brand, never crops baked text. Default for text-rich A / B.
- **Smart** = saliency fill-crop, for photo-dominant paid A-Lite.
- Any tile can be flipped fit ↔ fill in the grid (`/derive-one`), so a bad crop is a one-click fix.
- **Bundles:** `meta` = A-Lite 4:5+1:1+9:16 · `pmax` = A-Lite 4:5+1:1+9:16+1.91:1.

## Structure

```
render-service/
  server.js               Express API + serves the frontend (single origin)
  brand.js                SINGLE SOURCE OF TRUTH — palette, families, sizes, bundles, Drive layout
  templates.js            16 v11 templates as data — prompt, family, fields, URL, ad copy (the CREATE source)
  pipeline/prompt.js      Token assembler (content → prompt + ad copy) + live URL verify
  pipeline/derive.js      Sharp size derivation (letterbox + smart crop)
  pipeline/bundle.js      archiver zip bundles
  integrations/ideogram.js  Ideogram 3.0 generate client (style refs from assets/refs/)
  integrations/gdrive.js  Service-account Drive upload
  test-pipeline.js        `npm test` — synthesizes a master, asserts every size + bundle
  test-create.js          asserts prompt assembly / routing / ad copy / validation
frontend/                 index.html + app.js + style.css (① Create + ② Size, dark urban)
assets/refs/              locked Ideogram style references (drop the approved flyers + logo here)
render.yaml               Render.com single-origin deploy config
```

## API

- `GET  /health` — service + brand status, drive/ideogram configured?, families/sizes/bundles
- `GET  /templates` — the template registry + their content fields
- `POST /assemble` — `{templateKey, content}` → prompt + negative + style refs + ad copy + live URL status
- `POST /generate` — `{templateKey, content}` → Ideogram candidate masters (or 503 + assembled prompt for guided mode)
- `GET  /verify-url?u=` — live CTA URL check (Standing Rule 1)
- `POST /process` — multipart `masterA` / `masterALite` / `masterB` → all sizes (JSON base64)
- `POST /derive-one` — re-crop one size with an explicit `policy` (backs the fit/fill toggle)
- `POST /export-meta-bundle` / `POST /export-pmax-bundle` — multipart A-Lite `master` → zip
- `POST /save-to-drive` — JSON base64 → `FLYERS/{Template}/{YYYY-MM}/{Organic|Paid}/`

## Run

```bash
npm install
npm test      # offline pipeline test → writes test-output/
npm start     # http://localhost:3001  (serves UI + API)
```

## Deploy (single origin)

Point `flyers.danzversity.com` at the Render service (`render.yaml`). It serves the UI **and** the API from one host — no CORS. Set secrets in the Render dashboard (never commit them):

- `IDEOGRAM_API_KEY` — enables one-click master generation (LastPass: `Danzversity — Ideogram API Key`). Without it, Create runs in guided mode.
- `GOOGLE_SERVICE_ACCOUNT` — service-account JSON. Share the `FLYERS` Drive folder *with* this account (service accounts have no storage quota).
- `FLYERS_ROOT_FOLDER_ID` — the shared `FLYERS` folder id (skips the name lookup).
- `FLYERS_PASSWORD` — optional basic-auth gate (`/health` stays open). `FLYERS_USER` defaults to `danzversity`.

**Style references:** drop the approved flyers + logo into `assets/refs/` (filenames in `templates.STYLE_REFS`: `summer-camp-evergreen-v10.png`, `summer-camp-paid-v1.png`, `pavel-masterclass.png`, `logo.png`) so Ideogram matches brand. Missing refs are skipped gracefully (prompt-only generation).

## Discipline

- `brand.js` is the only place for hexes / sizes / bundle definitions. Never hard-code them elsewhere.
- Derivation-only — no master is ever altered.
- URL/address verification on the master is a creative-step rule (Flyer Design Standard Rules 1 & 2); this tool adds no text.
