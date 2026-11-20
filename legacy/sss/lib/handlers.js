// HTTP handlers shared by the Vercel functions (api/*.js) and the local Express server.
// Both give us req.query, req.body (parsed JSON) and res.status().json().
const QRCode = require('qrcode');
const { createApi, credsFrom } = require('./api');
const { createStore, ConfigError } = require('./store');
const { createFiles, MAX_BYTES } = require('./files');

let api = null;
const getApi = () => (api ||= createApi({ store: createStore(), files: createFiles() }));

function fail(res, err) {
  console.error(err);
  if (err instanceof ConfigError) return res.status(503).json({ ok: false, error: err.message });
  res.status(500).json({ ok: false, error: 'The server room is on fire. Try again in a moment.' });
}

async function state(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only.' });
  try {
    res.status(200).json(await getApi().getState(credsFrom(req), req.query.v));
  } catch (err) {
    fail(res, err);
  }
}

async function action(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    res.status(200).json(await getApi().action(body, credsFrom(req)));
  } catch (err) {
    fail(res, err);
  }
}

// Reads a raw upload, refusing anything over the size limit.
function readBody(req, limit) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.length > limit ? null : req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// POST /api/clip — body: the video; headers: x-player-token, content-type, x-clip-caption (URI-encoded).
async function clip(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only.' });
  try {
    const declared = Number(req.headers['content-length'] || 0);
    const body = declared > MAX_BYTES ? null : await readBody(req, MAX_BYTES);
    if (!body) return res.status(413).json({ ok: false, error: 'That video is too big. Keep it short.' });
    if (!body.length) return res.status(400).json({ ok: false, error: 'The video came through empty. Try again.' });
    let caption = '';
    try {
      caption = decodeURIComponent(String(req.headers['x-clip-caption'] || ''));
    } catch {}
    res.status(200).json(await getApi().uploadClip(credsFrom(req), { body, type: req.headers['content-type'] || '', caption }));
  } catch (err) {
    fail(res, err);
  }
}

// The browser uploader asks for a one-off token here before sending a video straight to Blob storage.
async function clipToken(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const out = await getApi().clipToken(req, body);
    res.status(out.ok === false && body.type !== 'check' ? 400 : 200).json(out);
  } catch (err) {
    fail(res, err);
  }
}

async function qr(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url = String(req.query.url || `${proto}://${host}/`).slice(0, 300);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(svg);
}

module.exports = { state, action, clip, clipToken, qr };
