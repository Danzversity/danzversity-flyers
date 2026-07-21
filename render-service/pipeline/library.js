// Asset library — the background + people pools, backed by Google Drive so
// non-technical users (Jaymie, a hire) manage them from a browser, not the repo.
//
//   Drive (prod): reads/writes the _backgrounds / _people folders via the
//   service account (BG_FOLDER_ID / PEOPLE_FOLDER_ID env).
//   Local (dev):  falls back to library/backgrounds + library/people on disk so
//   the flow is testable without Drive credentials.

const fs = require('fs');
const path = require('path');
const gdrive = require('../integrations/gdrive');

const FOLDER = { backgrounds: process.env.BG_FOLDER_ID, people: process.env.PEOPLE_FOLDER_ID, video: process.env.VIDEO_FOLDER_ID };
const LOCAL = {
  backgrounds: path.join(__dirname, '..', '..', 'library', 'backgrounds'),
  people: path.join(__dirname, '..', '..', 'library', 'people'),
  video: path.join(__dirname, '..', '..', 'library', 'video'),
};
const IMG_RE = /\.(png|jpe?g|webp)$/i;
const VID_RE = /\.(mp4|mov|m4v|webm)$/i;
const EXT_RE = { backgrounds: IMG_RE, people: IMG_RE, video: VID_RE };

function driveBacked(kind) {
  return gdrive.isConfigured() && !!FOLDER[kind];
}

/** List a library: [{id, name, source, thumb}]. */
async function list(kind) {
  if (driveBacked(kind)) {
    const files = await (kind === 'video' ? gdrive.listVideos(FOLDER[kind]) : gdrive.listImages(FOLDER[kind]));
    return files.map((f) => ({ id: f.id, name: f.name, source: 'drive', thumb: f.thumbnailLink || null, bytes: f.size ? Number(f.size) : null }));
  }
  const dir = LOCAL[kind];
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => (EXT_RE[kind] || IMG_RE).test(n))
    .map((n) => ({ id: `local:${kind}:${n}`, name: n, source: 'local', thumb: null, bytes: fs.statSync(path.join(dir, n)).size }));
}

/** Fetch one asset's bytes by id (Drive file id, or local:kind:name). */
async function get(kind, id) {
  if (!id) throw new Error('asset id required');
  if (String(id).startsWith('local:')) {
    const [, k, name] = String(id).split(':');
    return fs.readFileSync(path.join(LOCAL[k] || LOCAL[kind], name));
  }
  return gdrive.downloadFile(id);
}

/** Add an asset to a library; returns {id, name, source}. */
async function upload(kind, name, buffer, mimeType = 'image/png') {
  if (driveBacked(kind)) {
    const f = await gdrive.uploadImage(FOLDER[kind], name, buffer, mimeType);
    return { id: f.id, name, source: 'drive' };
  }
  const dir = LOCAL[kind];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buffer);
  return { id: `local:${kind}:${name}`, name, source: 'local' };
}

function status() {
  return {
    backgrounds: driveBacked('backgrounds') ? 'drive' : 'local',
    people: driveBacked('people') ? 'drive' : 'local',
    video: driveBacked('video') ? 'drive' : 'local',
  };
}

module.exports = { list, get, upload, status };
