import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteDrinks } from './index';
import { night } from './testkit';

/**
 * Ported from legacy/sss/test/game.test.js: the drink menu, the shop
 * opening and closing, the Mystery Box, Reflect, Eye Spy, the Burner
 * Phone, No Chasers, bounties, and the hosts' rulings (assigned drinks,
 * orders, money and points by hand, the standards tracker).
 */

type Night = ReturnType<typeof night>;

const round = (n: Night) => n.state.rounds[n.state.rounds.length - 1];
const order = (n: Night, id: unknown) => n.state.orders.find((o) => o.id === id)!;
const serve = (n: Night, teamId: string) => round(n).serves.find((s) => s.teamId === teamId)!;
const item = (n: Night, id: string) => n.state.items.find((i) => i.id === id)!;
const drinks = (n: Night) => n.state.orders.filter((o) => o.type === 'drink');

function setMoney(n: Night, teamId: string, to: number) {
  const delta = to - n.money(teamId);
  if (delta) n.host('adjustMoney', { teamId, amount: delta });
}

function setPoints(n: Night, teamId: string, to: number) {
  const delta = to - n.points(teamId);
  if (delta) n.host('adjustPoints', { teamId, amount: delta });
}

/** The legacy tests' table: two teams of three with $200 each, and the shop open as it was by default. */
function setup() {
  const n = night({ teams: 2, size: 3 });
  setMoney(n, 'T1', 200);
  setMoney(n, 'T2', 200);
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

/** Buy something and hand back the order it made. */
function buy(n: Night, teamId: string, itemId: string, args: Record<string, unknown> = {}) {
  return order(n, n.team(teamId, 'buy', { itemId, ...args })!.orderId);
}

const send = (n: Night, from: string, to: string, qty?: number, itemId = 'spirit') => buy(n, from, itemId, { targetTeamId: to, qty });

/** Drinks score when served; hand-deliver every pending drink order. */
function serveAll(n: Night) {
  for (const o of drinks(n).filter((x) => x.status === 'pending')) n.host('resolveOrder', { orderId: o.id, action: 'done' });
}

/** Open a Mystery Box with the dice loaded: each roll inside the box is the next number. */
function openBox(n: Night, teamId: string, rolls: number[]) {
  n.rolls = [...rolls];
  try {
    return n.team(teamId, 'buy', { itemId: 'mystery-box' })!.mystery as Record<string, unknown>;
  } finally {
    n.rolls = [];
  }
}

// ---------- money and points by hand ----------

test('payouts add to money and earned; fines never go below zero', () => {
  const n = night({ teams: 2, size: 1 });
  const start = n.money('T1');
  n.host('adjustMoney', { teamId: 'T1', amount: 10, reason: 'flip cup' });
  assert.equal(n.money('T1'), start + 10);
  assert.equal(n.e().teams.find((t) => t.id === 'T1')!.earned, 10);
  assert.deepEqual(n.state.feed[0].params, { teamId: 'T1', amount: 10, note: 'flip cup' });
  n.host('adjustMoney', { teamId: 'T1', amount: -1000 });
  assert.equal(n.money('T1'), 0);
  assert.equal(n.state.feed[0].kind, 'money.docked');
  assert.equal(n.state.feed[0].params.amount, start + 10, 'the feed says what was actually taken');
  assert.equal(n.e().teams.find((t) => t.id === 'T1')!.earned, 10, 'a fine doesn’t undo what was earned');
  assert.equal(n.refused(() => n.host('adjustMoney', { teamId: 'T1', amount: 0 })), 'amount.zero');
  assert.equal(n.refused(() => n.host('adjustMoney', { teamId: 'T9', amount: 5 })), 'team.unknown');
});

test('hosts can correct points, never below zero', () => {
  const n = setup();
  n.host('adjustPoints', { teamId: 'T1', amount: 3, reason: 'bar mix-up' });
  assert.equal(n.points('T1'), 3);
  n.host('adjustPoints', { teamId: 'T1', amount: -10 });
  assert.equal(n.points('T1'), 0);
  assert.equal(n.refused(() => n.host('adjustPoints', { teamId: 'T1', amount: 0 })), 'amount.zero');
  // The feed says points moved, never how many.
  assert.deepEqual(n.state.feed.slice(0, 2).map((f) => [f.kind, Object.keys(f.params).sort()]), [['points.taken', ['note', 'teamId']], ['points.given', ['note', 'teamId']]]);
});

test('balances are sums over the ledger: every change is a new entry and none is ever edited', () => {
  const n = setup();
  playRound(n);
  send(n, 'T1', 'T2', 5);
  const o = send(n, 'T1', 'T2', 1);
  n.host('resolveOrder', { orderId: o.id, action: 'cancel' });
  const before = structuredClone(n.state.ledger);
  n.host('startDrinks');
  n.drinkUp();
  n.host('adjustPoints', { teamId: 'T1', amount: -100 });
  assert.deepEqual(n.state.ledger.slice(0, before.length), before);
  for (const id of ['T1', 'T2']) {
    const sum = (kind: string) => n.state.ledger.filter((x) => x.teamId === id && x.kind === kind).reduce((a, x) => a + x.delta, 0);
    assert.equal(n.money(id), sum('money'));
    assert.equal(n.points(id), sum('points'));
    assert.ok(sum('points') >= 0);
  }
  assert.deepEqual(n.state.ledger.filter((x) => x.teamId === 'T1' && x.kind === 'money').map((x) => [x.why, x.delta]), [
    ['start', 32], ['host', 168], ['prize', 35], ['purchase', -60], ['purchase', -15], ['refund', 15],
  ]);
});

// ---------- the drink menu ----------

test('cannot overspend or send drinks to yourself; stock runs out', () => {
  const n = setup();
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T1' })), 'target.self');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T9' })), 'team.unknown');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'nope', targetTeamId: 'T2' })), 'item.offShelf');
  setMoney(n, 'T1', 0);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T2' })), 'money.short');
  setMoney(n, 'T1', 100);
  n.host('updateItem', { itemId: 'soju-shot', stock: 1 });
  n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T2' });
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T2' })), 'item.soldOut');
  assert.equal(n.money('T1'), 93);
});

test('drinks cost and score per the menu; bundles are cheaper and score more', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  const step = (itemId: string, qty: number) => {
    const c = n.money('T1');
    const o = send(n, 'T1', 'T2', qty, itemId);
    return { cost: c - n.money('T1'), points: o.points, o };
  };
  const quote = (itemId: string, qty: number) => (({ cost, points }) => ({ cost, points }))(step(itemId, qty));
  assert.deepEqual(quote('spirit', 1), { cost: 15, points: 3 });
  assert.deepEqual(quote('spirit', 3), { cost: 45, points: 9 });
  const five = step('spirit', 5);
  assert.deepEqual([five.cost, five.points, five.o.qty, five.o.name], [60, 17, 5, 'Spirit']);
  assert.deepEqual(quote('mystery-spirit', 10), { cost: 105, points: 35 });
  assert.deepEqual(quote('mystery-cocktail', 5), { cost: 72, points: 22 });
  assert.deepEqual(quote('mystery-cocktail', 10), { cost: 126, points: 46 });
  const bottle = step('soju-bottle', 1);
  assert.deepEqual([bottle.cost, bottle.points, bottle.o.name, bottle.o.qty], [42, 9, 'Soju Bottle', 1], 'a bottle is one bottle at the bar, not 8 shots');
  assert.deepEqual(quote('wine', 5), { cost: 125, points: 20 });
  assert.equal(n.points('T1'), 0); // nothing scores until the drinks are served
  serveAll(n);
  assert.equal(n.points('T1'), 3 + 9 + 17 + 35 + 22 + 46 + 9 + 20);
  assert.equal(n.points('T2'), 0);
  // Drinks go to the team as one order for the bar.
  assert.equal(order(n, five.o.id).status, 'done');
  assert.equal(order(n, five.o.id).targetTeamId, 'T2');
});

test('the price list on its own: a quantity that matches a bundle takes the bundle, anything else is per drink', () => {
  const spirit = item(night(), 'spirit');
  assert.deepEqual(quoteDrinks(spirit, 4), { cost: 60, points: 12, bundle: null });
  assert.deepEqual(quoteDrinks(spirit, 5), { cost: 60, points: 17, bundle: { qty: 5, cost: 60, points: 17 } });
  assert.deepEqual(quoteDrinks(spirit, 6), { cost: 90, points: 18, bundle: null });
});

test('drink orders need 1 to 10 drinks and enough money', () => {
  const n = setup();
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 0 })), 'drink.qty');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 11 })), 'drink.qty');
  setMoney(n, 'T1', 59);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 5 })), 'money.short');
  assert.equal(send(n, 'T1', 'T2').qty, 1); // quantity defaults to 1
});

test('a team’s phone buys for its own team only: the buyer is whoever sent the action, never an argument', () => {
  const n = setup();
  const o = buy(n, 'T1', 'spirit', { targetTeamId: 'T2', teamId: 'T2', fromTeamId: 'T2' });
  assert.equal(o.fromTeamId, 'T1');
  assert.equal(n.money('T1'), 185);
  assert.equal(n.money('T2'), 200);
  assert.equal(n.refused(() => n.host('buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'action.forbidden');
  assert.equal(n.refused(() => n.bar('buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'action.forbidden');
});

// ---------- the hosts and orders ----------

test('cancelling a sent drink refunds the money and scores nothing', () => {
  const n = setup();
  const o = send(n, 'T1', 'T2', 1, 'soju-shot');
  n.host('resolveOrder', { orderId: o.id, action: 'cancel' });
  assert.equal(n.money('T1'), 200);
  assert.equal(n.points('T1'), 0);
  assert.equal(order(n, o.id).status, 'cancelled');
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params.teamId], ['order.cancelled', 'T1']);
});

test('ruling on an order twice is harmless; only a different ruling on a closed order is refused', () => {
  const n = setup();
  const cancelled = send(n, 'T1', 'T2', 1);
  const served = send(n, 'T1', 'T2', 5);
  n.host('resolveOrder', { orderId: cancelled.id, action: 'cancel' });
  n.host('resolveOrder', { orderId: cancelled.id, action: 'cancel' });
  assert.equal(n.money('T1'), 200 - 60, 'refunded once');
  n.host('resolveOrder', { orderId: served.id, action: 'done' });
  n.host('resolveOrder', { orderId: served.id, action: 'done' });
  assert.equal(n.points('T1'), 17, 'scored once');
  assert.equal(n.refused(() => n.host('resolveOrder', { orderId: served.id, action: 'cancel' })), 'order.closed');
  assert.equal(n.refused(() => n.host('resolveOrder', { orderId: cancelled.id, action: 'done' })), 'order.closed');
  assert.equal(n.refused(() => n.host('resolveOrder', { orderId: 'nope', action: 'done' })), 'order.unknown');
  const open = send(n, 'T1', 'T2', 1);
  assert.equal(n.refused(() => n.host('resolveOrder', { orderId: open.id, action: 'enforce' })), 'action.unknown');
});

test('a cancelled drink never reaches the bar, and a hand-delivered one isn’t poured twice', () => {
  const n = setup();
  playRound(n);
  const cancelled = send(n, 'T1', 'T2', 2);
  const byHand = send(n, 'T1', 'T2', 1);
  send(n, 'T2', 'T1', 1);
  n.host('resolveOrder', { orderId: cancelled.id, action: 'cancel' });
  n.host('resolveOrder', { orderId: byHand.id, action: 'done' });
  assert.equal(n.points('T1'), 3);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((s) => [s.teamId, s.drinks]), [['T1', 1]]);
  n.drinkUp();
  assert.equal(n.points('T1'), 3);
  assert.equal(n.points('T2'), 3);
});

test('hosts can drop drinks into the queue before drinks start, and crown the winner', () => {
  const n = setup();
  playRound(n);
  n.host('assignDrinks', { teamId: 'T1', itemId: 'spirit', qty: 2, reason: 'late' });
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((s) => [s.teamId, s.drinks]), [['T1', 2]]);
  assert.equal(n.refused(() => n.host('assignDrinks', { teamId: 'T1', itemId: 'spirit' })), 'assign.queueBuilt');
  setPoints(n, 'T2', 9);
  n.host('crownWinner');
  assert.equal(n.state.winner!.teamId, 'T2');
  assert.equal(n.tv().winner!.teamId, 'T2');
});

test('drinks the hosts assign score nobody, are capped at 10 an order, and wait for the next queue', () => {
  const n = setup();
  assert.equal(n.refused(() => n.host('assignDrinks', { teamId: 'T1', itemId: 'eye-spy' })), 'assign.drink');
  assert.equal(n.refused(() => n.host('assignDrinks', { teamId: 'T9', itemId: 'spirit' })), 'team.unknown');
  n.host('assignDrinks', { teamId: 'T1', itemId: 'wine', qty: 99, reason: 'heckling' }); // before any round
  const o = n.state.orders[0];
  assert.deepEqual([o.qty, o.origin, o.fromTeamId, o.price, o.points, o.round, o.note], [10, 'admin', null, 0, 0, null, 'heckling']);
  assert.deepEqual(n.state.feed[0].params, { toTeamId: 'T1', name: 'Wine', emoji: '🍷', qty: 10, note: 'heckling' });
  playRound(n);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((s) => [s.teamId, s.drinks]), [['T1', 10]]);
  n.bar('barNext', { teamId: 'T1' });
  assert.deepEqual([n.points('T1'), n.points('T2')], [0, 0]);
  assert.deepEqual(serve(n, 'T1').awards, []);
});

test('the hosts see standard drinks sent against the night’s target', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  playRound(n);
  send(n, 'T1', 'T2', 5);
  send(n, 'T1', 'T2', 2, 'wine');
  assert.equal(n.e().standards.sent, 5 + 3);
  assert.equal(n.e().standards.target, 400);
  // Cancelled drinks don't count; assigned ones do.
  n.host('resolveOrder', { orderId: n.state.orders[0].id, action: 'cancel' });
  n.host('assignDrinks', { teamId: 'T1', itemId: 'soju-shot', qty: 2 });
  assert.equal(n.e().standards.sent, 5 + 1.4);
  assert.deepEqual([n.e().standards.rounds, n.e().standards.played], [12, 0]);
});

// ---------- shop open / closed ----------

test('a new night starts with the shop open; it stays open until a host closes it or a round starts', () => {
  // Legacy: settings.shopOpen defaulted to true (game.js:621), so drinks could be sent before round 1.
  const n = night({ teams: 2, size: 3 });
  assert.equal(n.state.shopOpen, true);
  n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T2' });
  assert.equal(n.money('T1'), 32 - 7);
});

test('closing the shop blocks buying until it reopens', () => {
  const n = setup();
  n.host('setShop', { open: 'false' });
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T2' })), 'shop.closed');
  assert.equal(n.money('T1'), 200);
  assert.equal(n.state.feed[0].kind, 'shop.closed');
  n.host('setShop', { open: 'true' });
  assert.equal(n.state.feed[0].kind, 'shop.opened');
  n.host('setShop', { open: true }); // already open: nothing to announce
  assert.equal(n.state.feed.filter((f) => f.kind === 'shop.opened').length, 1);
  send(n, 'T1', 'T2', 1, 'soju-shot');
  serveAll(n);
  assert.equal(n.points('T1'), 1);
});

test('the shop follows the round: shut while the game is on, open for Spending, shut again for drinks', () => {
  const n = setup();
  const gameId = n.host('addGame', { name: 'Solo', playersNeeded: 1 })!.gameId;
  n.host('startRound', { gameId });
  assert.equal(n.state.shopOpen, false);
  n.host('toResults');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'shop.closed');
  n.host('enterResults', { placings: { T1: 1, T2: 2 } });
  assert.equal(n.state.shopOpen, true);
  send(n, 'T1', 'T2', 1);
  n.host('startDrinks');
  assert.equal(n.state.shopOpen, false);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'shop.closed');
});

test('supplies and the stash are gone from the shelf; No Chasers is on it and Reflect is not for sale', () => {
  const n = night();
  const types = new Set(n.state.items.map((i) => i.type));
  for (const t of ['supply', 'deflect', 'bail', 'warp', 'punishment', 'gift']) assert.ok(!types.has(t as never), `${t} gone`);
  const shelf = n.state.items.filter((i) => i.active).map((i) => i.type);
  assert.ok(shelf.includes('nochaser'));
  assert.ok(!shelf.includes('reflect'));
  assert.deepEqual(n.state.items.filter((i) => i.type === 'drink').map((i) => i.name), ['Spirit', 'Mystery Spirit', 'Soju Shot', 'Soju Bottle', 'Wine', 'Mystery Cocktail']);
  assert.equal(item(n, 'wine').std, 1.5);
  assert.ok(n.state.items.filter((i) => i.type === 'bounty').every((i) => i.price === 0));
});

// ---------- Reflect ----------

test('Reflect (won from a Mystery Box) works the round after: drinks bounce back to their senders and score for the reflector', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 }); // round 2 is Act 2, when the Mystery Box opens
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  assert.equal(n.state.items.some((i) => i.type === 'reflect' && i.active), false, 'Reflect is off the shelf');
  playRound(n); // round 1
  assert.equal(n.refused(() => openBox(n, 'T2', [0])), 'item.offShelf');
  n.host('startDrinks');
  n.drinkUp();
  playRound(n); // round 2: T2 opens a box and wins Reflect for round 3
  const out = openBox(n, 'T2', [0]);
  assert.equal(out.kind, 'reflect');
  assert.equal(out.round, 3);
  send(n, 'T1', 'T2', 5);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((x) => x.teamId), ['T2']); // not active yet: T2 drinks
  n.drinkUp();
  const a2 = n.points('T1');
  playRound(n); // round 3: T2's Reflect is live
  const bounced = send(n, 'T1', 'T2', 5);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((x) => x.teamId), ['T1']);
  assert.deepEqual(
    (({ reflected, targetTeamId, originalTargetTeamId, scoresForTeamId }) => ({ reflected, targetTeamId, originalTargetTeamId, scoresForTeamId }))(order(n, bounced.id)),
    { reflected: true, targetTeamId: 'T1', originalTargetTeamId: 'T2', scoresForTeamId: 'T2' },
  );
  assert.deepEqual(n.state.feed.find((f) => f.kind === 'reflect.played')!.params, { teamId: 'T2' });
  const b3 = n.points('T2');
  n.bar('barNext', { teamId: 'T1' });
  assert.equal(n.points('T2') - b3, 17, 'the reflector scores');
  assert.equal(n.points('T1'), a2, 'the sender doesn’t');
  n.bar('barDone', { teamId: 'T1' });
  playRound(n);
  assert.notEqual(openBox(n, 'T2', [0, 0, 0, 0]).kind, 'reflect', 'one Reflect per team per night');
});

test('Reflect bought off the shelf: one a night for a team, one team a round, and it bounces nothing it shouldn’t', () => {
  const n = night({ teams: 3, size: 2 });
  for (const id of ['T1', 'T2', 'T3']) setMoney(n, id, 1000);
  n.host('updateItem', { itemId: 'reflect', active: true }); // a host re-shelves it
  playRound(n, { T1: 1, T2: 2, T3: 3 });
  assert.equal(buy(n, 'T2', 'reflect').status, 'done');
  assert.equal(n.money('T2'), 1000 + 29 - 60);
  assert.deepEqual(n.state.reflects, [{ teamId: 'T2', round: 2 }]);
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params], ['shop.secret', { teamId: 'T2' }], 'the feed doesn’t say what it was');
  assert.equal(n.refused(() => n.team('T3', 'buy', { itemId: 'reflect' })), 'reflect.taken');
  assert.equal(n.refused(() => n.team('T2', 'buy', { itemId: 'reflect' })), 'reflect.used');
  n.host('startDrinks');
  playRound(n, { T1: 1, T2: 2, T3: 3 }); // round 2: T2 reflects
  assert.equal(n.refused(() => n.team('T2', 'buy', { itemId: 'reflect' })), 'reflect.used');
  send(n, 'T1', 'T2', 2); // bounces back to T1
  send(n, 'T3', 'T1', 1); // not aimed at the reflector: lands
  n.host('assignDrinks', { teamId: 'T2', itemId: 'spirit', qty: 1 }); // from the hosts, with nobody to bounce to: T2 drinks it
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((s) => [s.teamId, s.drinks]), [['T2', 1], ['T1', 3]]);
  n.drinkUp();
  assert.deepEqual([n.points('T1'), n.points('T2'), n.points('T3')], [0, 6, 3]);
});

// ---------- Eye Spy ----------

test('Eye Spy opens at the start of the next round and shows who sent what to whom, round by round', () => {
  const n = setup();
  playRound(n);
  send(n, 'T2', 'T1', 3);
  buy(n, 'T1', 'eye-spy');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'eye-spy' })), 'eyespy.one');
  assert.equal(n.seenBy('T1').eyeSpy, null); // not yet
  assert.deepEqual(n.seenBy('T1').pending, [{ kind: 'eyespy', round: 2 }]);
  n.host('startDrinks');
  n.drinkUp();
  n.host('startRound', { gameId: n.host('addGame', { name: 'Next', playersNeeded: 0 })!.gameId });
  assert.deepEqual(n.seenBy('T1').eyeSpy!.rows, [{ round: 1, from: 'T2', to: 'T1', qty: 3 }]);
  assert.equal(n.seenBy('T2').eyeSpy, null);
  assert.deepEqual(n.seenBy('T1').pending, []);
});

test('Eye Spy is a snapshot: drinks sent after it opened don’t show, cancelled ones never do', () => {
  const n = setup();
  setMoney(n, 'T2', 1000);
  playRound(n);
  send(n, 'T2', 'T1', 3);
  const gone = send(n, 'T2', 'T1', 1, 'wine');
  n.host('resolveOrder', { orderId: gone.id, action: 'cancel' });
  buy(n, 'T1', 'eye-spy');
  n.host('startDrinks');
  n.drinkUp();
  n.wait(10);
  playRound(n); // round 2: Eye Spy opens as it starts
  n.wait(10);
  send(n, 'T2', 'T1', 2);
  assert.deepEqual(n.seenBy('T1').eyeSpy!.rows, [{ round: 1, from: 'T2', to: 'T1', qty: 3 }]);
});

// ---------- bounties ----------

test('bounties are staked with points: send 7 in 3 rounds; Open pays 5×, Winner’s 8×; a miss loses the stake and the same again, plus 3 Spirit shots', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  setPoints(n, 'T1', 40);
  setPoints(n, 'T2', 40);
  const bountyOf = (id: string) => n.state.bounties.filter((x) => x.teamId === id).pop()!;
  playRound(n); // round 1: T1 wins
  assert.equal(item(n, 'open-bounty').price, 0, 'bounties cost points, not cash');
  assert.equal(n.refused(() => n.team('T2', 'buy', { itemId: 'winners-bounty', stake: 10 })), 'bounty.winnerOnly');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'winners-bounty', stake: 2 })), 'bounty.stake');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'winners-bounty', stake: 51 })), 'bounty.stake');
  const cash = n.money('T1');
  buy(n, 'T1', 'winners-bounty', { stake: 10 });
  assert.equal(n.points('T1'), 30, 'the stake leaves the score');
  assert.equal(n.money('T1'), cash, 'and costs no cash');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'open-bounty', stake: 5 })), 'bounty.running');
  buy(n, 'T2', 'open-bounty', { stake: 20 });
  assert.equal(n.points('T2'), 20);
  send(n, 'T2', 'T1', 5); // round 1: doesn't count yet
  assert.equal(bountyOf('T2').sent, 0);
  n.host('startDrinks');
  n.drinkUp();
  playRound(n); // round 2
  const startB = n.points('T2');
  send(n, 'T2', 'T1', 5);
  assert.equal(n.points('T2'), startB, '5 drinks isn’t enough any more');
  send(n, 'T2', 'T1', 2); // T2 hits its Open Bounty at 7
  assert.equal(n.points('T2') - startB, 100, '5× the 20 stake');
  const startA = n.points('T1');
  send(n, 'T1', 'T2', 7); // T1 hits the Winner's
  assert.equal(n.points('T1') - startA, 80, '8× the 10 stake');
  assert.equal(bountyOf('T1').status, 'hit');
  n.host('startDrinks');
  n.drinkUp();
  // T1 stakes on an Open Bounty between rounds and sends nothing in rounds 3–5: missed, stake gone, 3 Spirit shots in round 6.
  n.host('setShop', { open: true });
  const beforeStake = n.points('T1');
  buy(n, 'T1', 'open-bounty', { stake: 15 });
  assert.equal(n.points('T1'), beforeStake - 15);
  assert.deepEqual([bountyOf('T1').startRound, bountyOf('T1').deadlineRound], [3, 5]);
  for (let i = 0; i < 3; i++) {
    playRound(n);
    assert.equal(bountyOf('T1').status, 'active');
    n.host('startDrinks');
    n.drinkUp();
  }
  const missed = bountyOf('T1');
  assert.equal(missed.status, 'missed');
  assert.equal(missed.lostExtra, 15, 'a miss takes the stake again');
  assert.equal(n.points('T1'), beforeStake - 30);
  playRound(n);
  n.host('startDrinks');
  const owed = order(n, serve(n, 'T1').orderIds[0]);
  assert.deepEqual([owed.name, owed.qty, owed.origin], ['Spirit', 3, 'penalty']);
});

test('a team can’t stake points it doesn’t have', () => {
  const n = setup();
  setPoints(n, 'T1', 3);
  playRound(n);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'open-bounty', stake: 5 })), 'bounty.short');
});

test('a missed bounty’s extra loss never takes a team below 0 points', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  setPoints(n, 'T1', 10);
  playRound(n);
  buy(n, 'T1', 'open-bounty', { stake: 8 });
  assert.equal(n.points('T1'), 2);
  for (let i = 0; i < 4; i++) {
    n.host('startDrinks');
    n.drinkUp();
    playRound(n);
  }
  assert.equal(n.state.bounties[0].status, 'missed');
  assert.equal(n.state.bounties[0].lostExtra, 2);
  assert.equal(n.points('T1'), 0);
});

test('a bounty’s stake is secret: the feed says one was placed and when it starts, never how much', () => {
  const n = setup();
  setPoints(n, 'T1', 40);
  playRound(n);
  buy(n, 'T1', 'open-bounty', { stake: 25 });
  assert.deepEqual(n.state.feed[0].params, { teamId: 'T1', bounty: 'open', target: 7, rounds: 3, startRound: 2 });
  assert.deepEqual(n.seenBy('T2').bounties, []);
  assert.equal(n.seenBy('T1').bounties[0].stake, 25);
  assert.deepEqual(n.seenBy('T1').pending, [{ kind: 'bounty', round: 2 }]);
  assert.deepEqual(n.tv().bountyRules, { target: 7, rounds: 3, missQty: 3 });
});

// ---------- the Mystery Box ----------

test('a Mystery Box can pour 1–5 random drinks on your own team or another, which score nobody', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 }); // round 2 is Act 2, when the Mystery Box opens
  setMoney(n, 'T1', 1000);
  playRound(n);
  n.host('startDrinks');
  n.drinkUp();
  playRound(n); // round 2
  // rolls: the prize (0.3 → drinks), pick the drink, qty roll 0.99 → 5, then the coin: 0.1 → own team
  const cash = n.money('T1');
  const self = openBox(n, 'T1', [0.3, 0.4, 0.99, 0.1]);
  assert.equal(self.kind, 'self');
  assert.equal(self.qty, 5);
  assert.equal(self.targetTeamId, 'T1');
  assert.ok(['soju-shot', 'spirit', 'mystery-cocktail'].includes(self.itemId as string));
  const other = openBox(n, 'T1', [0.3, 0, 0, 0.9, 0]);
  assert.equal(other.kind, 'other');
  assert.equal(other.qty, 1);
  assert.equal(other.targetTeamId, 'T2');
  assert.equal(cash - n.money('T1'), 60, 'two boxes at $30, and the drinks inside are free');
  const pointsA = n.points('T1');
  n.host('startDrinks');
  assert.equal(serve(n, 'T1').drinks, 5, 'its own box lands on T1');
  assert.equal(serve(n, 'T2').drinks, 1);
  n.drinkUp();
  assert.equal(n.points('T1'), pointsA, 'box drinks score nobody');
});

test('a Mystery Box can hit the rare $80 Jackpot, or a Pickpocket that takes half the cash of a team you pick', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 }); // round 2 is Act 2, when the Mystery Box opens
  setMoney(n, 'T1', 1000);
  playRound(n);
  n.host('startDrinks');
  n.drinkUp();
  playRound(n); // round 2
  // shares with Reflect available (9): reflect ×2, drinks ×4, jackpot, pickpocket ×2
  let cash = n.money('T1');
  const jp = openBox(n, 'T1', [0.7]);
  assert.equal(jp.kind, 'jackpot');
  assert.equal(n.money('T1') - cash, 80 - 30, 'pays $80 on a $30 box');
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params.amount], ['mystery.jackpot', 80]);
  // Pickpocket: rolled now, used whenever the team picks a target.
  const pp = openBox(n, 'T1', [0.9]);
  assert.equal(pp.kind, 'pickpocket');
  assert.equal(n.state.teams.T1.pickpockets, 1);
  assert.equal(n.seenBy('T1').teams.find((t) => t.id === 'T1')!.pickpockets, 1);
  assert.equal(n.seenBy('T2').teams.find((t) => t.id === 'T1')!.pickpockets, null, 'other teams can’t see it');
  assert.equal(n.refused(() => n.team('T2', 'pickpocket', { targetTeamId: 'T1' })), 'pickpocket.none');
  assert.equal(n.refused(() => n.team('T1', 'pickpocket', { targetTeamId: 'T1' })), 'target.self');
  setMoney(n, 'T2', 81);
  cash = n.money('T1');
  const got = n.team('T1', 'pickpocket', { targetTeamId: 'T2' })!;
  assert.equal(got.amount, 40, 'half of $81, rounded down');
  assert.equal(n.money('T2'), 41);
  assert.equal(n.money('T1') - cash, 40);
  assert.equal(n.state.teams.T1.pickpockets, 0);
  assert.equal(n.refused(() => n.team('T1', 'pickpocket', { targetTeamId: 'T2' })), 'pickpocket.none', 'one use each');
  const flash = n.tv().flash!;
  assert.equal(flash.kind, 'pickpocket.done');
  assert.deepEqual(flash.params, { teamId: 'T1', toTeamId: 'T2', amount: 40 }, 'everyone gets told who robbed whom');
  assert.equal(n.seenBy('T2').flash!.params.toTeamId, 'T2');
  // A broke team can't be picked; with nobody to rob the box pays the Jackpot instead.
  openBox(n, 'T1', [0.9]);
  setMoney(n, 'T2', 1);
  assert.equal(n.refused(() => n.team('T1', 'pickpocket', { targetTeamId: 'T2' })), 'pickpocket.broke');
  setMoney(n, 'T2', 0);
  assert.equal(openBox(n, 'T1', [0.9]).kind, 'jackpot');
});

test('Pickpocket comes up more for a team in the bottom half of the standings', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 }); // round 2 is Act 2, when the Mystery Box opens
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  playRound(n);
  n.host('startDrinks');
  n.drinkUp();
  playRound(n); // round 2
  setPoints(n, 'T1', 50);
  setPoints(n, 'T2', 0);
  // Same roll, different odds: the leader has 9 shares, so 0.75 lands on index 6 (Jackpot);
  // the trailing team has 11 (2 extra Pickpockets), so it lands on index 8 (Pickpocket).
  assert.equal(openBox(n, 'T1', [0.75]).kind, 'jackpot');
  assert.equal(openBox(n, 'T2', [0.75, 0]).kind, 'pickpocket');
});

test('the Mystery Box’s odds by shares: Reflect 2, drinks 4, Jackpot 1, Pickpocket 2; no Reflect once the team has had one', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 });
  setMoney(n, 'T1', 5000);
  playRound(n);
  n.host('startDrinks');
  playRound(n); // round 2
  // Count the nine shares by rolling the middle of each.
  const roll = (share: number, of: number) => (share + 0.5) / of;
  const kinds = (of: number) => {
    const out: string[] = [];
    for (let i = 0; i < of; i++) {
      const m = night({ teams: 2, size: 3 });
      m.state = structuredClone(n.state); // every roll starts from the same position
      m.now = n.now;
      out.push(String(openBox(m, 'T1', [roll(i, of), 0, 0, 0]).kind).replace('self', 'drinks'));
    }
    return out.join(' ');
  };
  assert.equal(kinds(9), 'reflect reflect drinks drinks drinks drinks jackpot pickpocket pickpocket');
  openBox(n, 'T1', [0]); // T1 now holds its one Reflect of the night
  assert.equal(n.state.teams.T1.reflectUsed, true);
  assert.equal(kinds(7), 'drinks drinks drinks drinks jackpot pickpocket pickpocket');
});

test('the Mystery Box stays off the shelf until Act 2, which opens with an announcement on every screen', () => {
  const n = setup(); // 3 rounds an act: Act 2 starts at round 4
  setMoney(n, 'T1', 1000);
  for (let i = 1; i <= 3; i++) {
    playRound(n);
    assert.ok(!n.seenBy('T1').items.some((x) => x.type === 'mystery'), `hidden in round ${i}`);
    assert.ok(n.e().items.some((x) => x.type === 'mystery'), 'hosts always see it');
    assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'mystery-box' })), 'item.offShelf');
    n.host('startDrinks');
    n.drinkUp();
  }
  playRound(n); // round 4: Act 2
  assert.ok(n.seenBy('T1').items.some((x) => x.type === 'mystery'));
  assert.equal(n.tv().flash!.kind, 'mystery.arrived');
  assert.deepEqual(n.tv().flash!.params, { price: 30, jackpot: 80 });
  assert.ok(n.state.feed.some((f) => f.kind === 'mystery.arrived'));
  assert.ok(n.e().items.some((x) => x.type === 'mystery'), 'hosts always see it');
});

// ---------- the Burner Phone ----------

test('a Burner Phone hides a team’s sends from when it’s bought to the end of the round, from the TV, the feed, the teams it hits and Eye Spy', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'burner-phone' })), 'ghost.noRound');
  playRound(n);
  send(n, 'T1', 'T2', 2); // sent before buying: stays named
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params.fromTeamId], ['drink.sent', 'T1']);
  const cash = n.money('T1');
  buy(n, 'T1', 'burner-phone');
  assert.equal(cash - n.money('T1'), item(n, 'burner-phone').price);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'burner-phone' })), 'ghost.has');
  send(n, 'T1', 'T2', 3);
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params.fromTeamId], ['drink.sent', null]);
  assert.ok(!n.state.feed.slice(0, 2).some((f) => JSON.stringify(f.params).includes('T1')), 'neither the buy nor the send names T1');
  const seenByB = n.seenBy('T2').orders.filter((o) => o.type === 'drink');
  assert.equal(seenByB.filter((o) => o.fromTeamId === null).length, 1);
  assert.equal(seenByB.filter((o) => o.fromTeamId === 'T1').length, 1, 'the one sent before stays named');
  assert.ok(n.seenBy('T1').orders.filter((o) => o.type === 'drink').every((o) => o.fromTeamId === 'T1'), 'T1 still sees its own');
  assert.ok(n.e().orders.filter((o) => o.type === 'drink').every((o) => o.fromTeamId === 'T1'), 'hosts still know');
  buy(n, 'T2', 'eye-spy'); // T2 will look at the books next round
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  const bd = n.e().round!.serves.find((s) => s.teamId === 'T2')!.breakdown!;
  assert.deepEqual(bd.map((x) => [x.qty, x.hidden]).sort(), [[2, false], [3, true]], 'the bar’s Show senders list marks it too');
  n.drinkUp();
  assert.equal(n.points('T1'), 15, 'anonymous drinks still score (2 + 3 Spirits)');
  // Next round T1 is visible again.
  playRound(n);
  n.wait(1);
  send(n, 'T1', 'T2', 1);
  assert.equal(n.state.feed[0].params.fromTeamId, 'T1');
  assert.equal(n.state.orders[0].hidden, undefined);
  // Eye Spy shows anonymous rows to other teams.
  const rows = n.seenBy('T2').eyeSpy!.rows;
  assert.ok(rows.some((r) => r.from === 'anonymous'));
  assert.ok(rows.some((r) => r.from === 'T1'));
  assert.deepEqual(rows, [{ round: 1, from: 'anonymous', to: 'T2', qty: 3 }, { round: 1, from: 'T1', to: 'T2', qty: 2 }]);
});

// ---------- No Chasers ----------

test('No Chasers: everything the team sends this round is poured neat, including drinks already sent', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'no-chasers' })), 'nochaser.noRound');
  playRound(n);
  send(n, 'T1', 'T2', 2); // before buying: covered too
  buy(n, 'T1', 'no-chasers');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'no-chasers' })), 'nochaser.has');
  send(n, 'T1', 'T2', 3);
  send(n, 'T2', 'T1', 1); // T2's own sends aren't affected
  assert.deepEqual([n.state.feed[2].kind, n.state.feed[2].params.teamId], ['nochaser.bought', 'T1']);
  n.host('startDrinks');
  const serveB = n.tv().round!.serves.find((x) => x.teamId === 'T2')!;
  assert.equal(serveB.neat, 5, 'all 5 of T1’s drinks are neat, and everyone can see it');
  assert.equal(n.tv().round!.serves.find((x) => x.teamId === 'T1')!.neat, 0);
  n.bar('barNext', { teamId: 'T1' });
  n.bar('barNext', { teamId: 'T2' });
  const bd = n.e().round!.serves.find((x) => x.teamId === 'T2')!.breakdown!;
  assert.ok(bd.every((x) => x.noChaser));
  n.drinkUp();
  playRound(n); // next round: back to normal
  send(n, 'T1', 'T2', 1);
  assert.equal(drinks(n)[0].noChaser, undefined);
});

test('No Chasers bought behind a Burner Phone doesn’t give the buyer away', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  playRound(n);
  buy(n, 'T1', 'burner-phone');
  buy(n, 'T1', 'no-chasers');
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params.teamId], ['nochaser.bought', null]);
  const o = send(n, 'T1', 'T2', 1);
  assert.deepEqual([o.hidden, o.noChaser], [true, true]);
});

// ---------- purity ----------

test('a refused purchase changes nothing, and the same purchase with the same dice gives the same night', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 });
  setMoney(n, 'T1', 1000);
  playRound(n);
  n.host('startDrinks');
  playRound(n);
  const before = JSON.stringify(n.state);
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 11 })), 'drink.qty');
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'winners-bounty', stake: 10 })), 'bounty.short');
  assert.equal(JSON.stringify(n.state), before);
  const kept = n.state;
  openBox(n, 'T1', [0.3, 0.4, 0.99, 0.9, 0]);
  const one = JSON.stringify(n.state);
  assert.notEqual(one, before);
  assert.equal(JSON.stringify(kept), before, 'the state passed in is never touched');
  n.state = kept;
  openBox(n, 'T1', [0.3, 0.4, 0.99, 0.9, 0]);
  assert.equal(JSON.stringify(n.state), one);
});
