// Google Drive integration — service-account upload into the shared FLYERS tree.
//
// Folder layout (created on demand, idempotent find-or-create):
//   FLYERS/{Template}/{YYYY-MM}/{Organic|Paid}/{filename}.png
//
// Auth: GOOGLE_SERVICE_ACCOUNT env holds the service-account JSON (one line).
// Service accounts have no Drive storage quota, so the FLYERS root must be a
// folder shared WITH the service account (or a Shared Drive). Set
// FLYERS_ROOT_FOLDER_ID to that shared folder's id to skip the name lookup
// (recommended — faster and unambiguous).

const { google } = require('googleapis');
const { Readable } = require('stream');
const https = require('https');
const crypto = require('crypto');
const brand = require('../brand');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function isConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT;
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT not set');
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not valid JSON');
  }
  return creds;
}

// Mint the service-account access token OURSELVES via node:https.
//
// In prod (Node 22 + gaxios 6 / undici), google-auth-library's token POST to
// googleapis dies with "Premature close" — even though plain GET/POST to the
// same host works fine (verified: googleapis returns 404s, so the network is
// healthy). So we sign the JWT with node crypto and POST it with node:https
// (rock-solid HTTP/1.1), then hand the access token to the Drive client. Token
// is cached until ~60s before expiry.
let _token = null;

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function httpsPostForm(url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
  const assertion = `${signingInput}.${signature}`;
  const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`;
  const res = await httpsPostForm(aud, body);
  if (res.status !== 200) throw new Error(`SA token mint failed (${res.status}): ${String(res.data).slice(0, 200)}`);
  const json = JSON.parse(res.data);
  if (!json.access_token) throw new Error('SA token mint: no access_token in response');
  _token = { access_token: json.access_token, exp: now + (json.expires_in || 3600) - 60 };
  return _token.access_token;
}

async function getDrive() {
  const token = await getAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.drive({ version: 'v3', auth });
}

/** Find a child folder by name under parent (or anywhere shared, if no parent), else create it. */
async function findOrCreateFolder(drive, name, parentId) {
  const safe = String(name).replace(/'/g, "\\'");
  const q = [
    `name='${safe}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    parentId ? `'${parentId}' in parents` : null,
  ].filter(Boolean).join(' and ');

  const res = await drive.files.list({
    q,
    fields: 'files(id,name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 10,
  });
  if (res.data.files && res.data.files.length) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

/** Resolve FLYERS/{template}/{yyyymm}/{bucket} to a folder id, creating as needed. */
async function resolvePath(drive, segments) {
  let parent = process.env.FLYERS_ROOT_FOLDER_ID || null;
  // If the root id is provided it IS segment[0] (FLYERS); start creating from [1].
  let startIdx = parent ? 1 : 0;
  for (let i = startIdx; i < segments.length; i++) {
    parent = await findOrCreateFolder(drive, segments[i], parent);
  }
  return parent;
}

async function uploadPng(drive, folderId, filename, buffer) {
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: 'image/png', body: Readable.from(buffer) },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Save a set of images into the dated FLYERS tree, bucketed by channel.
 * @param {string} template  e.g. "Summer Camp Week 1"
 * @param {string} yyyymm    e.g. "2026-06"
 * @param {Array<{filename:string,buffer:Buffer,channel:'organic'|'paid'}>} images
 * @returns {Promise<{results:Array, savedCount:number}>}
 */
async function saveImages(template, yyyymm, images) {
  const drive = await getDrive();
  const folderCache = {};
  const results = [];

  for (const img of images) {
    const channel = img.channel === 'paid' ? 'paid' : 'organic';
    if (!folderCache[channel]) {
      const segs = brand.drivePathSegments(template, yyyymm, channel);
      folderCache[channel] = await resolvePath(drive, segs);
    }
    try {
      const f = await uploadPng(drive, folderCache[channel], img.filename, img.buffer);
      results.push({ filename: img.filename, success: true, fileId: f.id, webViewLink: f.webViewLink });
    } catch (e) {
      results.push({ filename: img.filename, success: false, error: e.message });
    }
  }

  return { results, savedCount: results.filter((r) => r.success).length };
}

// ── Library helpers (backgrounds / people folders) ───────────────────────────
async function listImages(folderId) {
  const drive = await getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id,name,mimeType,thumbnailLink,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

async function downloadFile(fileId) {
  const drive = await getDrive();
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

async function uploadImage(folderId, name, buffer, mimeType = 'image/png') {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

module.exports = { isConfigured, saveImages, listImages, downloadFile, uploadImage };
