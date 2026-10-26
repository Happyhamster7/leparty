// HTTP handlers shared by the Vercel functions (api/*.js) and the local Express server.
// Both give us req.query, req.body (parsed JSON) and res.status().json().
const QRCode = require('qrcode');
const { createApi, credsFrom } = require('./api');
const { createStore, ConfigError } = require('./store');

let api = null;
const getApi = () => (api ||= createApi({ store: createStore() }));

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

async function qr(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url = String(req.query.url || `${proto}://${host}/`).slice(0, 300);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(svg);
}

module.exports = { state, action, qr };
