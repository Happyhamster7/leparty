const test = require('node:test');
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
  g.sendToSolitary({ playerId: players[0].id, rounds: 1, reason: 'cheating' });
  const game = g.addGame({ name: 'Beer Pong', holdingRule: 'off hand only' });
  g.finishGame({ gameId: game.id, results: { [a.id]: '30', [b.id]: 10 } });
  assert.equal(game.status, 'done');
  assert.equal(a.earned, 30);
  assert.equal(late.drinksOwed, g.s.settings.holdingDrinks);
  assert.equal(players[0].drinksOwed, g.s.settings.solitaryDrinks);
  assert.equal(players[0].solitary, null, 'one-round sentence is served');
  assert.equal(players[0].teamId, a.id, 'returns to their block');
  assert.equal(players[1].drinksOwed, 0);
  g.drank(late.id);
  assert.equal(late.drinksOwed, 0);
  assert.throws(() => g.drank(late.id), /paid up/);
});

test('holding cell and solitary inmates cannot shop', () => {
  const { g, players } = setup(2);
  const late = g.join('Late');
  assert.throws(() => g.buy(late.id, { itemId: itemOf(g, 'supply').id }), /Holding Cell/);
  g.sendToSolitary({ playerId: players[0].id, rounds: 2 });
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'supply').id }), /solitary/);
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

test('player views hide other blocks’ stash/intel, roles and tokens', () => {
  const { g, players } = setup(6);
  g.dealSnitches({ chance: 100 });
  const v = g.viewFor(players[0].id);
  const theirs = v.teams.find((t) => t.id !== players[0].teamId);
  assert.equal(theirs.inventory, null);
  assert.equal(theirs.intel, null);
  for (const p of v.players) if (p.id !== players[0].id) assert.equal(p.role, null);
  assert.equal(v.me.role, players[0].role);
  assert.ok(!JSON.stringify(v).includes(players[1].token));
  assert.ok(!JSON.stringify(g.adminView()).includes(players[1].token));
});

test('dealSnitches: at most one per block, 0% chance still guarantees one by default', () => {
  const { g } = setup(10);
  g.dealSnitches({ chance: 100 });
  for (const t of g.s.teams) assert.equal(g.members(t.id).filter((p) => p.role === 'snitch').length, 1);
  g.dealSnitches({ chance: 0 });
  assert.equal(g.s.players.filter((p) => p.role === 'snitch').length, 1);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  assert.equal(g.s.players.filter((p) => p.role === 'snitch').length, 0);
});

test('wiretap tells a block whether it has a hidden snitch', () => {
  const { g, a, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[2].id, role: 'snitch' }); // players[2] is on A
  const r = g.buy(players[0].id, { itemId: itemOf(g, 'intel').id });
  assert.equal(r.hasSnitch, true);
  assert.equal(a.intel[0].hasSnitch, true);
});

test('lights out: snitch tips send people to solitary; everyone else just whispers', () => {
  const { g, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  const snitch = players[0];
  g.updatePlayer({ playerId: snitch.id, role: 'snitch' });
  g.startNight();
  g.nightPick(snitch.id, { targetId: players[1].id });
  g.nightPick(players[2].id, { targetId: snitch.id });
  g.nightPick(players[3].id, { targetId: snitch.id });
  assert.throws(() => g.nightPick(players[4].id, { targetId: players[4].id }), /someone else/);
  g.endNight();
  assert.equal(players[1].solitary.rounds, g.s.settings.tipRounds);
  assert.equal(players[2].solitary, null);
  assert.equal(snitch.solitary, null);
  assert.ok(g.s.feed.some((f) => f.text.includes('most suspected') && f.text.includes(snitch.name)));
});

test('block vote: majority kicks the snitch → bounty, solitary, then holding; game over when all caught', () => {
  const { g, a, players } = setup(6); // A = P0, P2, P4
  g.dealSnitches({ chance: 0, atLeastOne: false });
  const [p0, , p2, , p4] = players;
  g.updatePlayer({ playerId: p4.id, role: 'snitch' });
  const before = a.budget;
  g.openVote();
  g.castVote(p0.id, { targetId: p4.id });
  g.castVote(p2.id, { targetId: p4.id });
  assert.throws(() => g.castVote(p0.id, { targetId: players[1].id }), /own blockmates/);
  g.closeVote();
  assert.equal(p4.teamId, null);
  assert.ok(p4.revealed);
  assert.equal(a.budget, before + g.s.settings.snitchBounty);
  assert.equal(g.status(p4), 'solitary');
  assert.equal(g.s.mafia.phase, 'over');
  g.tickRound();
  assert.equal(g.status(p4), 'holding');
});

test('block vote: kicking an innocent costs credits and sends them to holding', () => {
  const { g, a, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[1].id, role: 'snitch' }); // on B
  const [p0, , p2, , p4] = players;
  const before = a.budget;
  g.openVote();
  g.castVote(p0.id, { targetId: p4.id });
  g.castVote(p2.id, { targetId: p4.id });
  g.closeVote();
  assert.equal(g.status(p4), 'holding');
  assert.equal(a.budget, before - g.s.settings.wrongfulPenalty);
  assert.equal(g.s.mafia.phase, 'idle');
});

test('block vote needs a majority and respects bribes', () => {
  const { g, a, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  const [p0, , p2, , p4] = players;
  g.openVote();
  g.castVote(p0.id, { targetId: p4.id }); // 1 of 3: not a majority
  g.closeVote();
  assert.equal(p4.teamId, a.id);
  a.inventory.immunity = 1;
  g.openVote();
  g.useImmunity(p4.id, { targetId: p4.id });
  g.castVote(p0.id, { targetId: p4.id });
  g.castVote(p2.id, { targetId: p4.id });
  g.closeVote();
  assert.equal(p4.teamId, a.id, 'bribed inmate survives');
});

test('revealSnitches unmasks uncaught snitches and ends the game', () => {
  const { g, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[3].id, role: 'snitch' });
  g.revealSnitches();
  assert.equal(g.s.mafia.winner, 'snitches');
  const v = g.viewFor(players[0].id);
  assert.equal(v.players.find((p) => p.id === players[3].id).role, 'snitch');
});

test('loads an older saved state without crashing', () => {
  const old = { settings: { partyName: 'Old' }, players: [{ id: 'x', token: 't', name: 'A', inmateNo: '1', role: 'guard', status: 'solitary' }], teams: [{ id: 't1', name: 'T', budget: 5, earned: 0 }], mafia: { phase: 'day' } };
  const g = new Game(old);
  assert.equal(g.s.players[0].role, 'inmate');
  assert.equal(g.s.players[0].drinksOwed, 0);
  assert.deepEqual(g.s.teams[0].intel, []);
  g.viewFor('x');
  g.adminView();
});

test('going live gives only the hidden snitch a task; everyone gets the rules', () => {
  const { g, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[0].id, role: 'snitch' });
  const late = g.join('Late');
  const game = g.addGame({ name: 'Flip Cup', rules: 'Line up.\nDrink, then flip.\n\n\n\nFirst block done wins.' });
  assert.equal(game.rules, 'Line up.\nDrink, then flip.\n\nFirst block done wins.');
  g.setGameStatus({ gameId: game.id, status: 'live' });
  assert.equal(players[0].task.kind, 'sabotage');
  assert.ok(g.s.settings.sabotageTasks.includes(players[0].task.text));
  assert.equal(players[1].task, null);
  assert.equal(late.task, null);
  // Every phone gets the same briefing; nobody else's payload carries the sabotage or the task list.
  const v1 = g.viewFor(players[1].id);
  assert.equal(v1.games[0].rules, game.rules);
  assert.equal(v1.settings.sabotageTasks, undefined);
  assert.ok(!JSON.stringify(v1).includes(players[0].task.text));
  assert.equal(g.viewFor(players[0].id).me.task.kind, undefined);
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

test('per-game sabotage override is used for snitches', () => {
  const { g, players } = setup(4);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[0].id, role: 'snitch' });
  const game = g.addGame({ name: 'Beer Pong', sabotage: 'Bounce one into the wrong cup' });
  g.setGameStatus({ gameId: game.id, status: 'live' });
  assert.equal(players[0].task.text, 'Bounce one into the wrong cup');
});

test('sabotage: claim does nothing until approved, then skims silently; void reverses', () => {
  const { g, a, players } = setup(6); // A = P0, P2, P4
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[4].id, role: 'snitch' });
  g.dealTasks();
  const start = a.budget;
  const feedBefore = g.s.feed.length;
  g.reportTask(players[4].id, { result: 'done' });
  assert.equal(a.budget, start, 'claiming alone moves no credits');
  assert.equal(players[4].task.status, 'claimed');
  const sab = g.s.claims[0];
  g.approveTask({ claimId: sab.id, by: 'officer' });
  assert.equal(players[4].task.status, 'done');
  assert.equal(a.budget, start - g.s.settings.sabotageSkim);
  assert.equal(players[4].dirt, 1);
  assert.equal(a.ledger[0].text, 'Unexplained withdrawal');
  assert.equal(g.s.feed.length, feedBefore, 'no public feed line gives it away');
  assert.throws(() => g.reportTask(players[4].id, { result: 'done' }), /active task/);
  assert.throws(() => g.reportTask(players[0].id, { result: 'done' }), /active task/);
  g.revokeTask({ claimId: sab.id });
  assert.equal(players[4].dirt, 0);
  assert.equal(a.budget, start);
});

test('reroll once per task, skip works', () => {
  const { g, players } = setup(4);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[0].id, role: 'snitch' });
  g.dealTasks();
  g.rerollTask(players[0].id);
  assert.throws(() => g.rerollTask(players[0].id), /One reroll/);
  g.reportTask(players[0].id, { result: 'skip' });
  assert.equal(players[0].task.status, 'skipped');
});

test('a caught snitch’s pending claim pays nothing; catching recovers what they skimmed', () => {
  const { g, a, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  const [p0, , p2, , p4] = players;
  g.updatePlayer({ playerId: p4.id, role: 'snitch' });
  g.dealTasks();
  complete(g, p4);
  const before = a.budget;
  g.openVote();
  g.castVote(p0.id, { targetId: p4.id });
  g.castVote(p2.id, { targetId: p4.id });
  g.closeVote();
  assert.equal(a.budget, before + g.s.settings.snitchBounty + g.s.settings.sabotageSkim);
  assert.equal(p4.dealerDrinks, 0);
});

test('surviving snitches get drinks to hand out, scaled by sabotages', () => {
  const { g, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  const snitch = players[1];
  g.updatePlayer({ playerId: snitch.id, role: 'snitch' });
  g.dealTasks();
  complete(g, snitch);
  g.dealTasks();
  complete(g, snitch);
  g.revealSnitches();
  const st = g.s.settings;
  assert.equal(snitch.dealerDrinks, st.snitchRewardDrinks + 2 * st.drinksPerSabotage);
  g.dealDrink(snitch.id, { targetId: players[0].id });
  assert.equal(players[0].drinksOwed, 1);
  assert.equal(snitch.dealerDrinks, st.snitchRewardDrinks + 2 * st.drinksPerSabotage - 1);
  assert.throws(() => g.dealDrink(snitch.id, { targetId: snitch.id }), /someone else/);
  assert.throws(() => g.dealDrink(players[0].id, { targetId: snitch.id }), /no drinks/);
});

test('task lists are editable from settings', () => {
  const g = new Game();
  g.updateSettings({ sabotageTasks: 'One\n\nTwo  \n' });
  assert.deepEqual(g.s.settings.sabotageTasks, ['One', 'Two']);
  assert.throws(() => g.updateSettings({ sabotageTasks: '   ' }), /at least one/);
});

test('rejected claims go back to the snitch; claims can only be judged once', () => {
  const { g, a, players } = setup(4);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[0].id, role: 'snitch' });
  g.dealTasks();
  const start = a.budget;
  g.reportTask(players[0].id, { result: 'done' });
  const c = g.s.claims[0];
  g.rejectTask({ claimId: c.id, by: 'officer' });
  assert.equal(players[0].task.status, 'active');
  assert.equal(a.budget, start);
  assert.throws(() => g.approveTask({ claimId: c.id }), /already judged/);
  // A claim survives a new deal and can still be approved.
  g.reportTask(players[0].id, { result: 'done' });
  const c2 = g.s.claims[0];
  g.dealTasks();
  g.approveTask({ claimId: c2.id, by: 'warden' });
  assert.equal(a.budget, start - g.s.settings.sabotageSkim);
  assert.equal(players[0].task.status, 'active', 'the new task is untouched');
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

test('hosts sentence anyone: a player, a block, the Holding Cell, Solitary or everyone', () => {
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
  assert.throws(() => g.assignPunishment({ target: 'solitary', drinks: 1 }), /Nobody/);
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

test('removing inmates cleans up votes, picks, requests and claims', () => {
  const { g, a, players } = setup(6); // A = P0, P2, P4
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[4].id, role: 'snitch' });
  g.dealTasks();
  g.reportTask(players[4].id, { result: 'done' });
  g.updateSettings({ spendMode: 'request', requestSeconds: 2 });
  g.buy(players[2].id, { itemId: itemOf(g, 'supply').id });
  g.secondRequest(players[0].id, { requestId: a.requests[0].id });
  g.openVote();
  g.castVote(players[0].id, { targetId: players[2].id });
  g.castVote(players[2].id, { targetId: players[0].id });
  g.removePlayers({ playerIds: [players[2].id, players[4].id] });
  assert.equal(g.s.players.length, 4);
  assert.equal(a.requests.length, 0, 'their request is gone');
  assert.deepEqual(g.s.mafia.vote.votes, {}, 'votes by or about them are gone');
  assert.equal(g.s.claims.length, 0);
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
  const before = { budget: a.budget, deflect: a.inventory.deflect, dealer: players[0].dealerDrinks };
  const w = g.buy(players[0].id, { itemId: warp.id }).warp;
  assert.equal(w.stars, 5);
  const gained = a.budget - (before.budget - warp.price) + (a.inventory.deflect - before.deflect) + (players[0].dealerDrinks - before.dealer);
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

test('Among Us: sabotage skims and snitch bounties double', () => {
  const { g, a, players } = setup(6);
  g.setAct({ index: 3 });
  const snitch = players[0];
  snitch.role = 'snitch';
  g.s.mafia.phase = 'idle';
  g.dealTasks();
  const before = a.budget;
  complete(g, snitch);
  assert.equal(before - a.budget, g.s.settings.sabotageSkim * 2);
  g.openVote();
  for (const p of [players[2], players[4]]) g.castVote(p.id, { targetId: snitch.id });
  const mid = a.budget;
  g.closeVote();
  assert.equal(a.budget - mid, g.s.settings.snitchBounty * 2 + g.s.settings.sabotageSkim * 2);
  assert.deepEqual(g.s.mafia.lastResult.ejected.map((x) => [x.name, x.snitch]), [[snitch.name, true]]);
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

test('Reflect sends drinks back to their senders and the points go to the reflector', () => {
  const { g, a, b, players } = setup();
  playRound(g, a, b, players);
  const reflect = itemOf(g, 'reflect');
  g.buy(players[1].id, { itemId: reflect.id });
  assert.throws(() => g.buy(players[0].id, { itemId: reflect.id }), /already played Reflect/);
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 });
  g.startDrinks();
  const r = g.round;
  assert.deepEqual(r.serves.map((s) => s.teamId), [a.id]);
  g.barNext();
  assert.equal(b.points, 17);
  assert.equal(a.points, 0);
  // One per block per night.
  g.barDone({ teamId: a.id });
  playRound(g, a, b, players);
  assert.throws(() => g.buy(players[1].id, { itemId: reflect.id }), /already used/);
});

test('Eye Spy shows who sent what to whom, round by round, up to the purchase', () => {
  const { g, a, b, players } = setup();
  playRound(g, a, b, players);
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty: 3 });
  g.startDrinks();
  finishDrinks(g);
  playRound(g, a, b, players);
  g.buy(players[0].id, { itemId: itemOf(g, 'eyespy').id });
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'eyespy').id }), /One Eye Spy per round/);
  const t = g.viewFor(players[0].id).eyeSpy;
  assert.deepEqual(t.rows, [{ round: 1, from: b.id, to: a.id, qty: 3 }]);
  assert.equal(g.viewFor(players[1].id).eyeSpy, null);
});

test('bounties: Open pays +25 points; Winner’s lets the block pick a reward; a miss costs 3 Spirit shots next round', () => {
  const { g, a, b, players } = setup();
  a.budget = b.budget = 1000;
  playRound(g, a, b, players);
  const open = itemOf(g, 'bounty', (i) => i.bounty === 'open');
  const winners = itemOf(g, 'bounty', (i) => i.bounty === 'winner');
  assert.throws(() => g.buy(players[1].id, { itemId: winners.id }), /just won/);
  g.buy(players[0].id, { itemId: winners.id });
  assert.throws(() => g.buy(players[0].id, { itemId: open.id }), /already has a bounty/);
  g.buy(players[1].id, { itemId: open.id });
  const budgetB = b.budget;
  g.buy(players[1].id, { itemId: spirit(g).id, targetTeamId: a.id, qty: 5 }); // B hits its Open Bounty
  assert.equal(b.points, 25);
  assert.equal(b.budget, budgetB - 60); // points only, no credits
  g.buy(players[0].id, { itemId: spirit(g).id, targetTeamId: b.id, qty: 5 }); // A hits the Winner's
  const won = g.s.bounties.find((x) => x.teamId === a.id);
  assert.equal(won.status, 'hit');
  assert.equal(won.reward, null);
  assert.throws(() => g.chooseBountyReward(players[1].id, { bountyId: won.id, reward: 'bonus' }), /Only that block/);
  g.chooseBountyReward(players[2].id, { bountyId: won.id, reward: 'points' });
  assert.equal(a.bonusPerDrink, 1);
  assert.throws(() => g.chooseBountyReward(players[0].id, { bountyId: won.id, reward: 'fewer' }), /no reward/);
  g.startDrinks();
  finishDrinks(g);
  assert.equal(a.points, 17 + 5); // its drinks were served after the reward
  // A sends nothing for its next Open Bounty and misses.
  g.updateSettings({ shopOpen: true }); // between rounds, hosts can open the shop by hand
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

test('other blocks can’t see your picks until they’re revealed, or who played Reflect', () => {
  const { g, a, b, players } = setup();
  g.startRound({ gameId: g.addGame({ name: 'Secret', playersNeeded: 1 }).id });
  g.pickPlayers(players[0].id, { playerIds: [players[0].id] });
  assert.equal(g.viewFor(players[1].id).round.picks[a.id], undefined);
  assert.deepEqual(g.viewFor(players[2].id).round.picks[a.id], [players[0].id]);
  g.pickPlayers(players[1].id, { playerIds: [players[1].id] });
  g.toResults();
  g.enterResults({ placings: { [a.id]: 1 } });
  g.buy(players[1].id, { itemId: itemOf(g, 'reflect').id });
  assert.equal(g.viewFor(players[0].id).round.reflectTeamId, null);
  assert.equal(g.tvView().round.reflectTeamId, null);
  assert.equal(g.adminView().round.reflectTeamId, b.id);
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
