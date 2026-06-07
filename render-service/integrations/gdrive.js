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

async function getDrive() {
  const auth = new google.auth.GoogleAuth({ credentials: getCredentials(), scopes: SCOPES });
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
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

module.exports = { isConfigured, saveImages };
