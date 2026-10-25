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
  return { g, a, b, players };
}
const itemOf = (g, type, pred = () => true) => g.s.items.find((i) => i.type === type && pred(i));

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
  g.updateSettings({ captainOnlySpending: true });
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

test('going live deals everyone a task; snitch gets a sabotage, holding gets parole', () => {
  const { g, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[0].id, role: 'snitch' });
  const late = g.join('Late');
  const game = g.addGame({ name: 'Flip Cup' });
  g.setGameStatus({ gameId: game.id, status: 'live' });
  assert.equal(players[0].task.kind, 'sabotage');
  assert.ok(g.s.settings.sabotageTasks.includes(players[0].task.text));
  assert.equal(players[1].task.kind, 'yard');
  assert.equal(late.task.kind, 'parole');
  // The snitch's phone payload doesn't say it's a sabotage.
  const me = g.viewFor(players[0].id).me;
  assert.equal(me.task.kind, undefined);
  assert.ok(!JSON.stringify(g.viewFor(players[1].id)).includes(players[0].task.text));
});

test('per-game sabotage override is used for snitches', () => {
  const { g, players } = setup(4);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[0].id, role: 'snitch' });
  const game = g.addGame({ name: 'Beer Pong', sabotage: 'Bounce one into the wrong cup' });
  g.setGameStatus({ gameId: game.id, status: 'live' });
  assert.equal(players[0].task.text, 'Bounce one into the wrong cup');
});

test('task completion: inmates earn credits, snitch skims, holding earns parole; revoke undoes', () => {
  const { g, a, players } = setup(6); // A = P0, P2, P4
  g.dealSnitches({ chance: 0, atLeastOne: false });
  g.updatePlayer({ playerId: players[4].id, role: 'snitch' });
  const late = g.join('Late');
  g.dealTasks();
  const start = a.budget;
  g.reportTask(players[0].id, { result: 'done' });
  assert.equal(a.budget, start + g.s.settings.taskReward);
  g.reportTask(players[4].id, { result: 'done' });
  assert.equal(a.budget, start + g.s.settings.taskReward - g.s.settings.sabotageSkim);
  assert.equal(players[4].dirt, 1);
  assert.equal(a.ledger[0].text, 'Unexplained withdrawal');
  assert.throws(() => g.reportTask(players[4].id, { result: 'done' }), /active task/);
  g.reportTask(late.id, { result: 'done' });
  assert.equal(late.paroleScore, 1);
  // Feed lines are identical for honest and sabotage completions.
  const lines = g.s.feed.filter((f) => f.kind === 'task' && f.text.includes(a.name)).map((f) => f.text);
  assert.equal(new Set(lines).size, 1);
  g.revokeTask({ playerId: players[4].id });
  assert.equal(players[4].dirt, 0);
  assert.equal(a.budget, start + g.s.settings.taskReward);
});

test('reroll once per task, skip works', () => {
  const { g, players } = setup(2);
  g.dealTasks();
  g.rerollTask(players[0].id);
  assert.throws(() => g.rerollTask(players[0].id), /One reroll/);
  g.reportTask(players[0].id, { result: 'skip' });
  assert.equal(players[0].task.status, 'skipped');
});

test('catching a snitch recovers what they skimmed', () => {
  const { g, a, players } = setup(6);
  g.dealSnitches({ chance: 0, atLeastOne: false });
  const [p0, , p2, , p4] = players;
  g.updatePlayer({ playerId: p4.id, role: 'snitch' });
  g.dealTasks();
  g.reportTask(p4.id, { result: 'done' });
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
  g.reportTask(snitch.id, { result: 'done' });
  g.dealTasks();
  g.reportTask(snitch.id, { result: 'done' });
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
  assert.throws(() => g.updateSettings({ yardTasks: '   ' }), /at least one/);
});
