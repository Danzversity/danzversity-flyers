// Social posting bridge — flyer → danzversity-social rail (FB + IG).
//
// The rail (POST /admin/post-social on the danzversity-social worker) needs a
// PUBLICLY fetchable imageUrl (Meta's Graph API downloads it), but this whole
// service sits behind basic-auth. Bridge: rendered buffers register here under
// an unguessable token and are served auth-exempt at GET /pub/:token.jpg for
// a short TTL — public enough for Meta's fetch, no listing, self-expiring.
// In-memory on purpose: the post happens seconds after the render; a Render
// restart merely invalidates pending tokens.

const crypto = require('crypto');

const RAIL_URL = process.env.SOCIAL_RAIL_URL || 'https://danzversity-social.tony-1f5.workers.dev/admin/post-social';
const RAIL_KEY = process.env.SOCIAL_RAIL_KEY || '';
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://danzversity-flyers.onrender.com';
const TTL_MS = 60 * 60 * 1000; // 1h — plenty for Meta's fetch + retries

const store = new Map(); // token -> { buffer, type, expires }

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
}

function isConfigured() { return !!RAIL_KEY; }

// Register a buffer for public serving; returns its public URL. The extension
// follows the type — Meta's Graph API fetches .jpg for photos, .mp4 for video.
function registerPublic(buffer, type = 'image/jpeg') {
  sweep();
  const token = crypto.randomBytes(24).toString('hex');
  store.set(token, { buffer, type, expires: Date.now() + TTL_MS });
  const ext = type === 'video/mp4' ? 'mp4' : 'jpg';
  return { token, url: `${PUBLIC_BASE}/pub/${token}.${ext}` };
}

function getPublic(token) {
  sweep();
  return store.get(token) || null;
}

// Post via the rail. mode 'preview' returns the composed post without sending.
// placement: 'feed' (default) or 'story' (rail v2 routes to IG Stories + FB
// Page photo stories; stories carry no caption).
// node:https via httpz — undici/fetch is broken on Render (standing rule).
const { postJson } = require('./httpz');
async function post({ imageBuffer, caption = '', platforms = ['facebook', 'instagram'], placement = 'feed', mode = 'preview', link }) {
  if (!RAIL_KEY) throw new Error('SOCIAL_RAIL_KEY not set on this server — add it in the Render dashboard env.');
  const { url } = registerPublic(imageBuffer);
  const { status, json: data } = await postJson(RAIL_URL, { key: RAIL_KEY, mode, platforms, placement, text: caption, imageUrl: url, link }, { timeout: 60000 });
  // A rail 502 with sent:true is a PARTIAL result (e.g. FB posted, IG failed)
  // — pass it through with its per-platform detail instead of throwing, so
  // the UI can report exactly what went out and what didn't.
  if (data && (data.sent || data.preview)) return { ...data, publicImageUrl: url };
  if (status < 200 || status >= 300) throw new Error(`social rail ${status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { ...data, publicImageUrl: url };
}

// Post a VIDEO via the rail (v5): FB Page video + IG Reel (feed) or IG video
// story (story). IG's video processing runs 30s-2min, so the rail call gets a
// long timeout — the rail itself polls the container to FINISHED before publish.
async function postVideo({ videoBuffer, caption = '', platforms = ['facebook', 'instagram'], placement = 'feed', mode = 'preview' }) {
  if (!RAIL_KEY) throw new Error('SOCIAL_RAIL_KEY not set on this server — add it in the Render dashboard env.');
  const { url } = registerPublic(videoBuffer, 'video/mp4');
  const { status, json: data } = await postJson(RAIL_URL, { key: RAIL_KEY, mode, platforms, placement, text: caption, videoUrl: url }, { timeout: 180000 });
  if (data && (data.sent || data.preview)) return { ...data, publicVideoUrl: url };
  if (status < 200 || status >= 300) throw new Error(`social rail ${status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { ...data, publicVideoUrl: url };
}

module.exports = { isConfigured, registerPublic, getPublic, post, postVideo };
