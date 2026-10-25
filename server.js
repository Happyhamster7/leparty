const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game, GameError } = require('./lib/game');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PIN = String(process.env.ADMIN_PIN || '1234');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'state.json');

// ---------- persistence ----------
function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return undefined;
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(game.s));
    fs.renameSync(tmp, DATA_FILE);
  }, 300);
}

const game = new Game(load());

// ---------- http ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get(['/tv', '/warden'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/qr.svg', async (req, res) => {
  const url = String(req.query.url || `${req.protocol}://${req.get('host')}/`).slice(0, 300);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});
app.get('/healthz', (req, res) => res.json({ ok: true, players: game.s.players.length }));

// ---------- realtime ----------
function viewFor(socket) {
  const d = socket.data;
  if (d.kind === 'admin') return game.adminView();
  if (d.kind === 'player') return game.viewFor(d.playerId);
  if (d.kind === 'tv') return game.tvView();
  return null;
}

function broadcast() {
  for (const socket of io.sockets.sockets.values()) {
    const view = viewFor(socket);
    if (view) socket.emit('state', view);
    else if (socket.data.kind === 'player') {
      // The Warden removed this player.
      socket.data = { kind: 'guest' };
      socket.emit('kicked');
    }
  }
}

// Runs a mutation, persists, pushes fresh state to everyone, and acks the caller.
function run(ack, fn) {
  const reply = typeof ack === 'function' ? ack : () => {};
  try {
    const result = fn();
    save();
    broadcast();
    reply({ ok: true, result: result ?? null });
  } catch (err) {
    if (!(err instanceof GameError)) console.error(err);
    reply({ ok: false, error: err instanceof GameError ? err.message : 'Something went wrong in the server room.' });
  }
}

const PLAYER_ACTIONS = {
  buy: (pid, a) => {
    const o = game.buy(pid, a);
    return { status: o.status, hasSnitch: o.hasSnitch };
  },
  respond: (pid, a) => {
    game.respondPunishment(pid, a);
  },
  immunity: (pid, a) => game.useImmunity(pid, a),
  night: (pid, a) => game.nightPick(pid, a),
  vote: (pid, a) => game.castVote(pid, a),
  drank: (pid) => game.drank(pid),
};

const ADMIN_ACTIONS = [
  'updateSettings', 'announce', 'clearAnnouncement',
  'addTeam', 'seedTeams', 'updateTeam', 'removeTeam', 'adjustBudget', 'setInventory',
  'buildBlocks', 'updatePlayer', 'removePlayer',
  'sendToSolitary', 'releaseSolitary', 'tickRound', 'adjustDrinks',
  'addGame', 'updateGame', 'setGameStatus', 'moveGame', 'finishGame', 'removeGame',
  'addItem', 'updateItem', 'removeItem', 'resolveOrder',
  'dealSnitches', 'resetMafia', 'startNight', 'endNight', 'openVote', 'closeVote', 'revealSnitches',
];

io.on('connection', (socket) => {
  socket.data = { kind: 'guest' };

  socket.on('hello', ({ token, adminToken, tv } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (tv) {
      socket.data = { kind: 'tv' };
      socket.emit('state', game.tvView());
      return reply({ ok: true, kind: 'tv' });
    }
    if (game.isAdminToken(adminToken)) {
      socket.data = { kind: 'admin' };
      socket.emit('state', game.adminView());
      return reply({ ok: true, kind: 'admin' });
    }
    const p = game.playerByToken(token);
    if (p) {
      socket.data = { kind: 'player', playerId: p.id };
      socket.emit('state', game.viewFor(p.id));
      return reply({ ok: true, kind: 'player' });
    }
    reply({ ok: true, kind: 'guest', partyName: game.s.settings.partyName, tagline: game.s.settings.tagline });
  });

  socket.on('join', ({ name } = {}, ack) => {
    run(ack, () => {
      const p = game.join(name);
      socket.data = { kind: 'player', playerId: p.id };
      return { token: p.token };
    });
  });

  socket.on('admin:login', ({ pin } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (String(pin || '') !== ADMIN_PIN) return reply({ ok: false, error: 'Wrong PIN. The Warden has been notified. 👀' });
    const adminToken = game.newAdminToken();
    socket.data = { kind: 'admin' };
    save();
    socket.emit('state', game.adminView());
    reply({ ok: true, result: { adminToken } });
  });

  socket.on('act', ({ type, ...args } = {}, ack) => {
    if (socket.data.kind !== 'player' || !game.player(socket.data.playerId)) {
      return typeof ack === 'function' && ack({ ok: false, error: 'You are not booked in. Refresh and join again.' });
    }
    const fn = PLAYER_ACTIONS[type];
    if (!fn) return typeof ack === 'function' && ack({ ok: false, error: 'Unknown action.' });
    run(ack, () => fn(socket.data.playerId, args));
  });

  socket.on('admin', ({ type, ...args } = {}, ack) => {
    if (socket.data.kind !== 'admin') return typeof ack === 'function' && ack({ ok: false, error: 'Warden access only.' });
    if (!ADMIN_ACTIONS.includes(type)) return typeof ack === 'function' && ack({ ok: false, error: 'Unknown action.' });
    run(ack, () => game[type](args));
  });

  socket.on('logout', () => {
    socket.data = { kind: 'guest' };
  });
});

server.listen(PORT, () => {
  console.log(`🔒 ${game.s.settings.partyName} is open on http://localhost:${PORT}`);
  console.log(`   Warden console: http://localhost:${PORT}/warden  (PIN ${process.env.ADMIN_PIN ? 'from ADMIN_PIN' : '1234 — set ADMIN_PIN to change'})`);
  console.log(`   TV / projector: http://localhost:${PORT}/tv`);
});
