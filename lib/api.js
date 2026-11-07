// Transport-agnostic API: the same handlers back the Vercel functions in api/ and the local server.
// Clients poll getState() and send every change through action().
const { Game, GameError } = require('./game');
const { createLeParty } = require('./leparty');

function pinsFrom(env = process.env) {
  return {
    warden: String(env.WARDEN_PIN || env.ADMIN_PIN || '1234'),
    officer: String(env.OFFICER_PIN || '5678'),
  };
}

function createApi({ store, pins = pinsFrom(), files = null, leparty = createLeParty() }) {
  // Removed clips take their video file with them; a failed delete only leaves an orphan file.
  const cleanUp = (result) => {
    const urls = result?.deleteFiles;
    if (files && urls?.length) Promise.allSettled(urls.map((u) => files.remove(u))).catch(() => {});
    if (result && 'deleteFiles' in result) delete result.deleteFiles;
  };

  // A night starts with the party's games in the library, so Setup's sequence has games to choose
  // from. Once only: a host who deletes them all doesn't get them back.
  // Returns true when it changed the state, which must then be saved straight away: the games get
  // fresh ids, so stocking on every load without saving would hand each page different ids.
  function stock(game) {
    if (game.s.starterGames) return false;
    if (!game.s.games.length) game.loadStarterGames();
    game.s.starterGames = true;
    return true;
  }

  // Load the state, creating (or stocking) and saving it the very first time.
  async function load() {
    for (;;) {
      const { state, version } = await store.load();
      const game = state ? new Game(state) : new Game();
      if (state && !stock(game)) return { game, version };
      if (!state) stock(game);
      const v = await store.save(game.s, version);
      if (v !== null) return { game, version: v };
    }
  }

  // What a given set of credentials gets to see.
  function viewOf(game, { player, host, tv }) {
    if (tv) return { kind: 'tv', view: { ...game.tvView(), uploads: files?.mode || 'off' } };
    const role = game.hostRole(host);
    if (role) return { kind: 'admin', role, view: { ...game.adminView(role), lepartyConfigured: leparty.configured, uploads: files?.mode || 'off' } };
    const p = game.playerByToken(player);
    if (p) return { kind: 'player', view: { ...game.viewFor(p.id), uploads: files?.mode || 'off' } };
    const s = game.s.settings;
    return { kind: 'guest', kicked: !!player, partyName: s.partyName, tagline: s.tagline, act: game.act.id, phoneMode: s.phoneMode };
  }

  // ---------- LeParty sync ----------
  // Pull the chosen event's blocks and checked-in guests and mirror them. Only saves when something changed.
  async function syncLeParty() {
    const { game } = await load();
    const eventId = game.s.settings.lepartyEventId;
    if (!eventId) throw new GameError('Pick the LeParty event first.');
    let data;
    try {
      data = await leparty.roster(eventId);
    } catch (err) {
      await mutate((g) => g.lepartyError({ message: err.message }));
      throw new GameError(err.message);
    }
    const preview = new Game(structuredClone(game.s)).applyRoster(data);
    if (!preview.changed && game.s.leparty.lastSync && !game.s.leparty.error) return { changed: false, changes: [] };
    const { result } = await mutate((g) => g.applyRoster(data));
    return result;
  }

  // While a host console or the TV is open, check LeParty for late check-ins about every 30 seconds.
  let lastAuto = 0;
  async function autoSync(creds) {
    if (!leparty.configured || !(creds.tv || creds.host) || Date.now() - lastAuto < 30000) return;
    lastAuto = Date.now();
    try {
      const { game } = await load();
      if (game.s.settings.lepartyEventId) await syncLeParty();
    } catch {}
  }

  async function getState(creds, since) {
    await autoSync(creds);
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
      game.tick(); // settle any deadline that passed before this change
      const result = fn(game);
      const v = await store.save(game.s, version);
      if (v !== null) return { game, version: v, result };
      await new Promise((r) => setTimeout(r, Math.random() * Math.min(250, 15 * (attempt + 1))));
    }
    throw new GameError('The yard is busy. Try again.');
  }

  const PLAYER_ACTIONS = {
    pick: (g, pid, a) => g.pickPlayers(pid, a),
    answer: (g, pid, a) => g.playAnswer(pid, a),
    buy: (g, pid, a) => {
      const o = g.buy(pid, a);
      return { status: o.status, warp: o.warp, warps: o.warps, mystery: o.mystery };
    },
    respond: (g, pid, a) => {
      g.respondPunishment(pid, a);
    },
    drank: (g, pid) => g.drank(pid),
    pickpocket: (g, pid, a) => g.pickpocket(pid, a),
    second: (g, pid, a) => {
      const o = g.secondRequest(pid, a);
      return { status: o.status };
    },
    approve: (g, pid, a) => {
      const o = g.approveRequest(pid, a);
      return { status: o.status };
    },
    drop: (g, pid, a) => g.dropRequest(pid, a),
    rename: (g, pid, a) => g.renameBlock(pid, a),
    sentenceDone: (g, pid, a) => g.completeSentence(pid, a),
    augment: (g, pid, a) => g.pickAugment(pid, a),
    commission: (g, pid, a) => g.completeCommission(pid, a),
    // A clip the phone already uploaded straight to Blob storage.
    clip: (g, pid, a) => {
      if (!files?.owns(a.url)) throw new GameError('That video didn’t come from Shot Cam.');
      const r = g.addClip(pid, a);
      return { clipId: r.clipId, status: r.status, deleteFiles: r.deleteFiles };
    },
  };

  // Everything a host can do. Both hosts have the same powers; their role only shows up in the feed.
  const HOST_ACTIONS = new Set([
    'updateSettings', 'announce', 'clearAnnouncement', 'setAct', 'playIntro', 'reviewClip',
    'addTeam', 'seedTeams', 'updateTeam', 'removeTeam', 'adjustBudget', 'adjustPoints', 'setInventory',
    'buildBlocks', 'updatePlayer', 'removePlayer', 'removePlayers', 'freshStart',
    'tickRound', 'adjustDrinks', 'assignPunishment', 'clearSentence',
    'addGame', 'updateGame', 'setGameStatus', 'moveGame', 'finishGame', 'removeGame',
    'makeHeats', 'addHeat', 'removeHeat', 'clearHeats', 'startHeat', 'finishHeat',
    'addItem', 'updateItem', 'removeItem', 'resolveOrder',
    'adjustPoints', 'startRound', 'revealPicks', 'toResults', 'enterResults', 'startDrinks', 'barNext', 'barBack', 'barDone',
    'assignDrinks', 'extendShop', 'crownWinner', 'clearWinner', 'reissueBlockCode', 'addGuests', 'playNext', 'playReveal', 'playFinish',
    'renameAct', 'setActMechanics', 'setSlot', 'reopenNight', 'loadStarterGames',
  ]);

  // body: { kind: 'join' | 'login' | 'act' | 'admin', type?, args?, name?, pin? }
  async function action(body = {}, creds = {}) {
    try {
      const { kind, type, args = {} } = body;
      let next = { ...creds };
      let fn;
      if (kind === 'claim') {
        // A block's phone: scan its card (token) or type its code. The latest device wins.
        fn = (g) => {
          const p = g.claimBlock({ token: body.token, code: body.code });
          next = { player: p.token };
          return { token: p.token };
        };
      } else if (kind === 'join') {
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
      } else if (kind === 'tick') {
        // Any screen can nudge the clock once a deadline passes; nothing is saved unless one did.
        const { game } = await load();
        const due = game.nextDeadline();
        if (!due || Date.now() < due) return { ok: true, same: true };
        fn = (g) => g.tick();
      } else if (kind === 'admin' && type === 'confirmNight') {
        // Lock the setup in, then pull the party's contestants from LeParty if one is chosen.
        const { game: g0 } = await load();
        if (!g0.hostRole(creds.host)) return { ok: false, error: 'Hosts only.' };
        await mutate((g) => g.confirmNight({ by: g.hostRole(creds.host) }));
        let synced = null;
        if (leparty.configured && g0.s.settings.lepartyEventId) {
          try {
            synced = await syncLeParty();
          } catch (err) {
            synced = { error: err.message };
          }
        }
        const after = await load();
        return { ok: true, result: { synced }, version: after.version, ...viewOf(after.game, creds) };
      } else if (kind === 'admin' && ['lepartyEvents', 'syncLeParty'].includes(type)) {
        // These talk to LeParty first, so they run outside the usual single mutation.
        const { game } = await load();
        if (!game.hostRole(creds.host)) return { ok: false, error: 'Hosts only.' };
        if (type === 'lepartyEvents') {
          try {
            return { ok: true, result: { events: await leparty.events() } };
          } catch (err) {
            return { ok: false, error: err.message };
          }
        }
        const result = await syncLeParty();
        const after = await load();
        return { ok: true, result, version: after.version, ...viewOf(after.game, creds) };
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
      cleanUp(result);
      return { ok: true, result: result ?? null, version, ...viewOf(game, next) };
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.message };
      console.error(err);
      return { ok: false, error: 'Something went wrong in the server room.' };
    }
  }

  // Shot Cam: check the player, store the video, then add it to the game (or delete it if that fails).
  async function uploadClip(creds, { body, type, caption }) {
    try {
      if (!files) throw new GameError('Video uploads aren’t set up on this server.');
      if (!/^video\//.test(type || '')) throw new GameError('That isn’t a video.');
      const { game } = await load();
      const p = game.playerByToken(creds.player);
      if (!p) throw new GameError('You are not booked in. Refresh and join again.');
      game.canClip(p.id);
      const url = await files.save(body, type);
      try {
        const { result } = await mutate((g) => g.addClip(p.id, { url, type, caption }));
        cleanUp(result);
        return { ok: true, result };
      } catch (err) {
        files.remove(url).catch(() => {});
        throw err;
      }
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.message };
      if (err.name === 'ConfigError') throw err;
      console.error(err);
      return { ok: false, error: 'The upload fell over. Try a shorter clip.' };
    }
  }

  // Shot Cam pre-check: may this player post a clip right now? Returns their id, or throws a GameError.
  async function authorizeClip(playerToken) {
    const { game } = await load();
    const p = game.playerByToken(playerToken);
    if (!p) throw new GameError('You are not booked in. Refresh and join again.');
    game.canClip(p.id);
    return p.id;
  }

  // POST /api/clip-token: { type: 'check' } answers whether you can post; Blob's own events get an upload token.
  async function clipToken(req, body) {
    try {
      if (body?.type === 'check') {
        await authorizeClip(credsFrom(req).player);
        return { ok: true, uploads: files?.mode || 'off' };
      }
      if (files?.mode !== 'blob') throw new GameError('Direct uploads are off on this server.');
      return await files.token(req, body, authorizeClip);
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.message };
      throw err;
    }
  }

  return { getState, action, uploadClip, clipToken };
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
