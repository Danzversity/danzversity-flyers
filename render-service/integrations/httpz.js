// Minimal JSON-over-node:https POST — the standing-rule transport for this
// service (undici/fetch is broken on Render; gaxios before it). Use this for
// any new outbound JSON call instead of fetch.

const https = require('https');

function postJson(url, body, { headers = {}, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch (_) { /* non-JSON body */ }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { postJson };
