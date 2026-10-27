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
  g.updateSettings({ spendMode: 'anyone' }); // request mode has its own tests
  return { g, a, b, players };
}
const itemOf = (g, type, pred = () => true) => g.s.items.find((i) => i.type === type && pred(i));
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
  assert.throws(() => g.buy(players[0].id, { itemId: itemOf(g, 'gift').id, targetTeamId: a.id }), /different block/);
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
  const gift = g.buy(players[0].id, { itemId: itemOf(g, 'gift').id, targetTeamId: HOLDING });
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
