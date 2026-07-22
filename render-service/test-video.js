// Offline test: synthesize a source clip (testsrc2 + sine tone), run the full
// composeVideo pipeline (hook + watermark + end-card + gate) for all three
// aspects, and assert every gate passes. No network, no Drive.
//
//   node render-service/test-video.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const video = require('./pipeline/video');
const brand = require('./brand');

async function main() {
  console.log('ffmpeg:', video.FFMPEG);
  const src = path.join(os.tmpdir(), 'dvz-test-src.mp4');

  // 12s synthetic source with audio — enough for an 8s cut + margins.
  const gen = spawnSync(video.FFMPEG, [
    '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=12',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src,
  ], { windowsHide: true });
  if (gen.status !== 0) { console.error('source synth failed:', gen.stderr.toString().slice(-500)); process.exit(1); }

  const t0 = Date.now();
  const { outputs, source, workDir } = await video.composeVideo({
    srcPath: src,
    start: 2,
    seconds: 8,
    aspects: Object.keys(brand.videoSizes),
    hook: 'POV: your first breakin class',
    endSpec: { headline: 'ADULT HIP-HOP CLASSES', subhead: 'All levels · 7531 Burnet Rd, Austin', cta: 'START YOUR TRIAL', url: 'DANZVERSITY.COM' },
    slug: 'test-clip',
  });

  console.log(`\nsource: ${source.duration.toFixed(1)}s ${source.video.width}x${source.video.height}, audio: ${source.audio ? source.audio.codec : 'none'}`);
  let fail = 0;
  for (const o of outputs) {
    console.log(`\n${o.sizeKey} → ${o.filename}  ${o.width}x${o.height}  ${o.seconds.toFixed(1)}s  ${(o.bytes / 1e6).toFixed(1)}MB  gate: ${o.gate.ok ? 'PASS' : 'FAIL'}`);
    for (const c of o.gate.checks) {
      if (!c.ok) { fail++; console.log(`   ✗ ${c.name}: got ${c.got}, want ${c.want}`); }
    }
  }
  console.log(`\n${outputs.length} outputs in ${Date.now() - t0}ms · ${fail === 0 ? 'ALL GATES PASS ✓' : fail + ' GATE CHECKS FAILED ✗'}`);

  // Music (v1.5): a short looping track, replace + bed — gates must pass and
  // the reported audioPlan must say what actually happened.
  const musSrc = path.join(os.tmpdir(), 'dvz-test-music.m4a');
  spawnSync(video.FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:a', 'aac', musSrc], { windowsHide: true });
  for (const mode of ['replace', 'bed']) {
    const m = await video.composeVideo({ srcPath: src, start: 2, seconds: 8, aspects: ['9x16'], hook: null, endSpec: { headline: 'MUSIC ' + mode.toUpperCase(), url: 'DANZVERSITY.COM' }, slug: 'music-' + mode, musicPath: musSrc, musicMode: mode });
    const o = m.outputs[0];
    console.log(`music/${mode}: gate ${o.gate.ok ? 'PASS ✓' : 'FAIL ✗'} · audioPlan=${o.audioPlan}`);
    if (!o.gate.ok || o.audioPlan !== mode) fail++;
    fs.rmSync(m.workDir, { recursive: true, force: true });
  }
  fs.unlinkSync(musSrc);

  // No-audio source path: gate must still pass with synthesized silence.
  const srcMute = path.join(os.tmpdir(), 'dvz-test-src-mute.mp4');
  spawnSync(video.FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=6', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', srcMute], { windowsHide: true });
  const mute = await video.composeVideo({ srcPath: srcMute, start: 0, seconds: 4, aspects: ['9x16'], hook: null, endSpec: { headline: 'MUTE TEST', url: 'DANZVERSITY.COM' }, slug: 'mute' });
  console.log(`mute-source 9x16 gate: ${mute.outputs[0].gate.ok ? 'PASS ✓' : 'FAIL ✗'}`);

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(mute.workDir, { recursive: true, force: true });
  fs.unlinkSync(src); fs.unlinkSync(srcMute);
  process.exit(fail === 0 && mute.outputs[0].gate.ok ? 0 : 1);
}

main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
