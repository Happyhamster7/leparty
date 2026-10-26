const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game, GameError } = require('./lib/game');

const PORT = Number(process.env.PORT) || 3000;
const PINS = {
  warden: String(process.env.WARDEN_PIN || process.env.ADMIN_PIN || '1234'),
  officer: String(process.env.OFFICER_PIN || '5678'),
};
if (PINS.warden === PINS.officer) {
  console.error('WARDEN_PIN and OFFICER_PIN must be different.');
  process.exit(1);
}
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
app.get(['/tv', '/warden', '/officer'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/qr.svg', async (req, res) => {
  const url = String(req.query.url || `${req.protocol}://${req.get('host')}/`).slice(0, 300);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});
app.get('/healthz', (req, res) => res.json({ ok: true, players: game.s.players.length }));

// ---------- realtime ----------
function viewFor(socket) {
  const d = socket.data;
  if (d.kind === 'host') return game.adminView(d.role);
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
  task: (pid, a) => game.reportTask(pid, a),
  reroll: (pid) => game.rerollTask(pid),
  dealDrink: (pid, a) => game.dealDrink(pid, a),
};

// Everything a host can do. Both hosts have the same powers; their role only shows up in the feed.
const HOST_ACTIONS = [
  'updateSettings', 'announce', 'clearAnnouncement',
  'addTeam', 'seedTeams', 'updateTeam', 'removeTeam', 'adjustBudget', 'setInventory',
  'buildBlocks', 'updatePlayer', 'removePlayer',
  'sendToSolitary', 'releaseSolitary', 'tickRound', 'adjustDrinks',
  'addGame', 'updateGame', 'setGameStatus', 'moveGame', 'finishGame', 'removeGame',
  'addItem', 'updateItem', 'removeItem', 'resolveOrder',
  'dealSnitches', 'resetMafia', 'startNight', 'endNight', 'openVote', 'closeVote', 'revealSnitches',
  'dealTasks', 'approveTask', 'rejectTask', 'revokeTask',
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
    const role = game.hostRole(adminToken);
    if (role) {
      socket.data = { kind: 'host', role };
      socket.emit('state', game.adminView(role));
      return reply({ ok: true, kind: 'admin', role });
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
    const role = Object.keys(PINS).find((r) => PINS[r] === String(pin || ''));
    if (!role) return reply({ ok: false, error: 'Wrong PIN. The Warden has been notified. 👀' });
    const adminToken = game.newHostToken(role);
    socket.data = { kind: 'host', role };
    save();
    socket.emit('state', game.adminView(role));
    reply({ ok: true, result: { adminToken, role } });
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
    const reply = typeof ack === 'function' ? ack : () => {};
    const { kind, role } = socket.data;
    if (kind !== 'host') return reply({ ok: false, error: 'Hosts only.' });
    if (!HOST_ACTIONS.includes(type)) return reply({ ok: false, error: 'Unknown action.' });
    // `by` always comes from the logged-in host, never from the request.
    run(ack, () => game[type]({ ...args, by: role }));
  });

  socket.on('logout', () => {
    socket.data = { kind: 'guest' };
  });
});

server.listen(PORT, () => {
  console.log(`🔒 ${game.s.settings.partyName} is open on http://localhost:${PORT}`);
  console.log(`   Warden:             http://localhost:${PORT}/warden   (PIN ${process.env.WARDEN_PIN || process.env.ADMIN_PIN ? 'from WARDEN_PIN' : '1234 — set WARDEN_PIN to change'})`);
  console.log(`   Commissary Officer: http://localhost:${PORT}/officer  (PIN ${process.env.OFFICER_PIN ? 'from OFFICER_PIN' : '5678 — set OFFICER_PIN to change'})`);
  console.log(`   TV / projector: http://localhost:${PORT}/tv`);
});
