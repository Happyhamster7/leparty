const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, GameError } = require('../lib/game');

function setup(n = 6) {
  const g = new Game();
  g.seedTeams({ count: 2 });
  const [a, b] = g.s.teams;
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = g.join(`P${i}`);
    g.updatePlayer({ playerId: p.id, teamId: i % 2 ? b.id : a.id });
    players.push(p);
  }
  return { g, a, b, players };
}
const itemOf = (g, type, drain) => g.s.items.find((i) => i.type === type && (drain === undefined || i.drain === drain));

test('join rejects duplicate names and assigns inmate numbers', () => {
  const g = new Game();
  const p = g.join('Shen');
  assert.match(p.inmateNo, /^\d{5}$/);
  assert.throws(() => g.join('shen'), GameError);
  assert.throws(() => g.join('   '), GameError);
});

test('payouts add to budget and earned; fines never go below zero', () => {
  const { g, a } = setup(2);
  const start = a.budget;
  g.adjustBudget({ teamId: a.id, amount: 10, reason: 'flip cup' });
  assert.equal(a.budget, start + 10);
  assert.equal(a.earned, 10);
  g.adjustBudget({ teamId: a.id, amount: -1000 });
  assert.equal(a.budget, 0);
  assert.equal(a.earned, 10);
});

test('finishing a game pays out per team', () => {
  const { g, a, b } = setup(2);
  const game = g.addGame({ name: 'Beer Pong' });
  g.finishGame({ gameId: game.id, results: { [a.id]: '30', [b.id]: 10 } });
  assert.equal(game.status, 'done');
  assert.equal(a.earned, 30);
  assert.equal(b.earned, 10);
});

test('buying a supply deducts budget and queues an order', () => {
  const { g, a, players } = setup(2);
  a.budget = 50;
  const item = itemOf(g, 'supply');
  const o = g.buy(players[0].id, { itemId: item.id, note: 'vodka soda' });
  assert.equal(o.status, 'pending');
  assert.equal(a.budget, 50 - item.price);
  assert.equal(o.targetTeamId, a.id);
});

test('cannot overspend, buy without a team, or gift yourself', () => {
  const { g, a, players } = setup(2);
  a.budget = 0;
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'supply').id }), /Not enough credits/);
  a.budget = 100;
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'gift').id, targetTeamId: a.id }), /different cell/);
  const loner = g.join('Loner');
  assert.throws(() => g.buy(loner.id, { itemId: itemOf(g, 'supply').id }), /assigned/);
});

test('captain-only spending', () => {
  const { g, a, players } = setup(2);
  a.budget = 100;
  g.updateSettings({ captainOnlySpending: true });
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'supply').id }), /Shot Caller/);
  g.updatePlayer({ playerId: players[0].id, isCaptain: true });
  g.buy(players[0].id, { itemId: itemOf(g, 'supply').id });
});

test('stock runs out', () => {
  const { g, a, players } = setup(2);
  a.budget = 100;
  const item = itemOf(g, 'supply');
  g.updateItem({ itemId: item.id, stock: 1 });
  g.buy(players[0].id, { itemId: item.id });
  assert.throws(() => g.buy(players[0].id, { itemId: item.id }), /Sold out/);
});

test('punishment: deflect bounces it back, accept enforces with drain', () => {
  const { g, a, b, players } = setup(2);
  const [pa, pb] = players; // pa on A, pb on B
  a.budget = 100;
  b.budget = 100;
  const deflect = itemOf(g, 'deflect');
  g.buy(pb.id, { itemId: deflect.id });
  assert.equal(b.inventory.deflect, 1);
  const shakedown = itemOf(g, 'punishment', 15);
  const o = g.buy(pa.id, { itemId: shakedown.id, targetTeamId: b.id });
  assert.equal(o.status, 'incoming');
  assert.throws(() => g.respondPunishment(pa.id, { orderId: o.id, choice: 'accept' }), /not aimed/);
  g.respondPunishment(pb.id, { orderId: o.id, choice: 'deflect' });
  assert.equal(b.inventory.deflect, 0);
  assert.equal(o.targetTeamId, a.id);
  assert.equal(o.fromTeamId, b.id);
  assert.throws(() => g.respondPunishment(pa.id, { orderId: o.id, choice: 'deflect' }), /no deflect/);
  const before = a.budget;
  g.respondPunishment(pa.id, { orderId: o.id, choice: 'accept' });
  assert.equal(o.status, 'pending');
  assert.equal(a.budget, before - 15);
  g.resolveOrder({ orderId: o.id, action: 'done' });
  assert.equal(o.status, 'done');
});

test('refund goes to the original buyer even after a bounce', () => {
  const { g, a, b, players } = setup(2);
  a.budget = 100;
  b.budget = 100;
  b.inventory.deflect = 1;
  const p = itemOf(g, 'punishment', 0);
  const o = g.buy(players[0].id, { itemId: p.id, targetTeamId: b.id });
  g.respondPunishment(players[1].id, { orderId: o.id, choice: 'deflect' });
  const aBefore = a.budget;
  g.resolveOrder({ orderId: o.id, action: 'cancel' });
  assert.equal(a.budget, aBefore + p.price);
});

test('player views hide other inventories and secret roles', () => {
  const { g, a, b, players } = setup(6);
  g.assignRoles({ snitch: 1, guard: 1, lawyer: 1 });
  const v = g.viewFor(players[0].id);
  const mine = v.teams.find((t) => t.id === players[0].teamId);
  const theirs = v.teams.find((t) => t.id !== players[0].teamId);
  assert.ok(mine.inventory);
  assert.equal(theirs.inventory, null);
  assert.equal(v.me.role, players[0].role);
  for (const p of v.players) {
    if (p.id === players[0].id) continue;
    if (players[0].role === 'snitch') continue;
    assert.equal(p.role, null);
  }
  assert.ok(!JSON.stringify(v).includes(players[1].token));
  assert.ok(!JSON.stringify(g.adminView()).includes(players[1].token));
  assert.ok(a && b);
});

test('full snitch game: night kill, lawyer save, vote, immunity, win', () => {
  const { g, players } = setup(6);
  g.assignRoles({ snitch: 1, guard: 1, lawyer: 1 });
  const by = (r) => g.s.players.find((p) => p.role === r);
  const snitch = by('snitch');
  const guard = by('guard');
  const lawyer = by('lawyer');
  const inmates = g.s.players.filter((p) => p.role === 'inmate');

  // Night 1: lawyer protects the target
  g.startNight();
  g.nightAction(snitch.id, { targetId: inmates[0].id });
  g.nightAction(lawyer.id, { targetId: inmates[0].id });
  const frisk = g.nightAction(guard.id, { targetId: snitch.id });
  assert.equal(frisk.isSnitch, true);
  assert.throws(() => g.nightAction(guard.id, { targetId: inmates[1].id }), /already frisked/);
  assert.throws(() => g.nightAction(inmates[1].id, { targetId: snitch.id }), /sleep/);
  g.endNight();
  assert.equal(inmates[0].status, 'gen_pop');

  // Night 2: target is not protected
  g.startNight();
  g.nightAction(snitch.id, { targetId: inmates[1].id });
  g.nightAction(lawyer.id, { targetId: lawyer.id });
  g.endNight();
  assert.equal(inmates[1].status, 'solitary');
  assert.throws(() => g.castVote(inmates[1].id, { targetId: snitch.id }), GameError);

  // Vote: immunity blocks votes against the bribed player
  const snitchTeam = g.team(snitch.teamId);
  snitchTeam.inventory.immunity = 1;
  g.openVote();
  g.useImmunity(snitch.id, { targetId: snitch.id });
  for (const p of g.alive()) if (p.id !== snitch.id) g.castVote(p.id, { targetId: snitch.id });
  g.castVote(snitch.id, { targetId: guard.id });
  g.closeVote();
  // Votes against the bribed snitch are discarded, so the lone vote on the guard decides it.
  assert.equal(snitch.status, 'gen_pop');
  assert.equal(guard.status, 'solitary');
  assert.equal(g.s.mafia.winner, null);
});

test('immunity discards votes against the bribed player', () => {
  const { g } = setup(6);
  g.assignRoles({ snitch: 1, guard: 0, lawyer: 0 });
  const snitch = g.s.players.find((p) => p.role === 'snitch');
  const other = g.s.players.find((p) => p.role === 'inmate');
  g.team(snitch.teamId).inventory.immunity = 1;
  g.openVote();
  g.useImmunity(snitch.id, { targetId: snitch.id });
  for (const p of g.alive()) if (p.id !== snitch.id) g.castVote(p.id, { targetId: snitch.id });
  g.castVote(snitch.id, { targetId: other.id });
  g.closeVote();
  assert.equal(snitch.status, 'gen_pop');
  assert.equal(other.status, 'solitary');
});

test('voting out the last snitch ends the game for General Population', () => {
  const { g } = setup(5);
  g.assignRoles({ snitch: 1, guard: 0, lawyer: 0 });
  const snitch = g.s.players.find((p) => p.role === 'snitch');
  g.openVote();
  for (const p of g.alive()) if (p.id !== snitch.id) g.castVote(p.id, { targetId: snitch.id });
  g.closeVote();
  assert.equal(snitch.status, 'solitary');
  assert.equal(g.s.mafia.winner, 'inmates');
  assert.equal(g.s.mafia.phase, 'over');
});

test('tied vote is a hung jury', () => {
  const { g, players } = setup(4);
  g.assignRoles({ snitch: 1, guard: 0, lawyer: 0 });
  g.openVote();
  g.castVote(players[0].id, { targetId: players[1].id });
  g.castVote(players[1].id, { targetId: players[0].id });
  g.closeVote();
  assert.ok(g.s.players.every((p) => p.status === 'gen_pop'));
});

test('snitches win when they reach parity', () => {
  const { g } = setup(3);
  g.assignRoles({ snitch: 1, guard: 0, lawyer: 0 });
  const snitch = g.s.players.find((p) => p.role === 'snitch');
  const victim = g.s.players.find((p) => p.role === 'inmate');
  g.startNight();
  g.nightAction(snitch.id, { targetId: victim.id });
  g.endNight();
  assert.equal(g.s.mafia.winner, 'snitches');
});

test('shuffle balances teams', () => {
  const { g } = setup(7);
  g.shuffleTeams({ onlyUnassigned: false });
  const sizes = g.s.teams.map((t) => g.s.players.filter((p) => p.teamId === t.id).length).sort();
  assert.deepEqual(sizes, [3, 4]);
});
