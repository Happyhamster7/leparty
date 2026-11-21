import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessions } from './sessions';
import { memoryStore } from './memoryStore';
import { seededRng } from './rng';
import { sss } from '../../modules/sss/index';
import type { Roster } from '../../modules/types';
import type { State } from '../../modules/sss/engine/types';

function party() {
  const roster: Roster = { groups: [], members: [] };
  for (const g of ['A', 'B', 'C']) {
    roster.groups.push({ id: g, name: `Team ${g}`, colour: '#000000' });
    for (const m of [1, 2, 3]) roster.members.push({ id: `${g}${m}`, name: `${g} ${m}`, groupId: g, away: false });
  }
  const clock = { now: 5_000_000 };
  let seed = 1;
  const store = memoryStore();
  const sessions = createSessions({ store, roster: async () => roster, now: () => clock.now, seed: () => seed++ });
  return { roster, clock, store, sessions };
}

const HOST = { role: 'host' } as const;
const state = async (p: ReturnType<typeof party>, id: string) => (await p.store.load(id))!.state as State;
const gameId = (s: State, name: string) => s.games.find((g) => g.name === name)!.id;

test('starting a game makes one active session for the party; a second is refused', async () => {
  const p = party();
  const s = await p.sessions.start('event-1', 'sss');
  assert.deepEqual([s.moduleKey, s.status, s.version], ['sss', 'active', 0]);
  assert.equal((await p.store.activeForEvent('event-1'))!.id, s.id);
  await assert.rejects(p.sessions.start('event-1', 'sss'));
  await assert.rejects(p.sessions.start('event-2', 'no-such-game'));
});

test('an action is applied, saved and logged with the clock and dice it was given', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const out = await p.sessions.dispatch(s.id, HOST, { type: 'adjustMoney', args: { teamId: 'A', amount: 10 }, id: 'tap-1' });
  assert.deepEqual(out, { ok: true, version: 1, result: null, duplicate: false });
  const [logged] = p.store.actions(s.id);
  assert.deepEqual([logged.clientActionId, logged.actor.role, logged.type, logged.version, logged.atMs], ['tap-1', 'host', 'adjustMoney', 1, 5_000_000]);
  assert.equal(typeof logged.seed, 'number');
});

test('the same tap twice is applied once, and the second gets the first one’s answer', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const tap = { type: 'adjustMoney', args: { teamId: 'A', amount: 10 }, id: 'tap-1' };
  const first = await p.sessions.dispatch(s.id, HOST, tap);
  const second = await p.sessions.dispatch(s.id, HOST, tap);
  assert.deepEqual(second, { ...first, duplicate: true });
  assert.equal(p.store.actions(s.id).length, 1);
  assert.equal(sss.view(await state(p, s.id), p.roster, 0, HOST) !== null, true);
  const money = (await state(p, s.id)).ledger.filter((e) => e.teamId === 'A' && e.kind === 'money').reduce((n, e) => n + e.delta, 0);
  assert.equal(money, 42, '32 to start plus 10, once');
});

test('a double tap that arrives at the same moment is still applied once', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const tap = { type: 'adjustMoney', args: { teamId: 'A', amount: 10 }, id: 'tap-1' };
  const both = await Promise.all([p.sessions.dispatch(s.id, HOST, tap), p.sessions.dispatch(s.id, HOST, tap)]);
  assert.ok(both.every((r) => r.ok));
  assert.deepEqual(both.map((r) => r.ok && r.duplicate).sort(), [false, true]);
  assert.equal(p.store.actions(s.id).length, 1);
  assert.equal((await p.store.head(s.id))!.version, 1);
});

test('many different writers at once all land: a stale save is retried on the fresh state', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const taps = Array.from({ length: 25 }, (_, i) => p.sessions.dispatch(s.id, HOST, { type: 'adjustMoney', args: { teamId: 'B', amount: 1 }, id: `tap-${i}` }));
  const results = await Promise.all(taps);
  assert.ok(results.every((r) => r.ok), JSON.stringify(results.find((r) => !r.ok)));
  assert.equal((await p.store.head(s.id))!.version, 25);
  assert.ok(p.store.applies > 25, 'some saves were refused and retried');
  const money = (await state(p, s.id)).ledger.filter((e) => e.teamId === 'B' && e.kind === 'money').reduce((n, e) => n + e.delta, 0);
  assert.equal(money, 32 + 25);
});

test('a rule saying no comes back as its code, and nothing is saved or logged', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  assert.deepEqual(await p.sessions.dispatch(s.id, HOST, { type: 'toResults', id: 't1' }), { ok: false, code: 'round.none', params: {} });
  assert.deepEqual(await p.sessions.dispatch(s.id, { role: 'bar' }, { type: 'startRound', id: 't2' }), { ok: false, code: 'action.forbidden', params: {} });
  assert.deepEqual(await p.sessions.dispatch(s.id, { role: 'team', teamId: 'A' }, { type: 'adjustPoints', args: { teamId: 'A', amount: 99 }, id: 't3' }), { ok: false, code: 'action.forbidden', params: {} });
  assert.equal((await p.store.head(s.id))!.version, 0);
  assert.equal(p.store.actions(s.id).length, 0);
});

test('reading with the version you already have costs one small read and returns nothing new', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const full = await p.sessions.read(s.id, { role: 'display' });
  assert.ok(full.found && !full.same && full.version === 0 && full.roster.groups.length === 3);
  assert.deepEqual(await p.sessions.read(s.id, { role: 'display' }, 0), { found: true, same: true, version: 0 });
  await p.sessions.dispatch(s.id, HOST, { type: 'adjustMoney', args: { teamId: 'A', amount: 1 }, id: 't' });
  const next = await p.sessions.read(s.id, { role: 'display' }, 0);
  assert.ok(next.found && !next.same && next.version === 1);
  assert.deepEqual(await p.sessions.read('nope', { role: 'display' }), { found: false });
});

test('each viewer gets its own view: the host sees answers, a team and the TV don’t, the bar sees what to pour', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const st = await state(p, s.id);
  await p.sessions.dispatch(s.id, HOST, { type: 'updateGame', args: { gameId: gameId(st, 'Trivia'), questions: 'Secret question? | Yes | No | A' } });
  await p.sessions.dispatch(s.id, HOST, { type: 'startRound', args: { gameId: gameId(st, 'Flip cup') } });
  await p.sessions.dispatch(s.id, HOST, { type: 'toResults' });
  await p.sessions.dispatch(s.id, HOST, { type: 'enterResults', args: { placings: { A: 1, B: 2, C: 3 } } });
  await p.sessions.dispatch(s.id, { role: 'team', teamId: 'A' }, { type: 'buy', args: { itemId: 'spirit', targetTeamId: 'B', qty: 2 }, id: 'buy-1' });
  await p.sessions.dispatch(s.id, HOST, { type: 'startDrinks' });
  const text = async (viewer: Parameters<typeof p.sessions.read>[1]) => {
    const r = await p.sessions.read(s.id, viewer);
    assert.ok(r.found && !r.same);
    return JSON.stringify(r.view);
  };
  assert.ok((await text(HOST)).includes('Secret question'));
  for (const viewer of [{ role: 'display' }, { role: 'bar' }, { role: 'team', teamId: 'B' }] as const) assert.ok(!(await text(viewer)).includes('Secret question'), viewer.role);
  assert.ok((await text({ role: 'bar' })).includes('"breakdown"'));
  assert.ok(!(await text({ role: 'display' })).includes('"breakdown"'));
  assert.ok(!(await text({ role: 'team', teamId: 'B' })).includes('"breakdown"'));
});

test('any screen polling moves the clock: a passed deadline is settled on read, once', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  await p.sessions.dispatch(s.id, HOST, { type: 'startRound', args: { gameId: gameId(await state(p, s.id), 'Basketball') } });
  const due = (await p.store.head(s.id))!.nextDeadlineAt;
  assert.equal(due, 5_000_000 + 60_000, 'the pick deadline is on the row, so a poll can see it without the document');
  assert.deepEqual(await p.sessions.read(s.id, { role: 'display' }, 1), { found: true, same: true, version: 1 });

  p.clock.now += 61_000;
  const [a, b] = await Promise.all([p.sessions.read(s.id, { role: 'display' }, 1), p.sessions.read(s.id, { role: 'team', teamId: 'A' }, 1)]);
  assert.ok(a.found && !a.same && a.version === 2 && b.found && b.version === 2);
  assert.ok((await state(p, s.id)).rounds[0].revealedAt, 'the picks were made for them');
  assert.deepEqual(p.store.actions(s.id).map((x) => [x.type, x.actor.role]), [['startRound', 'host'], ['tick', 'system']]);
  assert.equal((await p.store.head(s.id))!.nextDeadlineAt, null);
});

test('a finished game takes no more actions, and frees the party for the next one', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  await p.store.archive(s.id);
  assert.deepEqual(await p.sessions.dispatch(s.id, HOST, { type: 'adjustMoney', args: { teamId: 'A', amount: 1 } }), { ok: false, code: 'session.gone', params: {} });
  const next = await p.sessions.start('e', 'sss');
  assert.notEqual(next.id, s.id);
  const old = await p.sessions.read(s.id, HOST);
  assert.ok(old.found && !old.same, 'an archived game can still be read');
});

test('a night can be replayed from its log: the same actions, clock and dice give the same state', async () => {
  const p = party();
  const s = await p.sessions.start('e', 'sss');
  const first = structuredClone(await state(p, s.id));
  const g = gameId(first, 'Cold War drinking');
  const team = (teamId: string) => ({ role: 'team', teamId }) as const;
  await p.sessions.dispatch(s.id, HOST, { type: 'updateSettings', args: { actsCount: 2, roundsPerAct: 1 } });
  await p.sessions.dispatch(s.id, HOST, { type: 'startRound', args: { gameId: gameId(first, 'Flip cup') } });
  await p.sessions.dispatch(s.id, HOST, { type: 'toResults' });
  await p.sessions.dispatch(s.id, HOST, { type: 'enterResults', args: { placings: { A: 1, B: 2, C: 3 } } });
  p.clock.now += 91_000; // the shop clock runs out
  await p.sessions.read(s.id, { role: 'display' });
  p.clock.now += 1000;
  await p.sessions.dispatch(s.id, HOST, { type: 'startRound', args: { gameId: g } });
  await p.sessions.dispatch(s.id, team('A'), { type: 'answer', args: { value: 4 } });
  await p.sessions.dispatch(s.id, team('B'), { type: 'answer', args: { value: 9 } });
  await p.sessions.dispatch(s.id, team('C'), { type: 'answer', args: { value: 2 } });
  await p.sessions.dispatch(s.id, HOST, { type: 'playFinish' });
  await p.sessions.dispatch(s.id, HOST, { type: 'enterResults', args: { placings: { B: 1, A: 2, C: 3 } } });
  await p.sessions.dispatch(s.id, team('A'), { type: 'buy', args: { itemId: 'mystery-box' } }); // rolls dice
  await p.sessions.dispatch(s.id, HOST, { type: 'startDrinks' }); // shuffles the queue

  let replay: unknown = first;
  for (const a of p.store.actions(s.id)) {
    const ctx = { now: a.atMs, rng: seededRng(a.seed), roster: p.roster };
    replay = a.type === 'tick' ? sss.tick(replay, ctx) : sss.reduce(replay, { type: a.type, args: a.args }, { ...ctx, actor: a.actor }).state;
  }
  assert.deepEqual(replay, await state(p, s.id));
  assert.ok(p.store.actions(s.id).some((a) => a.type === 'tick'));
});

test('seeded dice repeat exactly and stay in range', () => {
  const a = seededRng(42);
  const b = seededRng(42);
  const rolls = Array.from({ length: 200 }, () => a());
  assert.deepEqual(rolls, Array.from({ length: 200 }, () => b()));
  assert.ok(rolls.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(rolls.slice(0, 5), Array.from({ length: 5 }, seededRng(43)));
});
