// Transport-agnostic API: the same handlers back the Vercel functions in api/ and the local server.
// Clients poll getState() and send every change through action().
const { Game, GameError } = require('./game');

function pinsFrom(env = process.env) {
  return {
    warden: String(env.WARDEN_PIN || env.ADMIN_PIN || '1234'),
    officer: String(env.OFFICER_PIN || '5678'),
  };
}

function createApi({ store, pins = pinsFrom() }) {
  // Load the state, creating and saving a fresh game the very first time.
  async function load() {
    for (;;) {
      const { state, version } = await store.load();
      if (state) return { game: new Game(state), version };
      const game = new Game();
      const v = await store.save(game.s, version);
      if (v !== null) return { game, version: v };
    }
  }

  // What a given set of credentials gets to see.
  function viewOf(game, { player, host, tv }) {
    if (tv) return { kind: 'tv', view: game.tvView() };
    const role = game.hostRole(host);
    if (role) return { kind: 'admin', role, view: game.adminView(role) };
    const p = game.playerByToken(player);
    if (p) return { kind: 'player', view: game.viewFor(p.id) };
    const s = game.s.settings;
    return { kind: 'guest', kicked: !!player, partyName: s.partyName, tagline: s.tagline, act: game.act.id };
  }

  async function getState(creds, since) {
    if (since !== undefined && since !== null && since !== '') {
      const v = await store.version();
      if (String(v) === String(since)) return { same: true, version: v };
    }
    const { game, version } = await load();
    return { version, ...viewOf(game, creds) };
  }

  // Runs one mutation with optimistic concurrency: reload and retry if someone else saved first.
  // A whole room voting at once collides a lot, so back off with jitter between tries.
  async function mutate(fn) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const { game, version } = await load();
      const result = fn(game);
      const v = await store.save(game.s, version);
      if (v !== null) return { game, version: v, result };
      await new Promise((r) => setTimeout(r, Math.random() * Math.min(250, 15 * (attempt + 1))));
    }
    throw new GameError('The yard is busy. Try again.');
  }

  const PLAYER_ACTIONS = {
    buy: (g, pid, a) => {
      const o = g.buy(pid, a);
      return { status: o.status, hasSnitch: o.hasSnitch, warp: o.warp, warps: o.warps };
    },
    respond: (g, pid, a) => {
      g.respondPunishment(pid, a);
    },
    immunity: (g, pid, a) => g.useImmunity(pid, a),
    night: (g, pid, a) => g.nightPick(pid, a),
    vote: (g, pid, a) => g.castVote(pid, a),
    drank: (g, pid) => g.drank(pid),
    task: (g, pid, a) => g.reportTask(pid, a),
    reroll: (g, pid) => g.rerollTask(pid),
    dealDrink: (g, pid, a) => g.dealDrink(pid, a),
    second: (g, pid, a) => {
      const o = g.secondRequest(pid, a);
      return { status: o.status, hasSnitch: o.hasSnitch };
    },
    approve: (g, pid, a) => {
      const o = g.approveRequest(pid, a);
      return { status: o.status, hasSnitch: o.hasSnitch };
    },
    drop: (g, pid, a) => g.dropRequest(pid, a),
    rename: (g, pid, a) => g.renameBlock(pid, a),
    sentenceDone: (g, pid, a) => g.completeSentence(pid, a),
    augment: (g, pid, a) => g.pickAugment(pid, a),
  };

  // Everything a host can do. Both hosts have the same powers; their role only shows up in the feed.
  const HOST_ACTIONS = new Set([
    'updateSettings', 'announce', 'clearAnnouncement', 'setAct',
    'addTeam', 'seedTeams', 'updateTeam', 'removeTeam', 'adjustBudget', 'setInventory',
    'buildBlocks', 'updatePlayer', 'removePlayer', 'removePlayers', 'freshStart',
    'sendToSolitary', 'releaseSolitary', 'tickRound', 'adjustDrinks', 'assignPunishment', 'clearSentence',
    'addGame', 'updateGame', 'setGameStatus', 'moveGame', 'finishGame', 'removeGame',
    'makeHeats', 'addHeat', 'removeHeat', 'clearHeats', 'startHeat', 'finishHeat',
    'addItem', 'updateItem', 'removeItem', 'resolveOrder',
    'dealSnitches', 'resetMafia', 'startNight', 'endNight', 'openVote', 'closeVote', 'revealSnitches',
    'dealTasks', 'approveTask', 'rejectTask', 'revokeTask',
  ]);

  // body: { kind: 'join' | 'login' | 'act' | 'admin', type?, args?, name?, pin? }
  async function action(body = {}, creds = {}) {
    try {
      const { kind, type, args = {} } = body;
      let next = { ...creds };
      let fn;
      if (kind === 'join') {
        fn = (g) => {
          const p = g.join(body.name);
          next = { player: p.token };
          return { token: p.token };
        };
      } else if (kind === 'login') {
        const role = Object.keys(pins).find((r) => pins[r] === String(body.pin || ''));
        if (!role) return { ok: false, error: 'Wrong PIN. The Warden has been notified. 👀' };
        fn = (g) => {
          const adminToken = g.newHostToken(role);
          next = { host: adminToken };
          return { adminToken, role };
        };
      } else if (kind === 'act') {
        const run = PLAYER_ACTIONS[type];
        if (!run) return { ok: false, error: 'Unknown action.' };
        fn = (g) => {
          const p = g.playerByToken(creds.player);
          if (!p) throw new GameError('You are not booked in. Refresh and join again.');
          return run(g, p.id, args);
        };
      } else if (kind === 'admin') {
        if (!HOST_ACTIONS.has(type)) return { ok: false, error: 'Unknown action.' };
        fn = (g) => {
          const role = g.hostRole(creds.host);
          if (!role) throw new GameError('Hosts only.');
          // `by` always comes from the logged-in host, never from the request.
          return g[type]({ ...args, by: role });
        };
      } else {
        return { ok: false, error: 'Unknown request.' };
      }
      const { game, version, result } = await mutate(fn);
      return { ok: true, result: result ?? null, version, ...viewOf(game, next) };
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.message };
      console.error(err);
      return { ok: false, error: 'Something went wrong in the server room.' };
    }
  }

  return { getState, action };
}

// Credentials ride in headers so they never end up in URLs or logs.
function credsFrom(req) {
  return {
    player: req.headers['x-player-token'] || null,
    host: req.headers['x-host-token'] || null,
    tv: req.query?.tv === '1',
  };
}

module.exports = { createApi, credsFrom, pinsFrom };
