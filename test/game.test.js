const test = require('node:test');
// These suites cover guests booking in on their own phones; team-phone tests switch the mode themselves.
process.env.PHONE_MODE = 'guest';
const assert = require('node:assert/strict');
const { Game, GameError, HOLDING } = require('../lib/game');

// n players split across 2 blocks (alternating), budgets topped up.
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
  a.budget = 200;
  b.budget = 200;
  g.updateSettings({ spendMode: 'anyone', actSet: 'arcade' }); // request mode has its own tests; act tests use the Game Night lineup
  return { g, a, b, players };
}
const itemOf = (g, type, pred = () => true) => g.s.items.find((i) => i.type === type && pred(i));
// Drinks score when served; hand-deliver every pending drink order.
const serveAll = (g) => g.s.orders.filter((o) => o.type === 'drink' && o.status === 'pending').forEach((o) => g.resolveOrder({ orderId: o.id, action: 'done', by: 'warden' }));
// Player claims a task and a host signs off on it.
const complete = (g, p, by = 'warden') => {
  g.reportTask(p.id, { result: 'done' });
  const c = g.s.claims.find((x) => x.playerId === p.id && x.status === 'pending');
  g.approveTask({ claimId: c.id, by });
  return c;
};

test('join puts new arrivals in the Holding Cell', () => {
  const g = new Game();
  const p = g.join('Shen');
  assert.match(p.inmateNo, /^\d{5}$/);
  assert.equal(g.status(p), 'holding');
  assert.throws(() => g.join('shen'), GameError);
  assert.throws(() => g.join('   '), GameError);
});

test('buildBlocks makes Block A/B/... of at most maxBlockSize', () => {
  const g = new Game();
  g.updateSettings({ maxBlockSize: 5 });
  for (let i = 0; i < 14; i++) g.join(`P${i}`);
  g.buildBlocks();
  assert.equal(g.s.teams.length, 3);
  assert.deepEqual(g.s.teams.map((t) => t.name), ['Block A', 'Block B', 'Block C']);
  const sizes = g.s.teams.map((t) => g.members(t.id).length).sort();
  assert.deepEqual(sizes, [4, 5, 5]);
  assert.equal(g.holding().length, 0);
  // Late arrival stays in holding until placed.
  const late = g.join('Late');
  assert.equal(g.status(late), 'holding');
});

test('payouts add to budget and earned; fines never go below zero', () => {
  const { g, a } = setup(2);
  const start = a.budget;
  g.adjustBudget({ teamId: a.id, amount: 10, reason: 'flip cup' });
  assert.equal(a.budget, start + 10);
  assert.equal(a.earned, 10);
  g.adjustBudget({ teamId: a.id, amount: -1000 });
  assert.equal(a.budget, 0);
});

test('finishing a game pays out and applies round penalties', () => {
  const { g, a, b, players } = setup(4);
  const late = g.join('Late');
  const game = g.addGame({ name: 'Beer Pong', holdingRule: 'off hand only' });
  g.finishGame({ gameId: game.id, results: { [a.id]: '30', [b.id]: 10 } });
  assert.equal(game.status, 'done');
  assert.equal(a.earned, 30);
  assert.equal(late.drinksOwed, g.s.settings.holdingDrinks);
  assert.equal(players[0].drinksOwed, 0, 'blocks owe nothing');
  assert.equal(players[1].drinksOwed, 0);
  g.drank(late.id);
  assert.equal(late.drinksOwed, 0);
  assert.throws(() => g.drank(late.id), /paid up/);
});

test('holding cell inmates cannot shop, and there is no solitary any more', () => {
  const { g, players } = setup(2);
  const late = g.join('Late');
  assert.throws(() => g.buy(late.id, { itemId: itemOf(g, 'supply').id }), /Holding Cell/);
  assert.equal(g.sendToSolitary, undefined);
  assert.throws(() => g.assignPunishment({ target: 'solitary', drinks: 1 }));
  // An old save with someone serving time: they're just back on their block.
  const old = new Game(JSON.parse(JSON.stringify({ ...g.s, players: g.s.players.map((p, i) => (i ? p : { ...p, solitary: { rounds: 2, reason: 'x' } })) })));
  assert.equal(old.s.players[0].solitary, undefined);
  assert.equal(old.status(old.s.players[0]), 'block');
  assert.equal(old.s.settings.solitaryDrinks, undefined);
});

test('buying a supply deducts budget and queues an order', () => {
  const { g, a, players } = setup(2);
  const item = itemOf(g, 'supply');
  const o = g.buy(players[0].id, { itemId: item.id, note: 'vodka soda' });
  assert.equal(o.status, 'pending');
  assert.equal(a.budget, 200 - item.price);
});

test('cannot overspend or gift yourself; captain-only spending; stock', () => {
  const { g, a, players } = setup(2);
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'drink', (i) => i.name === 'Soju').id, targetTeamId: a.id }), /different block/);
  a.budget = 0;
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'supply').id }), /Not enough credits/);
  a.budget = 100;
  g.updateSettings({ spendMode: 'captain' });
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'supply').id }), /Shot Caller/);
  g.updatePlayer({ playerId: players[0].id, isCaptain: true });
  const item = itemOf(g, 'supply');
  g.updateItem({ itemId: item.id, stock: 1 });
  g.buy(players[0].id, { itemId: item.id });
  assert.throws(() => g.buy(players[0].id, { itemId: item.id }), /Sold out/);
});

test('punishment: deflect bounces it back, accept enforces drain and drinks', () => {
  const { g, a, b, players } = setup(4);
  const [pa, pb] = players;
  g.buy(pb.id, { itemId: itemOf(g, 'deflect').id });
  assert.equal(b.inventory.deflect, 1);
  g.updateItem({ itemId: itemOf(g, 'punishment', (i) => i.drain === 15).id, drinks: 1 });
  const shakedown = itemOf(g, 'punishment', (i) => i.drain === 15);
  const o = g.buy(pa.id, { itemId: shakedown.id, targetTeamId: b.id });
  assert.equal(o.status, 'incoming');
  assert.throws(() => g.respondPunishment(pa.id, { orderId: o.id, choice: 'accept' }), /not aimed/);
  g.respondPunishment(pb.id, { orderId: o.id, choice: 'deflect' });
  assert.equal(o.targetTeamId, a.id);
  assert.throws(() => g.respondPunishment(pa.id, { orderId: o.id, choice: 'deflect' }), /no deflect/);
  const before = a.budget;
  g.respondPunishment(pa.id, { orderId: o.id, choice: 'accept' });
  assert.equal(o.status, 'pending');
  assert.equal(a.budget, before - 15);
  for (const m of g.members(a.id)) assert.equal(m.drinksOwed, 1);
  // Refund goes to whoever originally paid.
  const o2 = g.buy(pa.id, { itemId: shakedown.id, targetTeamId: b.id });
  const aBefore = a.budget;
  g.resolveOrder({ orderId: o2.id, action: 'cancel' });
  assert.equal(a.budget, aBefore + shakedown.price);
});

test('punishing the Holding Cell lands immediately with no deflect', () => {
  const { g, players } = setup(2);
  const late1 = g.join('Late1');
  const late2 = g.join('Late2');
  const shot = itemOf(g, 'punishment', (i) => i.drinks === 1);
  const o = g.buy(players[0].id, { itemId: shot.id, targetTeamId: HOLDING });
  assert.equal(o.status, 'pending');
  assert.equal(late1.drinksOwed, 1);
  assert.equal(late2.drinksOwed, 1);
  assert.equal(players[0].drinksOwed, 0);
  const gift = g.buy(players[0].id, { itemId: itemOf(g, 'drink', (i) => i.name === 'Soju').id, targetTeamId: HOLDING });
  assert.equal(gift.status, 'pending');
});

test('bail moves a holding inmate onto the buying block, respecting max size', () => {
  const { g, a, players } = setup(4); // 2 per block
  const late = g.join('Late');
  const bail = itemOf(g, 'bail');
  g.buy(players[0].id, { itemId: bail.id, targetPlayerId: late.id });
  assert.equal(late.teamId, a.id);
  assert.throws(() => g.buy(players[0].id, { itemId: bail.id, targetPlayerId: late.id }), /isn’t waiting/);
  g.updateSettings({ maxBlockSize: 3 });
  const late2 = g.join('Late2');
  assert.throws(() => g.buy(players[0].id, { itemId: bail.id, targetPlayerId: late2.id }), /full/);
});

test('player views hide other blocks’ stash and tokens', () => {
  const { g, players } = setup(6);
  const v = g.viewFor(players[0].id);
  const theirs = v.teams.find((t) => t.id !== players[0].teamId);
  assert.equal(theirs.inventory, null);
  assert.ok(!JSON.stringify(v).includes(players[1].token));
  assert.ok(!JSON.stringify(g.adminView()).includes(players[1].token));
});

test('loads an older saved state without crashing', () => {
  const old = { settings: { partyName: 'Old' }, players: [{ id: 'x', token: 't', name: 'A', inmateNo: '1', role: 'guard', status: 'solitary' }], teams: [{ id: 't1', name: 'T', budget: 5, earned: 0 }], mafia: { phase: 'day' } };
  const g = new Game(old);
  assert.equal(g.s.players[0].role, undefined, 'the snitch game is gone');
  assert.equal(g.s.players[0].drinksOwed, 0);
  assert.equal(g.s.mafia, undefined);
  g.viewFor('x');
  g.adminView();
});

test('editing a game bumps the briefing version', () => {
  const { g } = setup(2);
  const game = g.addGame({ name: 'Beer Pong', rules: 'Two cups.' });
  g.setGameStatus({ gameId: game.id, status: 'live' });
  g.updateGame({ gameId: game.id, rules: 'Two cups.' });
  assert.equal(game.rulesVersion, 1, 'no change, no new pop-up');
  g.updateGame({ gameId: game.id, rules: 'Three cups.' });
  assert.equal(game.rulesVersion, 2);
  assert.match(g.s.feed[0].text, /Rules updated/);
});

test('host tokens carry a role; payouts name the host', () => {
  const { g, a } = setup(2);
  const t1 = g.newHostToken('warden');
  const t2 = g.newHostToken('officer');
  assert.equal(g.hostRole(t1), 'warden');
  assert.equal(g.hostRole(t2), 'officer');
  assert.equal(g.hostRole('nope'), null);
  g.adjustBudget({ teamId: a.id, amount: 10, reason: 'flip cup', by: 'officer' });
  assert.match(g.s.feed[0].text, /^The Commissary Officer paid/);
  const old = new Game({ adminTokens: ['legacy'] });
  assert.equal(old.hostRole('legacy'), 'warden');
});

test('request mode: a blockmate proposes, two seconds (or the Shot Caller) make it happen', () => {
  const { g, a, players } = setup(8); // A = P0, P2, P4, P6
  g.updateSettings({ spendMode: 'request', requestSeconds: 2 });
  const [p0, , p2, , p4, , p6] = players;
  const item = itemOf(g, 'supply');
  const start = a.budget;
  const r = g.buy(p0.id, { itemId: item.id, note: 'vodka soda' });
  assert.equal(r.status, 'requested');
  assert.equal(a.budget, start, 'nothing spent yet');
  const req = a.requests[0];
  assert.throws(() => g.secondRequest(p0.id, { requestId: req.id }), /own request/);
  assert.equal(g.secondRequest(p2.id, { requestId: req.id }).status, 'seconded');
  assert.throws(() => g.secondRequest(p2.id, { requestId: req.id }), /already/);
  const done = g.secondRequest(p4.id, { requestId: req.id });
  assert.equal(done.status, 'pending');
  assert.equal(done.buyerName, 'P0', 'credited to whoever asked');
  assert.equal(a.budget, start - item.price);
  assert.equal(a.requests.length, 0);
  // Shot Caller approves alone and buys directly.
  g.updatePlayer({ playerId: p6.id, isCaptain: true });
  g.buy(p0.id, { itemId: item.id });
  assert.throws(() => g.approveRequest(p2.id, { requestId: a.requests[0].id }), /Shot Caller/);
  g.approveRequest(p6.id, { requestId: a.requests[0].id });
  assert.equal(a.requests.length, 0);
  assert.notEqual(g.buy(p6.id, { itemId: item.id }).status, 'requested');
  // Dropping: only the asker or the Shot Caller.
  g.buy(p0.id, { itemId: item.id });
  assert.throws(() => g.dropRequest(p2.id, { requestId: a.requests[0].id }), /Only whoever asked/);
  g.dropRequest(p0.id, { requestId: a.requests[0].id });
  assert.equal(a.requests.length, 0);
});

test('requests stay inside the block and are re-checked when they go through', () => {
  const { g, a, players } = setup(6);
  g.updateSettings({ spendMode: 'request', requestSeconds: 1 });
  const item = itemOf(g, 'supply');
  g.buy(players[0].id, { itemId: item.id });
  const req = a.requests[0];
  assert.equal(g.viewFor(players[1].id).teams.find((t) => t.id === a.id).requests, null, 'other blocks cannot see it');
  assert.equal(g.viewFor(players[2].id).teams.find((t) => t.id === a.id).requests.length, 1);
  a.budget = 0;
  assert.throws(() => g.secondRequest(players[2].id, { requestId: req.id }), /Not enough credits/);
});

test('a block of one buys directly even in request mode', () => {
  const { g, a, players } = setup(2);
  g.updateSettings({ spendMode: 'request' });
  assert.equal(g.buy(players[0].id, { itemId: itemOf(g, 'supply').id }).status, 'pending');
  assert.ok(a);
});

test('Shot Caller renames the block; others cannot once there is a Shot Caller', () => {
  const { g, a, players } = setup(4);
  g.renameBlock(players[0].id, { nickname: 'The Shawshank Redeemers', motto: 'Get busy drinking' });
  assert.equal(a.nickname, 'The Shawshank Redeemers');
  g.updatePlayer({ playerId: players[2].id, isCaptain: true });
  assert.throws(() => g.renameBlock(players[0].id, { nickname: 'Nope' }), /Shot Caller/);
  g.renameBlock(players[2].id, { nickname: 'Cell Mates', motto: '' });
  assert.equal(a.nickname, 'Cell Mates');
  assert.equal(g.viewFor(players[1].id).teams.find((t) => t.id === a.id).nickname, 'Cell Mates');
});

test('heats: pairs with no block left alone, paid per heat, totals on the game', () => {
  const g = new Game();
  g.updateSettings({ maxBlockSize: 5 });
  for (let i = 0; i < 15; i++) g.join(`P${i}`);
  g.buildBlocks(); // 3 blocks of 5
  g.seedTeams({ count: 2 });
  for (const t of g.s.teams.slice(3)) g.updatePlayer({ playerId: g.join(`X${t.id}`).id, teamId: t.id });
  const game = g.addGame({ name: 'Beer Pong' });
  g.makeHeats({ gameId: game.id, size: 2 });
  assert.deepEqual(game.heats.map((h) => h.teamIds.length).sort(), [2, 3], '5 blocks → a pair and a three-way');
  const [h1, h2] = game.heats;
  g.startHeat({ gameId: game.id, heatId: h1.id });
  assert.equal(game.status, 'live');
  assert.equal(h1.status, 'live');
  assert.throws(() => g.makeHeats({ gameId: game.id, size: 2 }), /already started/);
  const winner = h1.teamIds[0];
  const outsider = h2.teamIds[0];
  g.finishHeat({ gameId: game.id, heatId: h1.id, results: { [winner]: 30, [outsider]: 99 } });
  assert.equal(g.team(winner).earned, 30);
  assert.equal(g.team(outsider).earned, 0, 'only blocks in the heat get paid');
  assert.throws(() => g.finishHeat({ gameId: game.id, heatId: h1.id, results: {} }), /already/);
  g.startHeat({ gameId: game.id, heatId: h2.id });
  g.finishHeat({ gameId: game.id, heatId: h2.id, results: { [outsider]: 20 } });
  g.finishGame({ gameId: game.id, results: { [winner]: 5 } });
  assert.deepEqual(game.results, { [winner]: 35, [outsider]: 20 });
  assert.equal(g.team(winner).earned, 35);
});

test('custom heats need two real blocks', () => {
  const { g, a, b } = setup(4);
  const game = g.addGame({ name: 'Final' });
  assert.throws(() => g.addHeat({ gameId: game.id, teamIds: [a.id] }), /at least 2/);
  g.addHeat({ gameId: game.id, teamIds: `${a.id},${b.id}` });
  assert.equal(game.heats.length, 1);
  g.removeHeat({ gameId: game.id, heatId: game.heats[0].id });
  assert.equal(game.heats.length, 0);
});

test('bookings roll up into one feed line', () => {
  const g = new Game();
  for (let i = 0; i < 6; i++) g.join(`Guest${i}`);
  const joins = g.s.feed.filter((f) => f.kind === 'join');
  assert.equal(joins.length, 1);
  assert.match(joins[0].text, /Guest5, Guest4, Guest3, Guest2 and 2 more\. 6 inmates/);
});

test('old captain-only saves become captain spend mode', () => {
  const g = new Game({ settings: { captainOnlySpending: true } });
  assert.equal(g.s.settings.spendMode, 'captain');
  assert.equal(g.s.settings.captainOnlySpending, undefined);
});

test('hosts sentence anyone: a player, a block, the Holding Cell or everyone', () => {
  const { g, a, players } = setup(6);
  const late = g.join('Late');
  g.assignPunishment({ target: `player:${players[1].id}`, drinks: 2, reason: 'cheating', by: 'officer' });
  assert.equal(players[1].drinksOwed, 2);
  assert.match(g.s.feed[0].text, /^The Commissary Officer sentenced P1: 2 drinks for cheating\./);
  g.assignPunishment({ target: `team:${a.id}`, text: '10 push-ups', by: 'warden' });
  for (const m of g.members(a.id)) assert.equal(m.sentences[0].text, '10 push-ups');
  assert.equal(players[1].sentences.length, 0, 'other blocks untouched');
  g.assignPunishment({ target: 'holding', drinks: 1, text: 'Sing', by: 'warden' });
  assert.equal(late.drinksOwed, 1);
  g.assignPunishment({ target: 'all', drinks: 1, by: 'warden' });
  assert.equal(late.drinksOwed, 2);
  assert.equal(players[0].drinksOwed, 1);
  assert.throws(() => g.assignPunishment({ target: 'all' }), /drinks, a punishment/);
  const sid = players[0].sentences[0].id;
  g.completeSentence(players[0].id, { sentenceId: sid });
  assert.equal(players[0].sentences[0].status, 'done');
  assert.throws(() => g.completeSentence(players[0].id, { sentenceId: sid }), /Already/);
  assert.equal(g.viewFor(players[0].id).me.sentences[0].status, 'done');
  assert.equal(g.viewFor(players[1].id).players.find((p) => p.id === players[0].id).sentences, undefined, 'others only see a count');
});

test('dare-style commissary punishments land on the victims’ to-do lists', () => {
  const { g, b, players } = setup(4);
  const drills = itemOf(g, 'punishment', (i) => i.name === 'Yard Drills');
  const o = g.buy(players[0].id, { itemId: drills.id, targetTeamId: b.id, note: 'get moving' });
  g.respondPunishment(players[1].id, { orderId: o.id, choice: 'accept' });
  for (const m of g.members(b.id)) {
    assert.match(m.sentences[0].text, /Yard Drills/);
    assert.equal(m.sentences[0].from, g.s.teams[0].name);
  }
  const shot = itemOf(g, 'punishment', (i) => i.drinks === 1);
  const o2 = g.buy(players[0].id, { itemId: shot.id, targetTeamId: b.id });
  g.respondPunishment(players[1].id, { orderId: o2.id, choice: 'accept' });
  assert.equal(players[1].sentences.length, 1, 'drink punishments go on the drink tab, not the to-do list twice');
});

test('removing inmates cleans up their requests', () => {
  const { g, a, players } = setup(6); // A = P0, P2, P4
  g.updateSettings({ spendMode: 'request', requestSeconds: 2 });
  g.buy(players[2].id, { itemId: itemOf(g, 'supply').id });
  g.secondRequest(players[0].id, { requestId: a.requests[0].id });
  g.removePlayers({ playerIds: [players[2].id, players[4].id] });
  assert.equal(g.s.players.length, 4);
  assert.equal(a.requests.length, 0, 'their request is gone');
  assert.equal(g.viewFor(players[2].id), null, 'their phone no longer has a view');
  assert.throws(() => g.removePlayers({ playerIds: ['nope'] }), /at least one/);
});

test('fresh start wipes the night but keeps the setup', () => {
  const { g, players } = setup(4);
  const game = g.addGame({ name: 'Flip Cup', rules: 'Flip it.' });
  g.makeHeats({ gameId: game.id, size: 2 });
  g.finishGame({ gameId: game.id, results: {} });
  const host = g.newHostToken('warden');
  g.updateSettings({ partyName: 'Shen 30' });
  assert.throws(() => g.freshStart({ confirm: 'yes' }), /RESET/);
  g.freshStart({ confirm: 'reset' });
  assert.equal(g.s.players.length, 0);
  assert.equal(g.s.teams.length, 0);
  assert.equal(g.s.orders.length, 0);
  assert.equal(g.s.feed.length, 1);
  assert.equal(game.status, 'upcoming');
  assert.equal(game.rules, 'Flip it.');
  assert.deepEqual(game.heats, []);
  assert.equal(g.s.settings.partyName, 'Shen 30');
  assert.equal(g.hostRole(host), 'warden', 'hosts stay logged in');
  assert.ok(g.s.items.length > 0);
  assert.ok(players);
});

test('hosts flip through the four acts; act-only items follow the act', () => {
  const { g, a, players } = setup(4);
  const visible = () => g.viewFor(players[0].id).items.map((i) => i.name);
  assert.equal(g.act.id, 'gta');
  assert.ok(visible().includes('Stick-Up'));
  assert.ok(!visible().includes('Intertwined Fate'));
  g.setAct({ index: 1 });
  assert.equal(g.act.id, 'genshin');
  assert.ok(visible().includes('Intertwined Fate'));
  assert.ok(!visible().includes('Stick-Up'));
  const stickUp = itemOf(g, 'punishment', (i) => i.steal);
  assert.throws(() => g.buy(players[0].id, { itemId: stickUp.id, targetTeamId: g.s.teams[1].id }), /off the shelf/);
  assert.throws(() => g.setAct({ index: 9 }), /No such act/);
  g.freshStart({ confirm: 'RESET' });
  assert.equal(g.s.act, 0);
  assert.ok(a);
});

test('old saves get the act-only items stocked once', () => {
  const s = new Game().s;
  s.items = s.items.filter((i) => !i.act);
  delete s.actItems;
  delete s.act;
  const g = new Game(s);
  assert.equal(g.s.act, 0);
  assert.equal(g.s.items.filter((i) => i.act).length, 2);
  assert.equal(new Game(g.s).s.items.filter((i) => i.act).length, 2);
});

test('GTA: a Stick-Up moves cash from the victim to the robbers, or back if deflected', () => {
  const { g, a, b, players } = setup(4);
  const stickUp = itemOf(g, 'punishment', (i) => i.steal);
  const o = g.buy(players[0].id, { itemId: stickUp.id, targetTeamId: b.id });
  g.respondPunishment(players[1].id, { orderId: o.id, choice: 'accept' });
  assert.equal(b.budget, 190);
  assert.equal(a.budget, 200 - stickUp.price + 10);
  b.inventory.deflect = 1;
  const o2 = g.buy(players[0].id, { itemId: stickUp.id, targetTeamId: b.id });
  g.respondPunishment(players[1].id, { orderId: o2.id, choice: 'deflect' });
  g.respondPunishment(players[0].id, { orderId: o2.id, choice: 'accept' });
  assert.equal(b.budget, 200);
  assert.equal(a.budget, 200 - 2 * stickUp.price);
});

test('Genshin: wishes roll prizes and pity guarantees a 5-star', () => {
  const { g, a, players } = setup(4);
  g.setAct({ index: 1 });
  g.updateSettings({ warp5: 0, warp4: 0, warpPity: 3 });
  const warp = itemOf(g, 'warp');
  const pulls = [1, 2, 3].map(() => g.buy(players[0].id, { itemId: warp.id }).warp);
  assert.deepEqual(pulls.map((w) => w.stars), [3, 3, 5]);
  assert.equal(a.pity, 0);
  assert.equal(g.viewFor(players[0].id).teams.find((t) => t.id === a.id).pity, 0);
  assert.equal(g.viewFor(players[1].id).teams.find((t) => t.id === a.id).pity, null, 'other blocks can’t see your pity');
  g.updateSettings({ warp5: 100 });
  const before = { budget: a.budget, deflect: a.inventory.deflect };
  const w = g.buy(players[0].id, { itemId: warp.id }).warp;
  assert.equal(w.stars, 5);
  const gained = a.budget - (before.budget - warp.price) + (a.inventory.deflect - before.deflect);
  assert.ok(gained > 0, 'a 5-star always pays something');
});

test('TFT: augments, streak gold, interest and the Hustler discount', () => {
  const { g, a, b, players } = setup(4);
  g.updatePlayer({ playerId: players[0].id, isCaptain: true });
  assert.throws(() => g.pickAugment(players[0].id, { augmentId: a.augmentOffer[0] }), /Act III/);
  g.setAct({ index: 2 });
  assert.equal(a.augmentOffer.length, 3);
  a.augmentOffer = ['hustler', 'windfall', 'crown'];
  assert.throws(() => g.pickAugment(players[2].id, { augmentId: 'hustler' }), /Shot Caller/);
  assert.throws(() => g.pickAugment(players[0].id, { augmentId: 'hunt' }), /on offer/);
  g.pickAugment(players[0].id, { augmentId: 'hustler' });
  assert.throws(() => g.pickAugment(players[0].id, { augmentId: 'windfall' }), /already picked/);
  const red = g.s.items.find((i) => i.name === 'Red Bull');
  const before = a.budget;
  g.buy(players[0].id, { itemId: red.id });
  assert.equal(before - a.budget, Math.ceil(red.price * 0.75));

  const game = g.addGame({ name: 'Pong' });
  for (let i = 0; i < 3; i++) {
    g.addHeat({ gameId: game.id, teamIds: [a.id, b.id] });
    const h = game.heats[game.heats.length - 1];
    g.finishHeat({ gameId: game.id, heatId: h.id, results: { [a.id]: 10 } });
  }
  assert.equal(a.streak, 3);
  assert.equal(b.streak, -3);
  a.budget = 47;
  b.budget = 200;
  g.finishGame({ gameId: game.id, results: {}, penalties: false });
  assert.equal(a.budget, 51, 'interest is 1 per 10, so 4');
  assert.equal(b.budget, 205, 'interest caps at 5');
});

test('Genshin: Wish ×10 charges ten and rolls ten, also through a block request', () => {
  const { g, a, players } = setup(4);
  g.setAct({ index: 1 });
  const fate = itemOf(g, 'warp');
  const before = a.budget;
  const o = g.buy(players[0].id, { itemId: fate.id, count: 10 });
  assert.equal(o.warps.length, 10);
  assert.equal(o.name, 'Intertwined Fate ×10');
  assert.ok(a.budget >= before - 10 * fate.price);
  assert.equal(o.warp.stars, Math.max(...o.warps.map((w) => w.stars)));
  a.budget = 5;
  assert.throws(() => g.buy(players[0].id, { itemId: fate.id, count: 10 }), /Not enough/);
  a.budget = 500;
  g.updateSettings({ spendMode: 'request' });
  const r = g.buy(players[0].id, { itemId: fate.id, count: 10 });
  assert.equal(r.status, 'requested');
  const req = a.requests[0];
  assert.equal(req.price, 10 * fate.price);
  const done = g.secondRequest(players[2].id, { requestId: req.id });
  assert.equal(done.warps.length, 10);
});

test('saves from the Honkai act move to Genshin', () => {
  const s = new Game().s;
  const fate = s.items.find((i) => i.type === 'warp');
  Object.assign(fate, { act: 'honkai', name: 'Warp' });
  const g = new Game(s);
  assert.equal(fate.act, 'genshin');
  assert.equal(fate.name, 'Intertwined Fate');
  assert.equal(g.s.items.filter((i) => i.act).length, 2);
});

test('Genshin: Daily Commissions pay the party, Adventure EXP ranks you up, resonance pays extra', () => {
  const { g, a, players } = setup(4);
  const [p0, , p2] = players;
  assert.throws(() => g.completeCommission(p0.id, { commissionId: 'x' }), /Act II/);
  g.setAct({ index: 1 });
  assert.equal(p0.commissions.length, 4);
  const late = g.join('Latecomer');
  assert.equal(late.commissions.length, 4, 'anyone joining mid-act gets commissions too');
  p0.vision = 'Pyro';
  p2.vision = 'Hydro';
  const before = a.budget;
  const r = g.completeCommission(p0.id, { commissionId: p0.commissions[0].id });
  assert.equal(r.primos, 2);
  assert.equal(a.budget, before + 2);
  assert.throws(() => g.completeCommission(p0.id, { commissionId: p0.commissions[0].id }), /Already/);
  p2.vision = 'Pyro';
  assert.equal(g.completeCommission(p0.id, { commissionId: p0.commissions[1].id }).primos, 3, 'Pyro resonance adds 1');
  g.completeCommission(p0.id, { commissionId: p0.commissions[2].id });
  const last = g.completeCommission(p0.id, { commissionId: p0.commissions[3].id });
  assert.ok(last.all);
  assert.equal(p0.adventureExp, 4 * 100 + 250);
  assert.equal(last.rank, 4);
  assert.equal(g.viewFor(p0.id).me.commissions.length, 4);
  assert.ok(g.viewFor(p2.id).players.find((x) => x.id === p0.id).vision);
  assert.equal(g.viewFor(p2.id).players.find((x) => x.id === p0.id).commissions, undefined, 'commissions stay private');
});

test('every inmate has a stable Vision, even from old saves', () => {
  const s = new Game().s;
  s.players.push({ id: 'abc123', name: 'Old', token: 't', inmateNo: '12345', sentences: [] });
  const v1 = new Game(s).s.players[0].vision;
  const v2 = new Game(JSON.parse(JSON.stringify(s))).s.players[0].vision;
  assert.equal(v1, v2);
});

test('the TV intro replays on act changes and on demand; intro links must be https', () => {
  const g = new Game();
  g.s.settings.actSet = 'longnight';
  assert.equal(g.s.introAt, 0);
  g.setAct({ index: 1 });
  const first = g.s.introAt;
  assert.ok(first > 0);
  g.s.introAt = 1;
  g.playIntro();
  assert.ok(g.s.introAt > 1);
  assert.equal(g.tvView().introAt, g.s.introAt);
  g.updateSettings({ introVideo_gta: 'https://example.com/gta.mp4' });
  assert.equal(g.s.settings.introVideos.gta, 'https://example.com/gta.mp4');
  assert.throws(() => g.updateSettings({ introVideo_tft: 'javascript:alert(1)' }), /https/);
  g.updateSettings({ introVideo_gta: '' });
  assert.equal(g.s.settings.introVideos.gta, '');
});

test('Shot Cam: block members send clips; hosts can require approval, hide and remove them', () => {
  const { g, a, b, players } = setup(4);
  const holding = g.join('Late');
  assert.throws(() => g.canClip(holding.id), /on a block/);
  const r = g.addClip(players[0].id, { url: '/clips/one.mp4', type: 'video/mp4', caption: 'Bottoms up' });
  assert.equal(r.status, 'live');
  assert.throws(() => g.canClip(players[0].id), /Wait a few seconds/);
  assert.equal(g.tvView().clips.length, 1);
  assert.equal(g.tvView().clips[0].playerId, undefined, 'the TV never gets player ids');
  g.updateSettings({ clipsNeedApproval: true });
  const r2 = g.addClip(players[1].id, { url: '/clips/two.mp4', type: 'video/webm' });
  assert.equal(r2.status, 'pending');
  assert.equal(g.tvView().clips.length, 1, 'pending clips stay off the TV');
  assert.equal(g.viewFor(players[1].id).clips.length, 2, 'your block sees its own pending clip');
  assert.equal(g.viewFor(players[0].id).clips.length, 1, 'other blocks do not');
  g.reviewClip({ clipId: r2.clipId, action: 'live' });
  assert.equal(g.tvView().clips.length, 2);
  g.reviewClip({ clipId: r.clipId, action: 'hidden' });
  assert.equal(g.tvView().clips.length, 1);
  assert.deepEqual(g.reviewClip({ clipId: r2.clipId, action: 'remove' }).deleteFiles, ['/clips/two.mp4']);
  g.updateSettings({ clipsEnabled: false });
  assert.throws(() => g.canClip(players[2].id), /switched off/);
  assert.deepEqual(g.freshStart({ confirm: 'RESET' }).deleteFiles, ['/clips/one.mp4']);
  assert.equal(g.s.clips.length, 0);
  assert.ok(a && b);
});

test('The Long Night: each act renames its engine', () => {
  const g = new Game();
  g.s.settings.actSet = 'longnight';
  g.seedTeams({ count: 2 });
  const [a, b] = g.s.teams;
  const players = [0, 1, 2, 3].map((i) => {
    const p = g.join(`L${i}`);
    g.updatePlayer({ playerId: p.id, teamId: i % 2 ? b.id : a.id });
    return p;
  });
  a.budget = b.budget = 500;
  g.updateSettings({ spendMode: 'anyone' });
  assert.equal(g.act.id, 'booking');
  assert.equal(g.act.engine, 'gta');
  // Booking Day: the Stick-Up is a Cell Toss, priced and stocked as before.
  const shelf = g.viewFor(players[0].id).items;
  const shake = shelf.find((i) => i.name === 'Cell Toss');
  assert.ok(shake && !shelf.some((i) => i.name === 'Stick-Up'));
  const o = g.buy(players[0].id, { itemId: shake.id, targetTeamId: b.id });
  assert.equal(o.name, 'Cell Toss');
  assert.match(g.s.feed[0].text, /Cell Toss/);
  assert.equal(g.adminView().items.find((i) => i.id === shake.id).name, 'Stick-Up', 'hosts edit the real item');

  // Arkham: Joker's Wild draws use the Joker's prizes; riddles and patrons replace commissions and Visions.
  g.setAct({ index: 1 });
  assert.equal(g.act.id, 'arkham');
  const draw = g.viewFor(players[0].id).items.find((i) => i.type === 'warp');
  assert.equal(draw.name, 'Joker’s Wild');
  const w = g.buy(players[0].id, { itemId: draw.id }).warp;
  const jokers = Object.values(g.act.prizes).flat().map((x) => x.name);
  assert.ok(jokers.includes(w.name));
  assert.ok(g.act.commissions.includes(players[0].commissions[0].text));
  assert.equal(g.viewFor(players[0].id).visions.Pyro.label, 'Joker');

  // The Heist: augments are heist roles.
  g.setAct({ index: 2 });
  g.updatePlayer({ playerId: players[0].id, isCaptain: true });
  a.augmentOffer = ['windfall', 'rich', 'hunt'];
  g.pickAugment(players[0].id, { augmentId: 'windfall' });
  assert.match(g.s.feed[0].text, /Berlin heist role/);
  assert.equal(g.viewFor(players[0].id).augments.windfall.name, 'Berlin');
  const game = g.addGame({ name: 'Cups' });
  g.finishGame({ gameId: game.id, results: {}, penalties: false });
  assert.ok(g.s.feed.some((f) => /printing press ran/.test(f.text)));

  // Switching to Game Night keeps the act number but changes the act.
  g.updateSettings({ actSet: 'arcade' });
  assert.equal(g.act.id, 'tft');
  assert.throws(() => g.updateSettings({ actSet: 'nope' }), /lineup/);
});

// ---------- points: +1 per drink sent ----------

test('drinks cost and score per the menu; bundles are cheaper and score more', () => {
  const { g, a, b, players } = setup();
  a.budget = 1000;
  const drink = (name) => itemOf(g, 'drink', (i) => i.name === name);
  const send = (name, qty) => g.buy(players[0].id, { itemId: drink(name).id, targetTeamId: b.id, qty });
  const step = (fn) => { const c = a.budget; const o = fn(); return { cost: c - a.budget, points: o.points, o }; };
  assert.deepEqual((({ cost, points }) => ({ cost, points }))(step(() => send('Spirit', 1))), { cost: 15, points: 3 });
  assert.deepEqual((({ cost, points }) => ({ cost, points }))(step(() => send('Spirit', 3))), { cost: 45, points: 9 });
  const five = step(() => send('Spirit', 5));
  assert.deepEqual([five.cost, five.points, five.o.qty, five.o.name], [60, 17, 5, '5× Spirit']);
  assert.deepEqual((({ cost, points }) => ({ cost, points }))(step(() => send('Mystery Spirit', 10))), { cost: 105, points: 35 });
  assert.deepEqual((({ cost, points }) => ({ cost, points }))(step(() => send('Mystery Cocktail', 5))), { cost: 72, points: 22 });
  assert.deepEqual((({ cost, points }) => ({ cost, points }))(step(() => send('Mystery Cocktail', 10))), { cost: 126, points: 46 });
  const bottle = step(() => send('Soju', 8));
  assert.deepEqual([bottle.cost, bottle.points, bottle.o.name], [42, 9, '8× Soju (bottle)']);
  assert.deepEqual((({ cost, points }) => ({ cost, points }))(step(() => send('Wine', 5))), { cost: 125, points: 20 });
  assert.equal(a.points, 0); // nothing scores until the drinks are served
  serveAll(g);
  assert.equal(a.points, 3 + 9 + 17 + 35 + 22 + 46 + 9 + 20);
  assert.equal(b.points, 0);
  // Drinks go to the block as one order for the bar; nobody gets a personal tab.
  assert.equal(five.o.status, 'done');
  assert.ok(g.members(b.id).every((m) => m.drinksOwed === 0));
});

test('drink orders need 1 to 10 drinks and enough credits', () => {
  const { g, a, b, players } = setup();
  const spirit = itemOf(g, 'drink', (i) => i.name === 'Spirit');
  assert.throws(() => g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id, qty: 0 }), /between 1 and 10/);
  assert.throws(() => g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id, qty: 11 }), /between 1 and 10/);
  a.budget = 59;
  assert.throws(() => g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id, qty: 5 }), /Not enough/);
  assert.equal(g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id }).qty, 1); // quantity defaults to 1
});

test('a block request keeps its quantity, and scores the bundle once it goes through', () => {
  const { g, a, b, players } = setup();
  g.updateSettings({ spendMode: 'request' });
  const spirit = itemOf(g, 'drink', (i) => i.name === 'Spirit');
  const { requestId } = g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id, qty: 5 });
  assert.equal(a.requests[0].price, 60);
  assert.equal(a.requests[0].name, '5× Spirit');
  g.secondRequest(players[2].id, { requestId });
  g.secondRequest(players[4].id, { requestId });
  assert.equal(a.budget, 140);
  serveAll(g);
  assert.equal(a.points, 17);
});

test('old saves get the drink menu and lose the two one-size drink gifts', () => {
  const g = new Game();
  const old = structuredClone(g.s);
  delete old.drinkMenu;
  old.items = old.items.filter((i) => i.type !== 'drink');
  old.items.push({ id: 'r', emoji: '🍺', name: 'Send a Round', desc: '', price: 15, type: 'gift', stock: null, active: true, drain: 0, drinks: 0, steal: false, act: null });
  const g2 = new Game(old);
  assert.deepEqual(g2.s.items.filter((i) => i.type === 'drink').map((i) => i.name), ['Spirit', 'Mystery Spirit', 'Soju', 'Wine', 'Mystery Cocktail']);
  assert.equal(g2.s.items.find((i) => i.name === 'Send a Round').active, false);
  assert.equal(new Game(structuredClone(g2.s)).s.items.filter((i) => i.type === 'drink').length, 5); // only once
});

test('penalty-drink punishments score a point; drink-free ones and supplies do not', () => {
  const { g, a, b, players } = setup();
  g.buy(players[0].id, { itemId: itemOf(g, 'punishment', (i) => i.drinks > 0).id, targetTeamId: b.id });
  assert.equal(a.points, 1);
  g.buy(players[0].id, { itemId: itemOf(g, 'punishment', (i) => !i.drinks && !i.drain).id, targetTeamId: b.id });
  g.buy(players[0].id, { itemId: itemOf(g, 'supply').id });
  g.buy(players[0].id, { itemId: itemOf(g, 'deflect').id });
  assert.equal(a.points, 1);
});

test('drinks sent to the Holding Cell score too', () => {
  const { g, a, players } = setup();
  g.join('Late');
  g.buy(players[0].id, { itemId: itemOf(g, 'drink', (i) => i.name === 'Soju').id, targetTeamId: HOLDING });
  serveAll(g);
  assert.equal(a.points, 1);
});

test('a deflected drink still scores for the block that paid for it', () => {
  const { g, a, b, players } = setup();
  b.inventory.deflect = 1;
  const o = g.buy(players[0].id, { itemId: itemOf(g, 'punishment', (i) => i.drinks > 0).id, targetTeamId: b.id });
  g.respondPunishment(players[1].id, { orderId: o.id, choice: 'deflect' });
  assert.equal(a.points, 1);
  assert.equal(b.points, 0);
});

test('a purchase request only scores once it goes through', () => {
  const { g, a, b, players } = setup();
  g.updateSettings({ spendMode: 'request' });
  const { requestId } = g.buy(players[0].id, { itemId: itemOf(g, 'drink', (i) => i.name === 'Soju').id, targetTeamId: b.id });
  assert.equal(a.points, 0);
  g.secondRequest(players[2].id, { requestId });
  g.secondRequest(players[4].id, { requestId });
  serveAll(g);
  assert.equal(a.points, 1);
});

test('cancelling a sent drink refunds the credits and takes the point back', () => {
  const { g, a, b, players } = setup();
  const gift = itemOf(g, 'drink', (i) => i.name === 'Soju');
  const o = g.buy(players[0].id, { itemId: gift.id, targetTeamId: b.id });
  g.resolveOrder({ orderId: o.id, action: 'cancel', by: 'warden' });
  assert.equal(a.budget, 200);
  assert.equal(a.points, 0);
});

test('hosts can correct points, never below zero', () => {
  const { g, a } = setup();
  g.adjustPoints({ teamId: a.id, amount: 3, reason: 'bar mix-up', by: 'officer' });
  assert.equal(a.points, 3);
  g.adjustPoints({ teamId: a.id, amount: -10, by: 'warden' });
  assert.equal(a.points, 0);
  assert.throws(() => g.adjustPoints({ teamId: a.id, amount: 0 }), GameError);
});

test('points are public, and old saves without them load as zero', () => {
  const { g, a, b, players } = setup();
  g.buy(players[0].id, { itemId: itemOf(g, 'drink', (i) => i.name === 'Soju').id, targetTeamId: b.id });
  serveAll(g);
  assert.equal(g.tvView().teams.find((t) => t.id === a.id).points, 1);
  assert.equal(g.viewFor(players[1].id).teams.find((t) => t.id === a.id).points, 1);
  const old = structuredClone(g.s);
  for (const t of old.teams) delete t.points;
  assert.equal(new Game(old).s.teams[0].points, 0);
});

// ---------- shop open / closed ----------

test('closing the shop blocks buying and requests until it reopens', () => {
  const { g, a, b, players } = setup();
  const gift = itemOf(g, 'drink', (i) => i.name === 'Soju');
  g.updateSettings({ shopOpen: 'false' });
  assert.throws(() => g.buy(players[0].id, { itemId: gift.id, targetTeamId: b.id }), /closed/);
  g.updateSettings({ spendMode: 'request' });
  assert.throws(() => g.buy(players[0].id, { itemId: gift.id, targetTeamId: b.id }), /closed/);
  assert.equal(a.budget, 200);
  g.updateSettings({ shopOpen: 'true' });
  g.updateSettings({ spendMode: 'anyone' });
  g.buy(players[0].id, { itemId: gift.id, targetTeamId: b.id });
  serveAll(g);
  assert.equal(a.points, 1);
});

test('a request made while open cannot go through after the shop closes', () => {
  const { g, a, b, players } = setup();
  g.updateSettings({ spendMode: 'request' });
  const { requestId } = g.buy(players[0].id, { itemId: itemOf(g, 'drink', (i) => i.name === 'Soju').id, targetTeamId: b.id });
  g.updateSettings({ shopOpen: false });
  g.secondRequest(players[2].id, { requestId });
  assert.throws(() => g.secondRequest(players[4].id, { requestId }), /closed/);
  assert.equal(a.points, 0);
  assert.equal(a.budget, 200);
});

test('a new night runs one look with no acts to switch to', () => {
  const g = new Game();
  assert.equal(g.s.settings.actSet, 'single');
  assert.equal(g.acts.length, 1);
  assert.equal(g.act.id, 'slammer');
  assert.equal(g.act.engine, 'pixel');
  assert.throws(() => g.setAct({ index: 1 }), GameError);
  assert.equal(new Game({ ...structuredClone(g.s), settings: { ...g.s.settings, actSet: 'gone' } }).acts.length, 1);
});

test("the party is called Shifty Shen's Slammer, including old saves with the old default", () => {
  assert.equal(new Game().s.settings.partyName, "Shifty Shen's Slammer");
  const old = new Game().s;
  old.settings.partyName = 'Shifty Shen Slammer';
  assert.equal(new Game(old).s.settings.partyName, "Shifty Shen's Slammer");
  old.settings.partyName = 'Custom Night';
  assert.equal(new Game(old).s.settings.partyName, 'Custom Night');
});

// ---------- LeParty rounds ----------

// A round of a 1-player game, picks made by the first member of each block.
function playRound(g, a, b, players, { place = { a: 1, b: 2 } } = {}) {
  const game = g.addGame({ name: `Game ${g.s.rounds.length + 1}`, playersNeeded: 1 });
  const r = g.startRound({ gameId: game.id });
  g.revealPicks();
  g.toResults();
  g.enterResults({ placings: { [a.id]: place.a, [b.id]: place.b } });
  return r;
}
const spirit = (g) => itemOf(g, 'drink', (i) => i.name === 'Spirit');
const finishDrinks = (g) => {
  while (g.round.serves.some((s) => !s.servedAt)) g.barNext();
  g.round.serves.forEach((s) => g.barDone({ teamId: s.teamId }));
};

test('a round: blocks pick players, picks show once every block is in, the shop stays shut', () => {
  const { g, a, b, players } = setup();
  const game = g.addGame({ name: 'Flip cup', playersNeeded: 1 });
  const r = g.startRound({ gameId: game.id });
  assert.equal(r.phase, 'game');
  assert.equal(g.s.settings.shopOpen, false);
  assert.throws(() => g.pickPlayers(players[0].id, { playerIds: [players[1].id] }), /can’t play/); // not their block
  assert.throws(() => g.pickPlayers(players[0].id, { playerIds: [players[0].id, players[2].id] }), /exactly 1/);
  g.pickPlayers(players[0].id, { playerIds: [players[2].id] });
  assert.equal(r.revealedAt, null);
  g.pickPlayers(players[1].id, { playerIds: [players[1].id] });
  assert.ok(r.revealedAt);
  assert.deepEqual(r.picks, { [a.id]: [players[2].id], [b.id]: [players[1].id] });
  assert.throws(() => g.startRound({ gameId: game.id }), /still running/);
});

test('players who played either of the last two games sit out; auto-pick favours whoever has played least', () => {
  const { g, a, b, players } = setup();
  const pick = (who, id) => g.pickPlayers(who.id, { playerIds: [id] });
  const one = g.addGame({ name: 'One', playersNeeded: 1 });
  g.startRound({ gameId: one.id });
  pick(players[0], players[0].id);
  pick(players[1], players[1].id);
  g.toResults();
  g.enterResults({ placings: { [a.id]: 1, [b.id]: 2 } });
  g.startDrinks();
  g.startRound({ gameId: one.id });
  assert.throws(() => pick(players[0], players[0].id), /can’t play/);
  // Nobody picks for Block A; the deadline passes and the app picks someone who hasn't played.
  g.round.pickDeadline = Date.now() - 1;
  g.tick();
  assert.ok(g.round.revealedAt);
  assert.equal(g.round.pickedBy[a.id], 'auto');
  assert.notEqual(g.round.picks[a.id][0], players[0].id);
  assert.equal(g.round.picks[a.id].length, 1);
});

test('group games: everyone plays at once and nobody goes on cooldown', () => {
  const { g, a, players } = setup();
  const r = g.startRound({ gameId: g.addGame({ name: 'Charades', playersNeeded: 0 }).id });
  assert.ok(r.revealedAt);
  assert.equal(r.picks[a.id].length, 3);
  g.toResults();
  g.enterResults({ placings: { [a.id]: 1 } });
  g.startDrinks();
  const r2 = g.startRound({ gameId: g.addGame({ name: 'Solo', playersNeeded: 1 }).id });
  assert.equal(g.eligibleFor(r2, a.id).length, 3);
});

test('results pay prize money by placing, crown the round winner and open the shop', () => {
  const { g, a, b, players } = setup();
  const r = playRound(g, a, b, players);
  assert.equal(a.budget, 200 + 90);
  assert.equal(b.budget, 200 + 75);
  assert.equal(r.winnerTeamId, a.id);
  assert.equal(r.phase, 'spending');
  assert.equal(g.s.settings.shopOpen, true);
});

test('the bar: fewest drinks first, Next pays the senders, Back undoes it, Done or the timer finishes a block', () => {
  const { g, a, b, players } = setup();
  const c = g.addTeam({ name: 'Block C' });
  const p = g.join('Cee');
  g.updatePlayer({ playerId: p.id, teamId: c.id });
  playRound(g, a, b, players);
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 }); // A → B: 5 (17 pts)
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: c.id, qty: 1 }); // B → C: 1 (3 pts)
  g.startDrinks();
  const r = g.round;
  assert.equal(g.s.settings.shopOpen, false);
  assert.deepEqual(r.serves.map((s) => [s.teamId, s.drinks]), [[c.id, 1], [b.id, 5]]);
  g.barNext();
  assert.equal(b.points, 3);
  g.barBack();
  assert.equal(b.points, 0);
  g.barNext();
  g.barDone({ teamId: c.id });
  g.barNext();
  assert.equal(a.points, 17);
  assert.equal(r.phase, 'drinks');
  r.serves[1].timerEndsAt = Date.now() - 1; // B runs out of time
  g.tick();
  assert.equal(r.serves[1].missed, true);
  assert.equal(r.phase, 'done');
  // B owes an extra shot of the cheapest drink in the next round's queue.
  playRound(g, a, b, players);
  g.startDrinks();
  const pen = g.round.serves.find((s) => s.teamId === b.id);
  assert.equal(pen.drinks, 1);
  assert.equal(g.order(pen.orderIds[0]).origin, 'penalty');
  assert.equal(g.order(pen.orderIds[0]).name, '1× Soju');
});

test('Reflect works the round after it’s bought: drinks bounce back to their senders and score for the reflector', () => {
  const { g, a, b, players } = setup();
  a.budget = b.budget = 1000;
  playRound(g, a, b, players);
  const reflect = itemOf(g, 'reflect');
  g.buy(players[1].id, { itemId: reflect.id }); // B buys in round 1, for round 2
  assert.throws(() => g.buy(players[0].id, { itemId: reflect.id }), /already has Reflect for next round/);
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 });
  g.startDrinks();
  assert.deepEqual(g.round.serves.map((x) => x.teamId), [b.id]); // not active yet: B drinks
  finishDrinks(g);
  assert.equal(a.points, 17);
  playRound(g, a, b, players); // round 2: B's Reflect is live
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 });
  g.startDrinks();
  assert.deepEqual(g.round.serves.map((x) => x.teamId), [a.id]);
  g.barNext();
  assert.equal(b.points, 17);
  assert.equal(a.points, 17);
  g.barDone({ teamId: a.id });
  playRound(g, a, b, players);
  assert.throws(() => g.buy(players[1].id, { itemId: reflect.id }), /already used/); // one per night
});

test('Eye Spy opens at the start of the next round and shows who sent what to whom, round by round', () => {
  const { g, a, b, players } = setup();
  playRound(g, a, b, players);
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty: 3 });
  g.buy(players[0].id, { itemId: itemOf(g, 'eyespy').id });
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'eyespy').id }), /One Eye Spy per round/);
  assert.equal(g.viewFor(players[0].id).eyeSpy, null); // not yet
  g.startDrinks();
  finishDrinks(g);
  g.startRound({ gameId: g.addGame({ name: 'Next', playersNeeded: 0 }).id });
  const t = g.viewFor(players[0].id).eyeSpy;
  assert.deepEqual(t.rows, [{ round: 1, from: b.id, to: a.id, qty: 3 }]);
  assert.equal(g.viewFor(players[1].id).eyeSpy, null);
});

test('bounties count from the round after they’re bought: Open pays +25 points; Winner’s reward starts the round after it’s picked; a miss costs 3 Spirit shots', () => {
  const { g, a, b, players } = setup();
  a.budget = b.budget = 1000;
  playRound(g, a, b, players); // round 1: A wins
  const open = itemOf(g, 'bounty', (i) => i.bounty === 'open');
  const winners = itemOf(g, 'bounty', (i) => i.bounty === 'winner');
  assert.throws(() => g.buy(players[1].id, { itemId: winners.id }), /just won/);
  g.buy(players[0].id, { itemId: winners.id });
  assert.throws(() => g.buy(players[0].id, { itemId: open.id }), /already has a bounty/);
  g.buy(players[1].id, { itemId: open.id });
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty: 5 }); // round 1: doesn't count yet
  assert.equal(b.points, 0);
  g.startDrinks();
  finishDrinks(g);
  playRound(g, a, b, players); // round 2
  const startB = b.points;
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty: 5 }); // B hits its Open Bounty
  const pointsB = b.points;
  assert.equal(pointsB - startB, 25);
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 }); // A hits the Winner's
  assert.equal(b.points, pointsB); // A's hit gives B nothing
  const won = g.s.bounties.find((x) => x.teamId === a.id);
  assert.equal(won.status, 'hit');
  assert.throws(() => g.chooseBountyReward(players[1].id, { bountyId: won.id, reward: 'bonus' }), /Only that block/);
  g.chooseBountyReward(players[2].id, { bountyId: won.id, reward: 'points' });
  assert.equal(won.rewardFrom, 3);
  g.startDrinks();
  const before = a.points;
  finishDrinks(g);
  assert.equal(a.points - before, 17); // round 2: the reward isn't on yet
  playRound(g, a, b, players); // round 3: it is
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 });
  g.startDrinks();
  const b3 = a.points;
  finishDrinks(g);
  assert.equal(a.points - b3, 17 + 5);
  assert.equal(b.points - pointsB, 17); // its 5 Spirits, served in round 2
  // A buys an Open Bounty and sends nothing in rounds 4–6: missed, 3 Spirit shots in round 7.
  g.updateSettings({ shopOpen: true });
  g.buy(players[0].id, { itemId: open.id });
  for (let i = 0; i < 3; i++) {
    playRound(g, a, b, players);
    g.startDrinks();
    finishDrinks(g);
  }
  assert.equal(g.s.bounties.filter((x) => x.teamId === a.id).pop().status, 'missed');
  playRound(g, a, b, players);
  g.startDrinks();
  const owed = g.round.serves.find((x) => x.teamId === a.id);
  assert.equal(g.order(owed.orderIds[0]).name, '3× Spirit');
});

test('Winner’s Bounty rewards: bonus drinks land extra on the target; fewer drinks shields the block, down to nothing', () => {
  const { g, a, b, players } = setup();
  a.budget = b.budget = 1000;
  a.bonusDrinks = 1; // A's orders land with +1
  b.fewerDrinks = 2; // B knocks 2 off everything sent to it
  playRound(g, a, b, players);
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 }); // 5 + 1 − 2 = 4
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 1 }); // 1 + 1 − 2 = 0: never poured
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty: 2 }); // B's own: 2
  g.startDrinks();
  assert.deepEqual(g.round.serves.map((x) => [x.teamId, x.drinks]).sort(), [[a.id, 2], [b.id, 4]].sort());
  assert.equal(a.points, 3); // the shielded single still scores
  finishDrinks(g);
  assert.equal(a.points, 3 + 17); // and the 5 scores what A paid for, not the free extra
  const pour = g.adminView().round.serves.find((x) => x.teamId === b.id).breakdown[0];
  assert.deepEqual([pour.qty, pour.adjust], [4, '+1 bonus, −2 shield']);
});

test('the drinking streak: finishing in time pays 5 × the streak; running out of time resets it', () => {
  const { g, a, b, players } = setup();
  a.budget = b.budget = 1000;
  const roundWith = (qty) => {
    playRound(g, a, b, players);
    g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty });
    g.startDrinks();
    g.barNext();
  };
  const before = () => a.budget;
  roundWith(2);
  let m = before();
  g.barDone({ teamId: a.id });
  assert.equal(a.drinkStreak, 2);
  assert.equal(a.budget - m, 10);
  roundWith(3);
  m = before();
  g.barDone({ teamId: a.id });
  assert.equal(a.drinkStreak, 5);
  assert.equal(a.budget - m, 25);
  roundWith(1);
  g.round.serves[0].timerEndsAt = Date.now() - 1;
  g.tick();
  assert.equal(a.drinkStreak, 0);
  assert.equal(g.round.serves[0].streakLost, 5);
  // The missed shot comes back next round; finishing it starts again from 1 drink.
  roundWith(1);
  m = before();
  g.barDone({ teamId: a.id });
  assert.equal(a.drinkStreak, 2); // 1 sent + 1 penalty
  assert.equal(a.budget - m, 10);
});

test('hosts can drop drinks into the queue before drinks start, and crown the winner', () => {
  const { g, a, b, players } = setup();
  playRound(g, a, b, players);
  g.assignDrinks({ teamId: a.id, itemId: spirit(g).id, qty: 2, reason: 'late', by: 'warden' });
  g.startDrinks();
  assert.deepEqual(g.round.serves.map((s) => [s.teamId, s.drinks]), [[a.id, 2]]);
  assert.throws(() => g.assignDrinks({ teamId: a.id, itemId: spirit(g).id }), /already built/);
  b.points = 9;
  g.crownWinner({});
  assert.equal(g.s.winner.teamId, b.id);
  assert.equal(g.tvView().winner.teamId, b.id);
});

test('other blocks can’t see your picks until they’re revealed, or who has Reflect', () => {
  const { g, a, b, players } = setup();
  g.startRound({ gameId: g.addGame({ name: 'Secret', playersNeeded: 1 }).id });
  g.pickPlayers(players[0].id, { playerIds: [players[0].id] });
  assert.equal(g.viewFor(players[1].id).round.picks[a.id], undefined);
  assert.deepEqual(g.viewFor(players[2].id).round.picks[a.id], [players[0].id]);
  g.pickPlayers(players[1].id, { playerIds: [players[1].id] });
  g.toResults();
  g.enterResults({ placings: { [a.id]: 1 } });
  g.buy(players[1].id, { itemId: itemOf(g, 'reflect').id });
  g.startDrinks();
  playRound(g, a, b, players);
  assert.equal(g.viewFor(players[0].id).round.reflectTeamId, null);
  assert.equal(g.tvView().round.reflectTeamId, null);
  assert.deepEqual(g.adminView().reflects, [{ teamId: b.id, round: 2 }]);
  g.startDrinks();
  assert.equal(g.tvView().round.reflectTeamId, b.id); // public once drinks start
});

test('the night runs 4 acts of 3 rounds, games in schedule order, and stops after Act 4’s final round', () => {
  const { g, a, b, players } = setup();
  const games = Array.from({ length: 13 }, (_, i) => g.addGame({ name: `G${i + 1}`, playersNeeded: 0 }));
  const labels = [];
  for (let i = 0; i < 12; i++) {
    const r = g.startRound(); // no game given: the next one in the schedule
    assert.equal(r.gameId, games[i].id);
    labels.push(r.label);
    g.toResults();
    g.enterResults({ placings: { [a.id]: 1, [b.id]: 2 } });
    g.startDrinks();
  }
  assert.deepEqual(labels.slice(0, 4), ['Act 1 · Round 1', 'Act 1 · Round 2', 'Act 1 · Final round', 'Act 2 · Round 1']);
  assert.equal(labels[11], 'Act 4 · Final round');
  assert.throws(() => g.startRound(), /final round of Act 4/);
  assert.equal(g.tvView().round.label, 'Act 4 · Final round');
  assert.ok(g.s.feed.some((f) => /ACT 3 begins/.test(f.text)));
  // Hosts can change the shape of the night.
  g.updateSettings({ actsCount: 5 });
  assert.equal(g.startRound().label, 'Act 5 · Round 1');
});

test('an old save that predates the power-ups gets them on load, and keeps them after', () => {
  const old = structuredClone(new Game().s);
  delete old.catalogue; // saved before the field existed
  old.items = old.items.filter((i) => !['reflect', 'eyespy', 'bounty'].includes(i.type));
  const g = new Game(old);
  assert.deepEqual(g.s.items.filter((i) => ['reflect', 'eyespy', 'bounty'].includes(i.type)).map((i) => i.name), ['Reflect', 'Eye Spy', 'Open Bounty', 'Winner’s Bounty']);
  // A save stamped with an older catalogue number but missing them (the live save) is repaired too.
  const stamped = structuredClone(old);
  stamped.catalogue = 3;
  assert.equal(new Game(stamped).s.items.filter((i) => i.type === 'bounty').length, 2);
  // And it only happens once: a host who deletes one later doesn't get it back.
  const after = structuredClone(g.s);
  after.items = after.items.filter((i) => i.name !== 'Eye Spy');
  assert.equal(new Game(after).s.items.some((i) => i.name === 'Eye Spy'), false);
});

// ---------- team phones (LeParty's format) ----------

function teamSetup() {
  const g = new Game();
  g.s.settings.phoneMode = 'team';
  g.addGuests({ names: 'Shen\nEdwin\nJason\nMia, Priya, Tom' });
  g.updateSettings({ maxBlockSize: 3 });
  g.buildBlocks();
  const [a, b] = g.s.teams;
  a.budget = b.budget = 500;
  return { g, a, b };
}

test('team phones: guests can’t book in; hosts add names; each block has a code and a QR token', () => {
  const { g, a, b } = teamSetup();
  assert.throws(() => g.join('Late'), /one phone/);
  assert.equal(g.members(a.id).length + g.members(b.id).length, 6);
  assert.match(a.joinCode, /^[ACDEFGHJKMNPQRTUVWXY234679]{4}$/);
  assert.notEqual(a.joinCode, b.joinCode);
  assert.ok(a.joinToken.length >= 12);
  assert.equal(g.addGuests({ names: 'shen\nNora' }).added, 1); // names stay unique
});

test('claiming a block: by code or card, latest scan wins, and a reissued code signs the phone out', () => {
  const { g, a } = teamSetup();
  const first = g.claimBlock({ code: a.joinCode.toLowerCase() });
  const t1 = first.token;
  assert.equal(g.playerByToken(t1).teamId, a.id);
  const second = g.claimBlock({ token: a.joinToken });
  assert.equal(second.id, first.id); // same block phone…
  assert.equal(g.playerByToken(t1), null); // …and the old device is signed out
  assert.ok(g.playerByToken(second.token));
  const oldCode = a.joinCode;
  const t2 = second.token;
  g.reissueBlockCode({ teamId: a.id, by: 'warden' });
  assert.equal(g.playerByToken(t2), null);
  assert.throws(() => g.claimBlock({ code: oldCode }), /No block/);
  assert.ok(g.claimBlock({ code: a.joinCode }));
});

test('the block phone acts for the block but never plays, drinks or shows up in rosters', () => {
  const { g, a, b } = teamSetup();
  g.updateSettings({ spendMode: 'request' });
  const phone = g.claimBlock({ code: a.joinCode });
  g.claimBlock({ code: b.joinCode });
  assert.equal(g.members(a.id).length, 3);
  assert.ok(!g.viewFor(phone.id).players.some((p) => p.id === phone.id));
  assert.ok(!g.tvView().players.some((p) => /phone/.test(p.name)));
  // Picks come from the real blockmates.
  const r = g.startRound({ gameId: g.addGame({ name: 'Flip', playersNeeded: 1 }).id });
  assert.throws(() => g.pickPlayers(phone.id, { playerIds: [phone.id] }), /can’t play/);
  g.pickPlayers(phone.id, { playerIds: [g.members(a.id)[0].id] });
  assert.deepEqual(r.picks[a.id], [g.members(a.id)[0].id]);
  // It buys straight away, even when spending is a block decision.
  g.revealPicks();
  g.toResults();
  g.enterResults({ placings: { [a.id]: 1 } });
  const spirit = g.s.items.find((i) => i.name === 'Spirit');
  const o = g.buy(phone.id, { itemId: spirit.id, targetTeamId: b.id, qty: 2 });
  assert.equal(o.qty, 2);
  // A Shot Penalty on its block lands on the people, not the phone.
  const pen = g.s.items.find((i) => i.name === 'Shot Penalty');
  const bPhone = g.phoneOf(b.id);
  const hit = g.buy(bPhone.id, { itemId: pen.id, targetTeamId: a.id });
  g.respondPunishment(phone.id, { orderId: hit.id, choice: 'accept' });
  assert.ok(g.members(a.id).every((m) => m.drinksOwed === 1));
  assert.equal(phone.drinksOwed, 0);
  // Removing the block removes its phone.
  g.removeTeam({ teamId: a.id });
  assert.equal(g.playerByToken(phone.token), null);
});

test('PHONE_MODE picks the default for a new night; hosts can switch it', () => {
  const g = new Game();
  assert.equal(g.s.settings.phoneMode, 'guest'); // this test file runs with PHONE_MODE=guest
  g.updateSettings({ phoneMode: 'team' });
  assert.throws(() => g.join('Shen'), /one phone/);
  assert.throws(() => g.updateSettings({ phoneMode: 'nope' }), /Unknown/);
});

test('block codes reach hosts only, never phones or the TV', () => {
  const { g, a } = teamSetup();
  const phone = g.claimBlock({ code: a.joinCode });
  assert.equal(g.adminView().teams[0].joinCode, a.joinCode);
  assert.equal(g.viewFor(phone.id).teams[0].joinCode, undefined);
  assert.equal(g.tvView().teams[0].joinToken, undefined);
});

// ---------- LeParty sync ----------

const roster = (blocks, guests) => ({ event: { id: 'ev1', name: 'November lockup' }, blocks, guests });
const LB = [{ id: 'b1', name: 'Cellblock A', colour: '#c9402f' }, { id: 'b2', name: 'Cellblock B', colour: '#24477e' }];

test('LeParty import: blocks and checked-in guests arrive on their blocks; syncing again changes nothing', () => {
  const g = new Game();
  g.s.settings.phoneMode = 'team';
  const guests = [
    { id: 'p1', name: 'Shen', blockId: 'b1' },
    { id: 'p2', name: 'Edwin', blockId: 'b1' },
    { id: 'p3', name: 'Jason', blockId: 'b2' },
    { id: 'p4', name: 'Mia', blockId: null }, // checked in before the draw
  ];
  const first = g.applyRoster(roster(LB, guests));
  assert.equal(first.changed, true);
  const [a, b] = g.s.teams;
  assert.deepEqual([a.name, a.color, a.lepartyId, b.name], ['Cellblock A', '#c9402f', 'b1', 'Cellblock B']);
  assert.deepEqual(g.members(a.id).map((p) => p.name).sort(), ['Edwin', 'Shen']);
  assert.equal(g.status(g.s.players.find((p) => p.name === 'Mia')), 'holding');
  assert.ok(a.joinCode); // block cards work as usual
  assert.equal(g.s.leparty.eventName, 'November lockup');
  assert.ok(g.s.feed.some((f) => /Imported from LeParty: 4 guests on 2 blocks/.test(f.text)));
  assert.equal(g.applyRoster(roster(LB, guests)).changed, false);
  assert.equal(g.s.players.length, 4);
  assert.equal(g.s.teams.length, 2);
});

test('LeParty sync: late check-ins follow LeParty’s block, even past the size limit; moves follow; leavers are only flagged', () => {
  const g = new Game();
  g.s.settings.phoneMode = 'team';
  g.updateSettings({ maxBlockSize: 2 });
  g.applyRoster(roster(LB, [{ id: 'p1', name: 'Shen', blockId: 'b1' }, { id: 'p2', name: 'Edwin', blockId: 'b1' }, { id: 'p3', name: 'Jason', blockId: 'b2' }]));
  const [a, b] = g.s.teams;
  a.points = 9;
  const r = g.applyRoster(roster(LB, [
    { id: 'p1', name: 'Shen', blockId: 'b1' },
    { id: 'p2', name: 'Edwin', blockId: 'b2' }, // moved by the host in LeParty
    { id: 'p4', name: 'Nora', blockId: 'b1' }, // late check-in, lightest block per LeParty
    { id: 'p5', name: 'Kai', blockId: 'b1' }, // over the size limit: LeParty still wins
  ]));
  assert.deepEqual(r.changes.sort(), ['Edwin moved: Cellblock A → Cellblock B', 'Jason is no longer checked in on LeParty', 'Late check-in: Kai → Cellblock A', 'Late check-in: Nora → Cellblock A'].sort());
  assert.deepEqual(g.members(a.id).map((p) => p.name).sort(), ['Kai', 'Nora', 'Shen']);
  assert.equal(a.points, 9); // points stay with the block
  const jason = g.s.players.find((p) => p.name === 'Jason');
  assert.equal(jason.teamId, b.id); // not removed mid-game…
  assert.equal(g.adminView().players.find((p) => p.name === 'Jason').lepartyGone, true); // …just flagged
  assert.ok(g.s.feed.some((f) => /Late check-in: Nora → Cellblock A/.test(f.text)));
  // A guest the hosts already added by hand is linked by name, not duplicated.
  const g2 = new Game();
  g2.s.settings.phoneMode = 'team';
  g2.addGuests({ names: 'Shen' });
  g2.applyRoster(roster(LB, [{ id: 'p1', name: 'shen', blockId: 'b1' }]));
  assert.equal(g2.s.players.length, 1);
  assert.equal(g2.s.players[0].lepartyId, 'p1');
});

test('blocks hold up to 10 by default, and saves on the old default of 5 move up', () => {
  assert.equal(new Game().s.settings.maxBlockSize, 10);
  const old = structuredClone(new Game().s);
  old.settings.maxBlockSize = 5;
  delete old.settings.blockSize10;
  assert.equal(new Game(old).s.settings.maxBlockSize, 10);
  const custom = structuredClone(old);
  custom.settings.maxBlockSize = 7;
  assert.equal(new Game(custom).s.settings.maxBlockSize, 7);
});

// ---------- app-run games ----------

function appSetup(blocks = 4) {
  const g = new Game();
  g.s.settings.phoneMode = 'team';
  g.addGuests({ names: Array.from({ length: blocks * 2 }, (_, i) => `G${i}`).join('\n') });
  g.updateSettings({ maxBlockSize: 2 });
  g.buildBlocks();
  const teams = g.s.teams;
  const phones = teams.map((t) => g.claimBlock({ code: t.joinCode }));
  return { g, teams, phones };
}

test('Cold War: secret picks, revealed together; the two lowest drink theirs plus the two highest’s; places by number', () => {
  const { g, teams, phones } = appSetup(5);
  const game = g.addGame({ name: 'Cold War drinking', runBy: 'coldwar' });
  assert.equal(game.playersNeeded, 0);
  const r = g.startRound({ gameId: game.id });
  assert.equal(r.play.kind, 'coldwar');
  assert.throws(() => g.playAnswer(phones[0].id, { value: 16 }), /between 1 and 15/);
  const picks = [15, 3, 9, 1, 12]; // A B C D E
  picks.slice(0, 4).forEach((n, i) => g.playAnswer(phones[i].id, { value: n }));
  // Others can't see the numbers before the reveal; your own block can.
  assert.deepEqual(g.viewFor(phones[1].id).round.play.bids[teams[0].id], { locked: true });
  assert.equal(g.viewFor(phones[0].id).round.play.bids[teams[0].id].n, 15);
  g.playAnswer(phones[4].id, { value: 12 }); // the last block locks in: revealed at once
  const pl = r.play;
  assert.equal(pl.revealed, true);
  // Order: A15, E12, C9, B3, D1. D (lowest) takes A's 15, B (second lowest) takes E's 12.
  assert.deepEqual(pl.drinks, { [teams[0].id]: 0, [teams[4].id]: 0, [teams[2].id]: 9, [teams[1].id]: 3 + 12, [teams[3].id]: 1 + 15 });
  const shots = g.s.orders.filter((o) => o.origin === 'game');
  assert.deepEqual(shots.map((o) => [o.targetTeamId, o.qty]).sort(), [[teams[1].id, 15], [teams[2].id, 9], [teams[3].id, 16]].sort());
  g.playFinish();
  assert.equal(r.phase, 'spending');
  assert.deepEqual(r.placings, { [teams[0].id]: 1, [teams[4].id]: 2, [teams[2].id]: 3, [teams[1].id]: 4, [teams[3].id]: 5 });
  assert.equal(r.winnerTeamId, teams[0].id);
  g.startDrinks(); // the Cold War shots are in the bar queue
  assert.equal(g.round.serves.find((s) => s.teamId === teams[3].id).drinks, 16);
});

test('Cold War: blocks that don’t pick in time count as 1; two blocks means lowest takes the highest’s', () => {
  const { g, teams, phones } = appSetup(2);
  const r = g.startRound({ gameId: g.addGame({ name: 'CW', runBy: 'coldwar' }).id });
  g.playAnswer(phones[0].id, { value: 6 });
  r.play.deadline = Date.now() - 1;
  g.tick();
  assert.equal(r.play.bids[teams[1].id].auto, true);
  assert.deepEqual(r.play.drinks, { [teams[0].id]: 0, [teams[1].id]: 1 + 6 });
});

test('Trivia: questions from the Games tab, answered on the phones, scored and placed by score then speed', () => {
  const { g, teams, phones } = appSetup(3);
  assert.throws(() => g.addGame({ name: 'Bad', runBy: 'trivia', questions: 'Just a question' }), /Trivia line 1/);
  const game = g.addGame({ name: 'Trivia', runBy: 'trivia', questions: 'Capital of France? | Paris | Rome | Oslo | A\n2 + 2? | 3 | 4 | 2\nBiggest planet? | Mars | Jupiter | Venus | Earth | Jupiter' });
  assert.deepEqual(game.questions.map((q) => q.answer), [0, 1, 1]);
  const r = g.startRound({ gameId: game.id });
  assert.throws(() => g.playAnswer(phones[0].id, { value: 0 }), /No question/);
  g.playNext();
  assert.equal(g.viewFor(phones[0].id).round.play.question.answer, null); // hidden while asking
  g.playAnswer(phones[0].id, { value: 0 }); // A right
  assert.throws(() => g.playAnswer(phones[0].id, { value: 1 }), /already answered/);
  g.playAnswer(phones[1].id, { value: 2 }); // B wrong
  g.playAnswer(phones[2].id, { value: 0 }); // C right; everyone in: revealed
  assert.equal(r.play.state, 'revealed');
  assert.equal(g.tvView().round.play.question.answer, 0);
  g.playNext();
  g.playAnswer(phones[1].id, { value: 1 }); // B right
  r.play.deadline = Date.now() - 1; // time runs out for the others
  g.tick();
  g.playNext();
  g.playAnswer(phones[2].id, { value: 1 }); // C right
  assert.throws(() => g.playNext(), /Reveal this question/);
  g.playFinish();
  // C has 2 right answers, A and B one each.
  assert.equal(r.placings[teams[2].id], 1);
  assert.deepEqual([r.play.scores[teams[0].id], r.play.scores[teams[1].id], r.play.scores[teams[2].id]], [1, 1, 2]);
  assert.equal(r.phase, 'spending');
});

test('Is Jason lying?: phones vote Truth or Lie, the host says which it was, right blocks score', () => {
  const { g, teams, phones } = appSetup(3);
  const r = g.startRound({ gameId: g.addGame({ name: 'Is Jason lying?', runBy: 'lying', stories: 2 }).id });
  g.playNext();
  g.playAnswer(phones[0].id, { value: 'lie' });
  g.playAnswer(phones[1].id, { value: 'truth' });
  assert.deepEqual(g.viewFor(phones[2].id).round.play.votes, {}); // others' votes are hidden
  assert.throws(() => g.playNext(), /Say whether/);
  assert.throws(() => g.playReveal({}), /truth or a lie/);
  g.playReveal({ truth: 'lie' });
  assert.equal(r.play.scores[teams[0].id], 1);
  g.playNext();
  g.playAnswer(phones[2].id, { value: 'truth' });
  r.play.deadline = Date.now() - 1;
  g.tick(); // voting closes; still waiting on the host
  assert.equal(r.play.state, 'closed');
  g.playReveal({ truth: 'truth' });
  assert.throws(() => g.playNext(), /last story/);
  g.playFinish();
  assert.equal(r.phase, 'spending');
  assert.equal(Object.keys(r.placings).length, 3);
});

test('an app-run game can still be finished by hand', () => {
  const { g, teams } = appSetup(2);
  const r = g.startRound({ gameId: g.addGame({ name: 'Trivia', runBy: 'trivia', questions: 'Q? | a | b | A' }).id });
  g.toResults();
  g.enterResults({ placings: { [teams[1].id]: 1, [teams[0].id]: 2 } });
  assert.equal(r.winnerTeamId, teams[1].id);
});

// ---------- the night's setup and act mechanics ----------

test('setup: name each act, choose a game for every round, confirm; rounds then follow the sequence', () => {
  const g = new Game();
  g.updateSettings({ actsCount: 2, roundsPerAct: 2 });
  assert.equal(g.s.night.status, 'draft');
  assert.deepEqual(g.s.night.acts.map((a) => [a.name, a.rounds.length]), [['Act 1', 2], ['Act 2', 2]]);
  const [cup, quiz, chess, dance] = ['Flip cup', 'Trivia', 'Chess', 'Dance'].map((name) => g.addGame({ name, playersNeeded: 0 }));
  g.renameAct({ act: 1, name: 'Booking Day' });
  g.setSlot({ act: 1, slot: 1, gameId: chess.id });
  g.setSlot({ act: 1, slot: 2, gameId: cup.id });
  g.setSlot({ act: 2, slot: 1, gameId: dance.id });
  assert.throws(() => g.confirmNight({}), /1 round still empty/);
  g.setSlot({ act: 2, slot: 2, gameId: quiz.id });
  g.confirmNight({});
  assert.equal(g.s.night.status, 'live');
  assert.deepEqual(g.s.games.map((x) => x.name), ['Chess', 'Flip cup', 'Dance', 'Trivia']);
  // Rounds follow the sequence, labelled by the act's name.
  const p = g.join('Shen');
  g.seedTeams({ count: 1 });
  g.updatePlayer({ playerId: p.id, teamId: g.s.teams[0].id });
  const r1 = g.startRound();
  assert.deepEqual([r1.gameName, r1.label], ['Chess', 'Booking Day · Round 1']);
  assert.throws(() => g.setSlot({ act: 1, slot: 1, gameId: cup.id }), /already been played/);
  g.toResults();
  g.enterResults({ placings: { [g.s.teams[0].id]: 1 } });
  g.startDrinks();
  assert.deepEqual([g.startRound().gameName, g.round.label], ['Flip cup', 'Booking Day · Final round']);
  // Growing the night keeps what's set; shrinking trims.
  g.updateSettings({ actsCount: 3 });
  assert.equal(g.s.night.acts[0].name, 'Booking Day');
  assert.equal(g.s.night.acts[2].rounds.length, 2);
});

test('act mechanics: hooks run only in the acts that switch them on', () => {
  const { registerMechanic } = require('../lib/game');
  const seen = [];
  registerMechanic('happyhour', {
    name: 'Happy hour',
    desc: 'Half-price drinks, double points.',
    actStart: (game, act) => seen.push(`start ${act.name}`),
    roundStart: (game, r) => seen.push(`round ${r.number}`),
    results: (game, r) => seen.push(`results ${r.number}`),
    drinksStart: (game, r) => seen.push(`drinks ${r.number}`),
    price: (game, team, item, price) => (item.type === 'drink' ? Math.ceil(price / 2) : price),
    points: (game, order, points) => points * 2,
  });
  const { g, a, b, players } = setup();
  a.budget = b.budget = 1000;
  g.updateSettings({ actsCount: 2, roundsPerAct: 1 });
  assert.throws(() => g.setActMechanics({ act: 1, mechanics: ['nope'] }), /Unknown mechanic/);
  g.setActMechanics({ act: 2, mechanics: ['happyhour'] });
  g.renameAct({ act: 2, name: 'Happy Hour' });
  const spirit = itemOf(g, 'drink', (i) => i.name === 'Spirit');
  // Act 1: no mechanics.
  playRound(g, a, b, players);
  const before = a.budget;
  g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id, qty: 1 });
  assert.equal(before - a.budget, 15);
  g.startDrinks();
  finishDrinks(g);
  assert.equal(a.points, 3);
  assert.deepEqual(seen, []);
  // Act 2: Happy hour.
  playRound(g, a, b, players);
  const before2 = a.budget;
  g.buy(players[0].id, { itemId: spirit.id, targetTeamId: b.id, qty: 1 });
  assert.equal(before2 - a.budget, 8);
  g.startDrinks();
  finishDrinks(g);
  assert.equal(a.points, 3 + 6);
  assert.deepEqual(seen, ['start Happy Hour', 'round 2', 'results 2', 'drinks 2']);
  assert.deepEqual(g.tvView().round.actMechanics, ['Happy hour']);
  assert.equal(g.tvView().mechanicsCatalog.happyhour.name, 'Happy hour');
});

test('deleting a game from the library empties the rounds that used it', () => {
  const g = new Game();
  g.updateSettings({ actsCount: 1, roundsPerAct: 2 });
  const quiz = g.addGame({ name: 'Trivia', playersNeeded: 0 });
  g.setSlot({ act: 1, slot: 1, gameId: quiz.id });
  g.setSlot({ act: 1, slot: 2, gameId: quiz.id });
  g.removeGame({ gameId: quiz.id });
  assert.deepEqual(g.s.night.acts[0].rounds, [null, null]);
});

test('the night ends itself: when the last act’s final round finishes, most points wins', () => {
  const { g, a, b, players } = setup();
  g.updateSettings({ actsCount: 1, roundsPerAct: 2 });
  playRound(g, a, b, players);
  g.startDrinks();
  assert.equal(g.s.winner, null); // not after the first round
  playRound(g, a, b, players);
  b.points = 12;
  a.points = 7;
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 1 });
  g.startDrinks();
  g.barNext();
  assert.equal(g.s.winner, null); // the bar's still going
  g.barDone({ teamId: b.id });
  assert.equal(g.s.winner.teamId, b.id); // B 12 beats A 7 + 3
  assert.equal(g.tvView().winner.teamId, b.id);
});

test('the party’s games load into the library once, with how each is run', () => {
  const g = new Game();
  g.addGame({ name: 'Flip cup', playersNeeded: 0 });
  assert.equal(g.loadStarterGames().added, 13);
  assert.equal(g.loadStarterGames().added, 0);
  const by = Object.fromEntries(g.s.games.map((x) => [x.name, [x.runBy, x.playersNeeded]]));
  assert.deepEqual(by['Is Jason lying?'], ['host', 1]);
  assert.deepEqual(by['Flip 7'], ['host', 1]);
  assert.deepEqual(by['Anime opening guessing'], ['anime', 0]);
  assert.deepEqual(by['Cold War drinking'], ['coldwar', 0]);
  assert.deepEqual(by.Trivia, ['trivia', 0]);
  assert.equal(g.s.games.length, 14);
});

test('Anime openings: blocks type the anime; only the first right answer scores; typos and alternate names count', () => {
  const { g, teams, phones } = appSetup(3);
  const game = g.addGame({ name: 'Anime opening guessing', runBy: 'anime', openings: 'Opening 1 | Attack on Titan | Shingeki no Kyojin | AoT\nOpening 2 | Naruto\nOpening 3 | My Hero Academia' });
  assert.equal(game.openings.length, 3);
  const r = g.startRound({ gameId: game.id });
  assert.throws(() => g.playAnswer(phones[0].id, { value: 'Naruto' }), /No opening/);
  g.playNext();
  assert.equal(g.viewFor(phones[0].id).round.play.answer, null); // hidden while it plays
  assert.deepEqual(g.playAnswer(phones[0].id, { value: 'Bleach' }), { correct: false });
  assert.deepEqual(g.playAnswer(phones[0].id, { value: 'Bleach' }), { correct: false }); // guess again as often as you like
  assert.deepEqual(g.playAnswer(phones[1].id, { value: 'attack on titen!' }), { correct: true }); // one typo forgiven
  assert.equal(r.play.state, 'won');
  assert.throws(() => g.playAnswer(phones[2].id, { value: 'AoT' }), /No opening/); // closed for everyone
  assert.equal(g.tvView().round.play.answer, 'Attack on Titan');
  g.playNext();
  g.playAnswer(phones[2].id, { value: 'NARUTO' });
  g.playNext();
  r.play.deadline = Date.now() - 1; // nobody gets opening 3
  g.tick();
  assert.equal(r.play.state, 'missed');
  g.playFinish();
  assert.equal(r.phase, 'spending');
  assert.deepEqual([r.play.scores[teams[1].id], r.play.scores[teams[2].id], r.play.scores[teams[0].id] || 0], [1, 1, 0]);
  assert.equal(r.placings[teams[0].id], 3);
});

test('Anime openings: hosts can give a near-miss to a block, or call nobody', () => {
  const { g, teams } = appSetup(2);
  const r = g.startRound({ gameId: g.addGame({ name: 'Anime', runBy: 'anime', openings: 'O1 | Spy x Family\nO2 | Bleach' }).id });
  assert.throws(() => g.addGame({ name: 'Bad', runBy: 'anime', openings: 'Just a label' }), /Opening line 1/);
  g.playNext();
  g.playReveal({ teamId: teams[1].id });
  assert.equal(r.play.winners[0], teams[1].id);
  g.playNext();
  g.playReveal({});
  assert.equal(r.play.state, 'missed');
});

test('an old library with the multiple-choice anime game moves to typed answers', () => {
  const g = new Game();
  g.addGame({ name: 'Anime opening guessing', runBy: 'trivia', playersNeeded: 0 });
  assert.equal(new Game(structuredClone(g.s)).s.games[0].runBy, 'anime');
});
