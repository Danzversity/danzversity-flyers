// Google Drive integration — service-account REST calls over node:https.
//
// We deliberately do NOT use the googleapis library here. On Render (Node 22 +
// gaxios 6 / undici) EVERY googleapis call dies with "Premature close" — the
// token mint AND the Drive calls — even though plain node:https / fetch to the
// same hosts works fine (verified: googleapis returns normal HTTP responses).
// So we sign the SA JWT with node crypto, mint the token over https, and hit the
// Drive REST API directly with node:https. Zero gaxios, zero undici.

const https = require('https');
const crypto = require('crypto');
const brand = require('../brand');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

function isConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT;
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT not set');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not valid JSON');
  }
}

// ── Low-level HTTPS (node:https — bypasses the broken gaxios/undici path) ──────
function httpsRequest(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers: headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Service-account token mint (cached until ~60s before expiry) ──────────────
let _token = null;

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token && _token.exp > now) return _token.access_token;
  const creds = getCredentials();
  const aud = creds.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: creds.client_email, scope: SCOPES.join(' '), aud, iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${claims}`;
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signingInput), creds.private_key));
  const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${signingInput}.${signature}`;
  const res = await httpsRequest('POST', aud, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
  }, body);
  if (res.status !== 200) throw new Error(`SA token mint failed (${res.status}): ${res.buffer.toString().slice(0, 200)}`);
  const json = JSON.parse(res.buffer.toString());
  if (!json.access_token) throw new Error('SA token mint: no access_token in response');
  _token = { access_token: json.access_token, exp: now + (json.expires_in || 3600) - 60 };
  return _token.access_token;
}

async function authHeaders(extra) {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}`, ...(extra || {}) };
}

// ── Drive REST ────────────────────────────────────────────────────────────────
function qs(params) {
  return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

async function listByMime(folderId, mimePrefix) {
  const url = `${API}/files?` + qs({
    q: `'${folderId}' in parents and mimeType contains '${mimePrefix}' and trashed=false`,
    fields: 'files(id,name,mimeType,thumbnailLink,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const res = await httpsRequest('GET', url, await authHeaders());
  if (res.status !== 200) throw new Error(`Drive list ${res.status}: ${res.buffer.toString().slice(0, 200)}`);
  return JSON.parse(res.buffer.toString()).files || [];
}
const listImages = (folderId) => listByMime(folderId, 'image/');
const listVideos = (folderId) => listByMime(folderId, 'video/');
const listAudio = (folderId) => listByMime(folderId, 'audio/');

async function downloadFile(fileId) {
  const url = `${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const res = await httpsRequest('GET', url, await authHeaders());
  if (res.status !== 200) throw new Error(`Drive download ${res.status}: ${res.buffer.toString().slice(0, 150)}`);
  return res.buffer;
}

async function findOrCreateFolder(name, parentId) {
  const safe = String(name).replace(/'/g, "\\'");
  const clauses = [`name='${safe}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false'];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const listUrl = `${API}/files?` + qs({
    q: clauses.join(' and '),
    fields: 'files(id,name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 10,
  });
  const lr = await httpsRequest('GET', listUrl, await authHeaders());
  if (lr.status === 200) {
    const files = JSON.parse(lr.buffer.toString()).files;
    if (files && files.length) return files[0].id;
  }
  const body = JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined });
  const cr = await httpsRequest('POST', `${API}/files?supportsAllDrives=true&fields=id`,
    await authHeaders({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }), body);
  if (cr.status !== 200) throw new Error(`Drive folder create ${cr.status}: ${cr.buffer.toString().slice(0, 150)}`);
  return JSON.parse(cr.buffer.toString()).id;
}

async function resolvePath(segments) {
  let parent = process.env.FLYERS_ROOT_FOLDER_ID || null;
  const startIdx = parent ? 1 : 0;
  for (let i = startIdx; i < segments.length; i++) parent = await findOrCreateFolder(segments[i], parent);
  return parent;
}

async function uploadImage(folderId, name, buffer, mimeType = 'image/png') {
  const boundary = '----dvzflyer' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name, parents: [folderId] });
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, buffer, post]);
  const url = `${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`;
  const res = await httpsRequest('POST', url,
    await authHeaders({ 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': body.length }), body);
  if (res.status !== 200) throw new Error(`Drive upload ${res.status}: ${res.buffer.toString().slice(0, 150)}`);
  return JSON.parse(res.buffer.toString());
}

/**
 * Save a set of images into the dated FLYERS tree, bucketed by channel.
 * @param {string} template  e.g. "Summer Camp Week 1"
 * @param {string} yyyymm    e.g. "2026-06"
 * @param {Array<{filename:string,buffer:Buffer,channel:'organic'|'paid'}>} images
 */
async function saveImages(template, yyyymm, images) {
  const folderCache = {};
  const results = [];
  for (const img of images) {
    const channel = ['paid', 'video'].includes(img.channel) ? img.channel : 'organic';
    if (!folderCache[channel]) {
      const segs = brand.drivePathSegments(template, yyyymm, channel);
      folderCache[channel] = await resolvePath(segs);
    }
    try {
      const f = await uploadImage(folderCache[channel], img.filename, img.buffer, img.mimeType || 'image/png');
      results.push({ filename: img.filename, success: true, fileId: f.id, webViewLink: f.webViewLink });
    } catch (e) {
      results.push({ filename: img.filename, success: false, error: e.message });
    }
  }
  return { results, savedCount: results.filter((r) => r.success).length };
}

// ── AACME grant logo (Elevate compliance) ────────────────────────────────────
// Required on every (You)nity Night marketing piece. The white PNG lives in the
// FLYERS root (copied from the grant's logo pack), readable by the SA. Fetched
// once and cached for the process — null if unavailable (e.g. local dev no SA).
const AACME_LOGO_FILE_ID = '1QcCiVpasdANSDe6OSHGLiOpLBlk43kuo'; // aacme-logo-white.png
let _aacmeLogo;
async function getAacmeLogo() {
  if (_aacmeLogo !== undefined) return _aacmeLogo;
  try {
    _aacmeLogo = await downloadFile(AACME_LOGO_FILE_ID);
  } catch (e) {
    _aacmeLogo = null;
  }
  return _aacmeLogo;
}

module.exports = { isConfigured, saveImages, listImages, listVideos, listAudio, downloadFile, uploadImage, resolvePath, getAacmeLogo };
