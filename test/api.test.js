const test = require('node:test');
// These suites cover guests booking in on their own phones; team-phone tests switch the mode themselves.
process.env.PHONE_MODE = 'guest';
const assert = require('node:assert/strict');
const { createApi } = require('../lib/api');
const { FileStore, RedisStore } = require('../lib/store');

const pins = { warden: '1111', officer: '2222' };
const tick = () => new Promise((r) => setImmediate(r));

// A store that yields between load and save, so parallel requests really race.
function racyStore() {
  const inner = new FileStore({ file: null });
  return {
    version: () => inner.version(),
    load: async () => {
      const r = await inner.load();
      await tick();
      return r;
    },
    save: async (s, v) => {
      await tick();
      return inner.save(s, v);
    },
  };
}

test('guest → join → player view; polling with the current version says nothing changed', async () => {
  const api = createApi({ store: new FileStore({ file: null }), pins });
  const g = await api.getState({});
  assert.equal(g.kind, 'guest');
  const j = await api.action({ kind: 'join', name: 'Shen' }, {});
  assert.equal(j.ok, true);
  assert.equal(j.kind, 'player');
  assert.equal(j.view.me.name, 'Shen');
  const same = await api.getState({ player: j.result.token }, j.version);
  assert.deepEqual(same, { same: true, version: j.version });
  const fresh = await api.getState({ player: j.result.token }, j.version - 1);
  assert.equal(fresh.view.me.name, 'Shen');
});

test('host login by PIN picks the role; wrong PIN and non-hosts are refused', async () => {
  const api = createApi({ store: new FileStore({ file: null }), pins });
  assert.equal((await api.action({ kind: 'login', pin: '0000' })).ok, false);
  const o = await api.action({ kind: 'login', pin: '2222' });
  assert.equal(o.result.role, 'officer');
  assert.equal(o.kind, 'admin');
  const host = o.result.adminToken;
  const seeded = await api.action({ kind: 'admin', type: 'seedTeams', args: { count: 2 } }, { host });
  assert.equal(seeded.view.teams.length, 2);
  const paid = await api.action({ kind: 'admin', type: 'adjustBudget', args: { teamId: seeded.view.teams[0].id, amount: 5, by: 'warden' } }, { host });
  assert.match(paid.view.feed[0].text, /^The Commissary Officer paid/, 'by comes from the session, not the request');
  const p = await api.action({ kind: 'join', name: 'Mia' }, {});
  const sneaky = await api.action({ kind: 'admin', type: 'seedTeams', args: { count: 1 } }, { player: p.result.token });
  assert.equal(sneaky.ok, false);
  assert.equal((await api.action({ kind: 'admin', type: 'constructor' }, { host })).ok, false);
});

test('a removed player is told they were kicked', async () => {
  const api = createApi({ store: new FileStore({ file: null }), pins });
  const host = (await api.action({ kind: 'login', pin: '1111' })).result.adminToken;
  const p = await api.action({ kind: 'join', name: 'Dev' }, {});
  await api.action({ kind: 'admin', type: 'removePlayer', args: { playerId: p.view.me.id } }, { host });
  const s = await api.getState({ player: p.result.token });
  assert.equal(s.kind, 'guest');
  assert.equal(s.kicked, true);
});

test('parallel writes all land thanks to compare-and-set retries', async () => {
  const api = createApi({ store: racyStore(), pins });
  const names = Array.from({ length: 40 }, (_, i) => `P${i}`);
  const results = await Promise.all(names.map((name) => api.action({ kind: 'join', name }, {})));
  assert.ok(results.every((r) => r.ok), JSON.stringify(results.find((r) => !r.ok)));
  const host = (await api.action({ kind: 'login', pin: '1111' })).result.adminToken;
  const s = await api.getState({ host });
  assert.equal(s.view.players.length, 40);
});

test('game errors come back as messages and do not save', async () => {
  const api = createApi({ store: new FileStore({ file: null }), pins });
  const p = await api.action({ kind: 'join', name: 'Kat' }, {});
  const r = await api.action({ kind: 'act', type: 'buy', args: { itemId: p.view.items[0].id } }, { player: p.result.token });
  assert.equal(r.ok, false);
  assert.match(r.error, /Holding Cell/);
  assert.equal((await api.getState({}, p.version)).same, true);
});

test('RedisStore speaks the Upstash REST protocol with an atomic compare-and-set', async () => {
  const db = {};
  const calls = [];
  global.fetch = async (url, { body, headers }) => {
    assert.equal(headers.Authorization, 'Bearer tok');
    const cmd = JSON.parse(body);
    calls.push(url);
    const run = ([op, ...a]) => {
      if (op === 'GET') return { result: db[a[0]] ?? null };
      if (op === 'EVAL') {
        const [, , vKey, sKey, expected, next, state] = a;
        if ((db[vKey] ?? '0') !== expected) return { result: 0 };
        db[sKey] = state;
        db[vKey] = next;
        return { result: 1 };
      }
      throw new Error(op);
    };
    const out = url.endsWith('/pipeline') ? cmd.map(run) : run(cmd);
    return { ok: true, json: async () => out };
  };
  try {
    const store = new RedisStore({ url: 'https://example.upstash.io/', token: 'tok', key: 't' });
    assert.deepEqual(await store.load(), { version: 0, state: null });
    assert.equal(await store.save({ a: 1 }, 0), 1);
    assert.equal(await store.save({ a: 2 }, 0), null, 'stale version is refused');
    assert.deepEqual(await store.load(), { version: 1, state: { a: 1 } });
    assert.equal(await store.version(), 1);
    assert.ok(calls.includes('https://example.upstash.io/pipeline'));
  } finally {
    delete global.fetch;
  }
});

test('Shot Cam upload stores the video, adds the clip, and cleans up after removals', async () => {
  const saved = new Map();
  const files = {
    save: async (body, type) => {
      const url = `/clips/${saved.size}.${type.includes('webm') ? 'webm' : 'mp4'}`;
      saved.set(url, body);
      return url;
    },
    remove: async (url) => saved.delete(url),
  };
  const api = createApi({ store: new FileStore({ file: null }), pins, files });
  const host = (await api.action({ kind: 'login', pin: '1111' }, {})).result.adminToken;
  const tokens = [];
  for (const n of ['A', 'B', 'C', 'D']) tokens.push((await api.action({ kind: 'join', name: n }, {})).result.token);
  const lonely = (await api.action({ kind: 'join', name: 'Late' }, {})).result.token;
  await api.action({ kind: 'admin', type: 'buildBlocks' }, { host });
  const late = (await api.getState({ host })).view.players.find((p) => p.name === 'Late');
  await api.action({ kind: 'admin', type: 'updatePlayer', args: { playerId: late.id, teamId: '' } }, { host });

  const bad = await api.uploadClip({ player: tokens[0] }, { body: Buffer.from('x'), type: 'image/png' });
  assert.equal(bad.ok, false);
  const notOnBlock = await api.uploadClip({ player: lonely }, { body: Buffer.from('x'), type: 'video/mp4' });
  assert.equal(notOnBlock.ok, false);
  assert.equal(saved.size, 0, 'refused uploads never store a file');

  const ok = await api.uploadClip({ player: tokens[0] }, { body: Buffer.from('video'), type: 'video/webm', caption: 'Cheers' });
  assert.equal(ok.ok, true);
  assert.equal(saved.size, 1);
  const tv = await api.getState({ tv: true });
  assert.equal(tv.view.clips[0].caption, 'Cheers');

  await api.action({ kind: 'admin', type: 'reviewClip', args: { clipId: ok.result.clipId, action: 'remove' } }, { host });
  await new Promise((r) => setImmediate(r));
  assert.equal(saved.size, 0, 'removing a clip deletes its file');
});

test('Shot Cam direct uploads: pre-check, Blob-only URLs, and a clear message when storage is missing', async () => {
  const blob = { mode: 'blob', owns: (u) => /^https:\/\/s\.public\.blob\.vercel-storage\.com\/clips\//.test(u), save: async () => '', remove: async () => {} };
  const api = createApi({ store: new FileStore({ file: null }), pins, files: blob });
  const host = (await api.action({ kind: 'login', pin: '1111' }, {})).result.adminToken;
  const tokens = [];
  for (const n of ['A', 'B', 'C', 'D']) tokens.push((await api.action({ kind: 'join', name: n }, {})).result.token);
  const req = (player) => ({ headers: { 'x-player-token': player }, query: {} });
  assert.equal((await api.clipToken(req(tokens[0]), { type: 'check' })).ok, false, 'not on a block yet');
  await api.action({ kind: 'admin', type: 'buildBlocks' }, { host });
  assert.deepEqual(await api.clipToken(req(tokens[0]), { type: 'check' }), { ok: true, uploads: 'blob' });
  assert.match((await api.clipToken(req('nope'), { type: 'check' })).error, /not booked in/);
  const view = await api.getState({ player: tokens[0] });
  assert.equal(view.view.uploads, 'blob');
  const bad = await api.action({ kind: 'act', type: 'clip', args: { url: 'https://evil.example/x.mp4' } }, { player: tokens[0] });
  assert.equal(bad.ok, false);
  const good = await api.action({ kind: 'act', type: 'clip', args: { url: 'https://s.public.blob.vercel-storage.com/clips/x.mp4', type: 'video/mp4', caption: 'Hi' } }, { player: tokens[0] });
  assert.equal(good.ok, true);
  assert.equal(good.result.status, 'live');
  assert.equal('deleteFiles' in good.result, false);

  const off = createApi({ store: new FileStore({ file: null }), pins, files: { mode: 'off', owns: () => false, save: async () => {}, remove: async () => {} } });
  const t = (await off.action({ kind: 'join', name: 'Z' }, {})).result.token;
  assert.equal((await off.getState({ player: t })).view.uploads, 'off');
});

test('rounds over the API: players pick, the tick settles a passed deadline, and only hosts run the round', async () => {
  const api = createApi({ store: new FileStore({ file: null }), pins });
  const login = await api.action({ kind: 'login', pin: '1111' });
  const host = { host: login.result.adminToken };
  const admin = (type, args = {}) => api.action({ kind: 'admin', type, args }, host);
  const tokens = [];
  for (const n of ['Ann', 'Ben', 'Cat', 'Dan']) tokens.push((await api.action({ kind: 'join', name: n })).result.token);
  await admin('updateSettings', { maxBlockSize: 2 });
  await admin('buildBlocks');
  const game = (await admin('addGame', { name: 'Test relay', playersNeeded: 1 })).view.games.find((x) => x.name === 'Test relay');
  assert.equal((await api.action({ kind: 'act', type: 'startRound', args: { gameId: game.id } }, { player: tokens[0] })).ok, false);
  const started = await admin('startRound', { gameId: game.id });
  assert.equal(started.ok, true);
  assert.equal(started.view.round.phase, 'game');
  const me = await api.getState({ player: tokens[0] });
  const pick = await api.action({ kind: 'act', type: 'pick', args: { playerIds: [me.view.me.id] } }, { player: tokens[0] });
  assert.equal(pick.ok, true, pick.error);
  // Nothing due yet: the tick is a no-op.
  assert.deepEqual(await api.action({ kind: 'tick' }, {}), { ok: true, same: true });
  assert.equal((await api.getState({ tv: true })).view.round.revealedAt, null);
});

test('team phones over the API: claim by code, act as the block, and the old phone is told it moved', async () => {
  const api = createApi({ store: new FileStore({ file: null }), pins });
  const login = await api.action({ kind: 'login', pin: '1111' });
  const host = { host: login.result.adminToken };
  const admin = (type, args = {}) => api.action({ kind: 'admin', type, args }, host);
  await admin('updateSettings', { phoneMode: 'team' });
  assert.equal((await api.getState({})).phoneMode, 'team');
  assert.equal((await api.action({ kind: 'join', name: 'Shen' }, {})).ok, false);
  await admin('addGuests', { names: 'Shen\nEdwin\nJason\nMia' });
  await admin('updateSettings', { maxBlockSize: 2 });
  const built = await admin('buildBlocks');
  assert.equal(built.ok, true);
  const code = (await api.getState(host)).view.teams[0].joinCode;
  const one = await api.action({ kind: 'claim', code }, {});
  assert.equal(one.ok, true);
  assert.equal(one.kind, 'player');
  assert.ok(one.view.me.device);
  const two = await api.action({ kind: 'claim', code }, {});
  const kicked = await api.getState({ player: one.result.token });
  assert.equal(kicked.kind, 'guest');
  assert.equal(kicked.kicked, true);
  assert.equal((await api.getState({ player: two.result.token })).kind, 'player');
  assert.equal((await api.action({ kind: 'claim', code: 'ZZZZ' }, {})).ok, false);
});

test('LeParty sync over the API: hosts pick an event and sync; the TV picks up late check-ins on its own', async () => {
  const { createLeParty } = require('../lib/leparty');
  let roster = {
    event: { id: 'ev1', name: 'November lockup' },
    blocks: [{ id: 'b1', name: 'Cellblock A', colour: '#c9402f' }],
    guests: [{ id: 'p1', name: 'Shen', blockId: 'b1' }],
  };
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push([url, opts.headers.Authorization]);
    if (url.endsWith('/api/sss/events')) return { ok: true, status: 200, json: async () => ({ events: [{ id: 'ev1', name: 'November lockup' }] }) };
    return { ok: true, status: 200, json: async () => roster };
  };
  const leparty = createLeParty({ LEPARTY_URL: 'https://lp.example/', LEPARTY_SECRET: 's3cret' }, fakeFetch);
  const api = createApi({ store: new FileStore({ file: null }), pins, leparty });
  const host = { host: (await api.action({ kind: 'login', pin: '1111' })).result.adminToken };
  const admin = (type, args = {}) => api.action({ kind: 'admin', type, args }, host);
  assert.equal((await api.action({ kind: 'admin', type: 'syncLeParty' }, {})).ok, false); // hosts only
  const events = await admin('lepartyEvents');
  assert.deepEqual(events.result.events.map((e) => e.id), ['ev1']);
  assert.deepEqual(calls[0], ['https://lp.example/api/sss/events', 'Bearer s3cret']);
  assert.equal((await admin('syncLeParty')).ok, false); // no event picked yet
  await admin('updateSettings', { lepartyEventId: 'ev1' });
  const first = await admin('syncLeParty');
  assert.equal(first.ok, true, first.error);
  assert.equal(first.view.lepartyConfigured, true);
  assert.deepEqual(first.view.teams.map((t) => t.name), ['Cellblock A']);
  // A late check-in on LeParty shows up the next time the TV polls (once 30s have passed).
  roster = { ...roster, guests: [...roster.guests, { id: 'p2', name: 'Nora', blockId: 'b1' }] };
  const realNow = Date.now;
  Date.now = () => realNow() + 31000;
  try {
    const tv = await api.getState({ tv: true });
    assert.deepEqual(tv.view.players.map((p) => p.name).sort(), ['Nora', 'Shen']);
  } finally {
    Date.now = realNow;
  }
  // A wrong secret is reported clearly and remembered for the hosts.
  const bad = createLeParty({ LEPARTY_URL: 'https://lp.example', LEPARTY_SECRET: 'x' }, async () => ({ ok: false, status: 401, json: async () => ({}) }));
  const api2 = createApi({ store: new FileStore({ file: null }), pins, leparty: bad });
  const host2 = { host: (await api2.action({ kind: 'login', pin: '1111' })).result.adminToken };
  await api2.action({ kind: 'admin', type: 'updateSettings', args: { lepartyEventId: 'ev1' } }, host2);
  const r = await api2.action({ kind: 'admin', type: 'syncLeParty' }, host2);
  assert.match(r.error, /refused the secret/);
  assert.match((await api2.getState(host2)).view.leparty.error, /refused the secret/);
});
