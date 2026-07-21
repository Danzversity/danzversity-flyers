# Danzversity Flyer Maker

## What this is

A start-to-finish flyer tool on a **hybrid model**: AI provides the *visuals*, real photos provide the *people*, and **code provides the locked brand chassis** — identical every render.

- **① Compose** — pick a template, fill the info, pick a **background** from the library + a **real photo** (cut out via Remove.bg), toggle QR → the code chassis (logo, gold Bebas headline, exact info, CTA, QR, footer) is stamped over it → a finished master.
- **② Size & ship** — the master derives into all distribution sizes, packages Meta/PMax bundles, and saves to the dated Drive tree. (Or drop your own finished master here.)
- **🎬 Video (v1.4.0)** — the same doctrine for short-form clips. "What are we making today?" mode picker → pick footage from the `_video` Drive library, trim, hook line → ffmpeg cuts it to the **Video Output Standard v1**: cold-open (NO title slide), burned-in hook text (first 3s), corner logo watermark, 1.4s code-rendered brand **end-card** (the video chassis), loudnorm −14 LUFS, and a mandatory **ffprobe quality gate** — any output that misses the encode contract fails the compose loudly (flyer OCR-gate doctrine).

**Why hybrid:** AI text/layout is inconsistent (that's why the old full-AI path made you pick from 4). Code-rendered text is **byte-identical every time**. AI is used only where it's strong — backgrounds — and those are **captured into an approved library** so they're free + repeatable.

> The chassis is the LOCKED layer — do not make it AI-generated. Backgrounds (library) and the person photo are what vary. Brand spec: Flyer Design Standard v11, Confluence **MS `472809473`**. Status page: BSP `475725826`.

## The two libraries (Drive-backed, browser-managed)

So Jaymie / a hire can manage assets without code, the pools live in Google Drive:
- **Backgrounds** → `FLYERS/_backgrounds` (`BG_FOLDER_ID`)
- **People photos** → `FLYERS/_people` (`PEOPLE_FOLDER_ID`)
- **Footage (video)** → `FLYERS/_video` (`VIDEO_FOLDER_ID`) — raw clips for the video cutter

Add via the tool ("+ Add background" / "Upload photo") or by dropping files straight into the Drive folder. `pipeline/library.js` reads Drive via the service account in prod, and falls back to local `library/` dirs in dev (seed with `node render-service/seed-library-dev.js`).

## Chassis (`pipeline/chassis.js`) — the deterministic layer

SVG with Bebas Neue + Inter embedded base64, **and** the same TTFs installed into fontconfig at server startup (librsvg ignores the `@font-face` data-URIs on Render — see Discipline) → composited over background (+ person) with Sharp. Layouts dispatch on `spec.layout`: **A** (standard) · **A-Lite** (paid, photo-dominant, minimal, no QR) · **B** (hype) · **testimonial** (quote). Dark scrims keep text legible on any plate. Per-product content lives in `templates.js` `CHASSIS` / `buildChassis()`.

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
- **Video:** `GET /videos` · `POST /upload-video` · `POST /video-compose` (sourceId|file + start/seconds/aspects/hook/end JSON → gated MP4s by token URL) · `GET /video-out/:token.mp4` (1h TTL, behind auth) · `POST /save-videos-to-drive` (`FLYERS/{tpl}/{YYYY-MM}/Video/`)

## Run

```bash
npm install
npm test                                   # size/bundle pipeline
node render-service/test-chassis.js        # chassis determinism
node render-service/test-flyer.js          # full compose loop
node render-service/seed-library-dev.js    # seed local library for dev
npm start                                  # http://localhost:3001
```

## Production — LIVE

**LIVE on Render** (since 2026-06-23): `https://danzversity-flyers.onrender.com`, basic-auth `danzversity` / `7531Burnet`. Service `danzversity-flyers`, autoDeploy on `main` from `render.yaml` (folder IDs baked in as plain values; SA JSON + `REMOVEBG_API_KEY` are dashboard secrets). SA = `danzversity-flyer-maker@danzversity-payments.iam.gserviceaccount.com`, already shared on the FLYERS folders. Optional remaining: CNAME `flyers.danzversity.com` → Render (DNS on Netlify).

## Discipline

- `brand.js` and `templates.js` are the single sources of truth — never hard-code hexes/sizes/copy elsewhere.
- The chassis is code-locked and deterministic — keep it that way.
- Real-people photos live only in the private Drive, never committed.
- **Drive auth/REST is hand-rolled over `node:https` in `integrations/gdrive.js` — do NOT reintroduce the `googleapis` library.** On Render (Node 22 + gaxios/undici) every googleapis call dies with "Premature close"; node:https works. We sign the SA JWT with node crypto and hit the Drive REST API directly.
- **Video Output Standard v1 lives in `brand.js` (`videoSizes` + `videoStandard`)** — the encode contract (1080-class, 30fps, H.264 High yuv420p CRF 20, AAC 48k, loudnorm −14 LUFS, faststart) and anatomy (hook 3s, end-card 1.4s, watermark, safe zones). `pipeline/video.js` enforces it via the ffprobe gate; `render-service/test-video.js` is the offline proof. NEVER hand-tune ffmpeg args in server.js — the standard is the single source of truth.
- **ffmpeg = `@ffmpeg-installer/ffmpeg`, ffprobe = `ffprobe-static` — both ship binaries INSIDE the npm tarballs. NEVER switch to `ffmpeg-static`:** its postinstall downloads ~120MB from GitHub releases at install time — it failed the Render build and truncated two local installs (7/21). `/health` `videoReady` proves the binaries actually execute (a boot self-test, not a file-exists check). `FFMPEG_PATH`/`FFPROBE_PATH` env override available.
- **Fonts MUST be installed into fontconfig on the host — base64 `@font-face` is NOT enough.** Render's librsvg silently IGNORES the SVG `@font-face` data-URI embeds and falls back to a generic sans (wide, edge-to-edge, "amateur" lettering). `server.js` copies the bundled TTFs (`fonts/*.ttf`) into `~/.fonts` + `~/.local/share/fonts` and runs `fc-cache -f` at startup, because fontconfig is what librsvg actually consults. Local dev had the fonts system-wide, so **local always looked right while prod silently didn't** — ALWAYS verify the actual prod render, never a local one. A missing font is invisible in code and obvious on the page. (Root cause of the 6/23 "amateur lettering" saga; fixed `30726b0`.)
- **(You)nity flyers are AACME/Elevate grant-compliant** — the `younity-nights` template MUST keep the verbatim publicity statement (don't fix "a Elevate"), the AACME logo, tourist-welcoming copy, AND the RSVP/registration QR (attendance tracking is a grant obligation). Never strip these.
