import { test } from 'node:test';
import assert from 'node:assert/strict';
import { night } from './testkit';

/**
 * Ported from legacy/sss/test/game.test.js: what each screen can and
 * can't see. Picks before they're revealed, Reflect before drinks
 * start, other teams' points before an act ends, hidden senders, and
 * each team's own secrets. (What the app-run games show and hide is
 * tested with each game in plays.test.ts.)
 */

type Night = ReturnType<typeof night>;

const round = (n: Night) => n.state.rounds[n.state.rounds.length - 1];

function setMoney(n: Night, teamId: string, to: number) {
  const delta = to - n.money(teamId);
  if (delta) n.host('adjustMoney', { teamId, amount: delta });
}

/** The legacy tests' table: two teams of three with $200 each, and the shop open as it was by default. */
function setup(teams = 2) {
  const n = night({ teams, size: 3 });
  for (const g of n.roster.groups) setMoney(n, g.id, 200);
  n.host('setShop', { open: true });
  return n;
}

/** A round of a new 1-player game, picks made by the app, taken to Spending. */
function playRound(n: Night, placings: Record<string, number> = { T1: 1, T2: 2 }) {
  const gameId = n.host('addGame', { name: `Game ${n.state.rounds.length + 1}`, playersNeeded: 1 })!.gameId;
  n.host('startRound', { gameId });
  n.host('revealPicks');
  n.host('toResults');
  n.host('enterResults', { placings });
  return round(n);
}

const send = (n: Night, from: string, to: string, qty = 1, itemId = 'spirit') => n.team(from, 'buy', { itemId, targetTeamId: to, qty });

function openBox(n: Night, teamId: string, rolls: number[]) {
  n.rolls = [...rolls];
  try {
    return n.team(teamId, 'buy', { itemId: 'mystery-box' })!.mystery as Record<string, unknown>;
  } finally {
    n.rolls = [];
  }
}

/** One team's row, as a given screen is shown it. */
const row = (view: { teams: { id: string }[] }, teamId: string) => view.teams.find((t) => t.id === teamId) as ReturnType<Night['e']>['teams'][number];

test('points go public at the end of each act; your own team and the hosts see them live', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 }); // every round ends an act
  send(n, 'T1', 'T2', 1, 'soju-shot');
  n.host('resolveOrder', { orderId: n.state.orders[0].id, action: 'done' });
  assert.equal(n.points('T1'), 1);
  assert.equal(row(n.seenBy('T1'), 'T1').points, 1, 'T1 sees its own score live');
  assert.equal(row(n.seenBy('T1'), 'T1').pointsLive, true);
  assert.equal(row(n.e(), 'T1').points, 1, 'hosts see it live');
  assert.equal(row(n.tv(), 'T1').points, 0, 'the TV waits for the act to end');
  assert.equal(row(n.seenBy('T2'), 'T1').points, 0, 'so does T2');
  assert.equal(row(n.seenBy('T2'), 'T1').pointsLive, false);
  assert.equal(n.tv().pointsAsOf, null);
  // The act ends: the standings are published.
  playRound(n);
  n.host('startDrinks');
  assert.equal(row(n.tv(), 'T1').points, 1);
  assert.equal(row(n.seenBy('T2'), 'T1').points, 1);
  assert.deepEqual(n.tv().pointsAsOf, { act: '1' });
  n.host('adjustPoints', { teamId: 'T1', amount: 5 }); // more points mid-act stay private
  assert.equal(row(n.tv(), 'T1').points, 1);
  assert.equal(row(n.seenBy('T2'), 'T1').points, 1);
  assert.equal(row(n.seenBy('T1'), 'T1').points, 6);
  assert.equal(row(n.e(), 'T1').points, 6);
});

test('the standings are published under the act’s own name when it has one', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 });
  n.host('renameAct', { act: 1, name: 'Booking Day' });
  playRound(n);
  n.host('startDrinks');
  assert.deepEqual(n.tv().pointsAsOf, { act: 'Booking Day' });
  assert.deepEqual(n.state.feed[0].params, { act: 'Booking Day' });
});

test('other teams can’t see your picks until they’re revealed, or who has Reflect', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 }); // round 2 is Act 2, when the Mystery Box opens
  n.host('startRound', { gameId: n.host('addGame', { name: 'Secret', playersNeeded: 1 })!.gameId });
  n.team('T1', 'pick', { playerIds: ['T1-p1'] });
  assert.equal(n.seenBy('T2').round!.picks.T1, undefined);
  assert.deepEqual(n.seenBy('T1').round!.picks.T1, ['T1-p1']);
  assert.deepEqual(n.tv().round!.picks, {});
  assert.deepEqual(n.e().round!.picks, { T1: ['T1-p1'] }, 'the hosts see picks as they come in');
  assert.deepEqual(n.seenBy('T2').round!.picked, ['T1'], 'everyone can see that T1 has picked');
  assert.deepEqual(n.seenBy('T2').round!.pickedBy, {});
  assert.ok(!JSON.stringify(n.seenBy('T2').feed).includes('T1-p1'));
  n.team('T2', 'pick', { playerIds: ['T2-p1'] });
  assert.deepEqual(n.seenBy('T2').round!.picks, { T1: ['T1-p1'], T2: ['T2-p1'] });
  assert.deepEqual(n.tv().round!.pickedBy, { T1: 'T1', T2: 'T2' });
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1 } });
  n.host('startDrinks');
  playRound(n); // round 2
  setMoney(n, 'T2', 1000);
  openBox(n, 'T2', [0]); // Reflect for round 3
  n.host('startDrinks');
  playRound(n);
  assert.equal(n.seenBy('T1').round!.reflectTeamId, null);
  assert.equal(n.tv().round!.reflectTeamId, null);
  assert.deepEqual(n.e().reflects, [{ teamId: 'T2', round: 3 }]);
  n.host('startDrinks');
  assert.equal(n.tv().round!.reflectTeamId, 'T2'); // public once drinks start
  assert.equal(n.seenBy('T1').round!.reflectTeamId, 'T2');
});

test('only the team that holds a Reflect knows it’s coming, and nothing on any other screen gives it away', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 });
  setMoney(n, 'T2', 1000);
  playRound(n);
  n.host('startDrinks');
  playRound(n); // round 2
  openBox(n, 'T2', [0]);
  assert.deepEqual(n.seenBy('T2').pending, [{ kind: 'reflect', round: 3 }]);
  assert.equal(n.seenBy('T2').activeReflect, false);
  assert.equal(row(n.seenBy('T2'), 'T2').reflectUsed, true);
  assert.deepEqual(n.seenBy('T1').pending, []);
  assert.equal(row(n.seenBy('T1'), 'T2').reflectUsed, null);
  assert.equal(row(n.tv(), 'T2').reflectUsed, null);
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params], ['mystery.secret', { teamId: 'T2' }], 'the feed says a box was opened, not what was in it');
  for (const view of [n.seenBy('T1'), n.tv()]) assert.ok(!JSON.stringify(view).includes('reflect"'), 'no Reflect anywhere in what they’re sent');
  n.host('startDrinks');
  playRound(n); // round 3: live for T2, still secret
  assert.equal(n.seenBy('T2').activeReflect, true);
  assert.equal(n.seenBy('T1').activeReflect, false);
  assert.deepEqual(n.seenBy('T2').pending, []);
});

test('a Burner Phone’s sends are anonymous to the TV, the team they hit and the feed; only the hosts and the bar know', () => {
  const n = setup(3);
  playRound(n, { T1: 1, T2: 2, T3: 3 });
  n.team('T1', 'buy', { itemId: 'burner-phone' });
  send(n, 'T1', 'T2', 2);
  // The team it hits sees the order, without the sender.
  const hit = n.seenBy('T2').orders.filter((o) => o.type === 'drink');
  assert.deepEqual(hit.map((o) => [o.fromTeamId, o.targetTeamId, o.qty]), [[null, 'T2', 2]]);
  // A team it has nothing to do with doesn't see the order at all.
  assert.deepEqual(n.seenBy('T3').orders, []);
  // The sender sees its own.
  assert.deepEqual(n.seenBy('T1').orders.filter((o) => o.type === 'drink').map((o) => o.fromTeamId), ['T1']);
  // The TV gets no orders, and nothing it does get names T1 as a sender.
  assert.equal('orders' in n.tv(), false);
  for (const view of [n.tv(), n.seenBy('T2'), n.seenBy('T3')]) {
    assert.ok(view.feed.filter((f) => f.kind === 'drink.sent' || f.kind === 'ghost.bought').every((f) => !JSON.stringify(f.params).includes('T1')));
  }
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  // Only the bar's screen has what to pour and who sent it.
  const mine = n.e().round!.serves[0];
  assert.deepEqual(mine.awards, [{ teamId: 'T1', points: 6 }]);
  assert.deepEqual(mine.breakdown!.map((x) => [x.fromTeamId, x.hidden, x.qty]), [['T1', true, 2]]);
  for (const view of [n.tv(), n.seenBy('T2'), n.seenBy('T1')]) {
    const s = view.round!.serves[0] as Record<string, unknown>;
    assert.equal(s.breakdown, undefined);
    assert.equal(s.awards, undefined);
    assert.equal(s.drinks, 2);
  }
  // The points it scored stay with T1 and the hosts until the act ends.
  assert.equal(row(n.seenBy('T2'), 'T1').points, 0);
  assert.equal(row(n.seenBy('T2'), 'T1').ledger, null);
});

test('a team’s own business stays its own: its ledger, power-ups, bounties and orders', () => {
  const n = setup(3);
  n.host('updateSettings', { roundsPerAct: 1 });
  n.host('adjustPoints', { teamId: 'T1', amount: 40 });
  playRound(n, { T1: 1, T2: 2, T3: 3 });
  n.host('startDrinks');
  playRound(n, { T1: 1, T2: 2, T3: 3 }); // round 2: the Mystery Box is open
  n.team('T1', 'buy', { itemId: 'open-bounty', stake: 25 });
  n.team('T1', 'buy', { itemId: 'eye-spy' });
  openBox(n, 'T1', [0.9]); // a Pickpocket
  send(n, 'T1', 'T2', 1);
  const theirs = row(n.seenBy('T3'), 'T1');
  assert.deepEqual([theirs.ledger, theirs.reflectUsed, theirs.pickpockets], [null, null, null]);
  assert.deepEqual([theirs.money, theirs.drinkStream], [n.money('T1'), 0], 'cash and drink income are public');
  assert.deepEqual(n.seenBy('T3').orders, [], 'an order between two other teams isn’t T3’s to see');
  assert.deepEqual(n.seenBy('T3').bounties, []);
  assert.deepEqual(n.seenBy('T3').pending, []);
  assert.equal(n.seenBy('T3').eyeSpy, null);
  assert.deepEqual(n.seenBy('T2').orders.map((o) => [o.type, o.fromTeamId]), [['drink', 'T1']], 'T2 sees the drink coming, and nothing else T1 bought');
  // T1 sees all of its own.
  const own = n.seenBy('T1');
  assert.equal(row(own, 'T1').pickpockets, 1);
  assert.equal(row(own, 'T1').ledger![0].why, 'purchase');
  assert.deepEqual(own.orders.map((o) => o.type).sort(), ['bounty', 'drink', 'eyespy', 'mystery']);
  assert.deepEqual(own.bounties.map((b) => b.stake), [25]);
  assert.deepEqual(own.pending.map((x) => x.kind).sort(), ['bounty', 'eyespy']);
  // The TV gets none of it: no orders, no bounties, no ledgers, and no stake anywhere.
  const tv = n.tv() as Record<string, unknown>;
  for (const key of ['orders', 'bounties', 'reflects', 'eyeSpy', 'pending', 'standards', 'played']) assert.equal(key in tv, false, key);
  assert.ok(n.tv().teams.every((t) => t.ledger === null && t.pickpockets === null && t.reflectUsed === null && !t.pointsLive));
  assert.ok(!JSON.stringify(tv).includes('"stake"'));
  assert.ok(!JSON.stringify(n.seenBy('T3')).includes('"stake"'));
  // The hosts get everything.
  assert.deepEqual(n.e().bounties.map((b) => [b.teamId, b.stake]), [['T1', 25]]);
  assert.equal(row(n.e(), 'T1').pickpockets, 1);
  assert.equal(n.e().orders.length, n.state.orders.length);
});

test('views carry ids, never names or a roster, and only show a team the shelf it can buy from', () => {
  const n = setup();
  playRound(n);
  for (const view of [n.e(), n.tv(), n.seenBy('T1')] as Record<string, unknown>[]) {
    assert.equal('roster' in view, false);
    assert.equal('members' in view, false);
    assert.ok(!/token|joinCode|passcode/i.test(JSON.stringify(view)));
  }
  assert.deepEqual(n.tv().teams.map((t) => Object.keys(t).sort()), Array(2).fill(['drinkStream', 'earned', 'id', 'ledger', 'money', 'pickpockets', 'points', 'pointsLive', 'reflectUsed']));
  const shelf = (view: { items: { id: string }[] }) => view.items.map((i) => i.id);
  assert.ok(!shelf(n.seenBy('T1')).includes('reflect'), 'off the shelf');
  assert.ok(!shelf(n.seenBy('T1')).includes('mystery-box'), 'not until Act 2');
  assert.ok(!shelf(n.tv()).includes('reflect'));
  assert.ok(shelf(n.e()).includes('reflect') && shelf(n.e()).includes('mystery-box'), 'the hosts see the whole stockroom');
  n.host('updateItem', { itemId: 'wine', active: false });
  assert.ok(!shelf(n.seenBy('T1')).includes('wine'));
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'wine', targetTeamId: 'T2' })), 'item.offShelf');
});

test('a team is told who may play this round for itself only, and who is sitting out for everyone', () => {
  const n = setup();
  const gameId = n.host('addGame', { name: 'Solo', playersNeeded: 1 })!.gameId;
  n.host('startRound', { gameId });
  n.team('T1', 'pick', { playerIds: ['T1-p1'] });
  n.team('T2', 'pick', { playerIds: ['T2-p2'] });
  n.host('toResults');
  assert.deepEqual(n.seenBy('T1').round!.eligible, [], 'nothing to pick once the game is over');
  n.host('enterResults', { placings: { T1: 1, T2: 2 } });
  n.host('startDrinks');
  n.host('startRound', { gameId });
  assert.deepEqual(n.seenBy('T1').round!.eligible, ['T1-p2', 'T1-p3']);
  assert.deepEqual(n.seenBy('T2').round!.eligible, ['T2-p1', 'T2-p3']);
  assert.deepEqual(n.tv().round!.eligible, []);
  assert.deepEqual([...n.tv().round!.cooldown].sort(), ['T1-p1', 'T2-p2']);
  assert.deepEqual(n.seenBy('T1').played, { 'T1-p1': 1, 'T1-p2': 0, 'T1-p3': 0 });
  assert.equal(n.e().played['T2-p2'], 1);
});

test('a big moment flashes on every screen for two minutes, then goes', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1, shopSeconds: 0 });
  setMoney(n, 'T1', 1000);
  playRound(n);
  n.host('startDrinks');
  assert.equal(n.tv().flash, null);
  playRound(n); // Act 2: the Mystery Box arrives
  assert.equal(n.tv().flash!.kind, 'mystery.arrived');
  assert.equal(n.seenBy('T2').flash!.id, n.tv().flash!.id);
  n.wait(119);
  assert.ok(n.e().flash);
  n.wait(2);
  assert.deepEqual([n.tv().flash, n.seenBy('T1').flash, n.e().flash], [null, null, null]);
});

test('every screen is told when the clock next needs a nudge', () => {
  const n = setup();
  const gameId = n.host('addGame', { name: 'Solo', playersNeeded: 1 })!.gameId;
  assert.equal(n.tv().nextDeadline, null);
  n.host('startRound', { gameId });
  assert.equal(n.tv().nextDeadline, n.now + 60000, 'the pick clock');
  n.host('toResults');
  assert.equal(n.seenBy('T1').nextDeadline, null);
  n.host('enterResults', { placings: { T1: 1, T2: 2 } });
  assert.equal(n.e().nextDeadline, n.now + 90000, 'the shop clock');
  send(n, 'T1', 'T2', 1);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  assert.equal(n.tv().nextDeadline, null, 'no clock until the bartender starts it');
  n.bar('barStart', { teamId: 'T2' });
  assert.equal(n.tv().nextDeadline, n.now + 30000, 'the team’s 30 seconds');
});

test('looking never changes anything', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 });
  playRound(n);
  send(n, 'T1', 'T2', 2);
  const before = JSON.stringify(n.state);
  const kept = n.state;
  n.now += 10 * 60 * 1000; // long past the shop clock, but a view is not a tick
  const first = JSON.stringify([n.e(), n.tv(), n.seenBy('T1'), n.seenBy('T2')]);
  assert.equal(JSON.stringify([n.e(), n.tv(), n.seenBy('T1'), n.seenBy('T2')]), first);
  assert.equal(n.state, kept);
  assert.equal(JSON.stringify(n.state), before);
  assert.equal(n.tv().round!.phase, 'spending');
});
