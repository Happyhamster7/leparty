// Local / single-server host (npm start). On Vercel the same handlers run as functions in api/.
const express = require('express');
const path = require('path');
const handlers = require('./lib/handlers');
const { createFiles } = require('./lib/files');
const { pinsFrom } = require('./lib/api');

const PORT = Number(process.env.PORT) || 3000;
const pins = pinsFrom();
if (pins.warden === pins.officer) {
  console.error('WARDEN_PIN and OFFICER_PIN must be different.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/tv', '/warden', '/officer', '/vote'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/qr.svg', handlers.qr);
app.get('/api/state', handlers.state);
app.post('/api/action', handlers.action);
app.post('/api/clip', handlers.clip);
app.post('/api/clip-token', handlers.clipToken);
const clipDir = createFiles().dir;
if (clipDir) app.use('/clips', express.static(clipDir, { maxAge: '1h' }));

app.listen(PORT, () => {
  console.log(`🔒 Shifty Shen's Slammer is open on http://localhost:${PORT}`);
  console.log(`   Warden:             http://localhost:${PORT}/warden   (PIN ${process.env.WARDEN_PIN || process.env.ADMIN_PIN ? 'from WARDEN_PIN' : '1234 — set WARDEN_PIN to change'})`);
  console.log(`   Commissary Officer: http://localhost:${PORT}/officer  (PIN ${process.env.OFFICER_PIN ? 'from OFFICER_PIN' : '5678 — set OFFICER_PIN to change'})`);
  console.log(`   TV / projector:     http://localhost:${PORT}/tv`);
});
