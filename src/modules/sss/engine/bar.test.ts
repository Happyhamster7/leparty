import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDeadline, tick } from './index';
import { night } from './testkit';

/**
 * Ported from legacy/sss/test/game.test.js: the bar queue, Next, Back,
 * Done, Fail and the timer, drink income, and penalties carrying into
 * the next round. Plus the new guarantees: every bar action names its
 * team, so a double tap can't skip anyone or pay twice.
 */

type Night = ReturnType<typeof night>;

const round = (n: Night) => n.state.rounds[n.state.rounds.length - 1];
const order = (n: Night, id: string) => n.state.orders.find((o) => o.id === id)!;
const serve = (n: Night, teamId: string) => round(n).serves.find((s) => s.teamId === teamId)!;

function setMoney(n: Night, teamId: string, to: number) {
  const delta = to - n.money(teamId);
  if (delta) n.host('adjustMoney', { teamId, amount: delta });
}

function setPoints(n: Night, teamId: string, to: number) {
  const delta = to - n.points(teamId);
  if (delta) n.host('adjustPoints', { teamId, amount: delta });
}

/** The legacy tests' table: two teams of three with $200 each. */
function setup() {
  const n = night({ teams: 2, size: 3 });
  setMoney(n, 'T1', 200);
  setMoney(n, 'T2', 200);
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

const send = (n: Night, from: string, to: string, qty: number, itemId = 'spirit') => n.team(from, 'buy', { itemId, targetTeamId: to, qty });

/** Three rich teams in Spending, ready to send each other drinks. */
function threeTeams() {
  const n = night({ teams: 3, size: 3 });
  for (const id of ['T1', 'T2', 'T3']) setMoney(n, id, 1000);
  playRound(n, { T1: 1, T2: 2, T3: 3 });
  return n;
}

test('the bar: fewest drinks first, Next pays the senders, Back undoes it, Done or the timer finishes a team', () => {
  const n = setup();
  n.host('updateSettings', { roundsPerAct: 1 });
  // A third team with one person on it.
  n.roster.groups.push({ id: 'T3' });
  n.roster.members.push({ id: 'T3-p1', groupId: 'T3' });
  playRound(n);
  send(n, 'T1', 'T2', 5); // T1 → T2: 5 (17 pts)
  send(n, 'T2', 'T3', 1); // T2 → T3: 1 (3 pts)
  n.host('startDrinks');
  assert.equal(n.state.shopOpen, false);
  assert.deepEqual(round(n).serves.map((s) => [s.teamId, s.drinks]), [['T3', 1], ['T2', 5]]);
  n.bar('barNext', { teamId: 'T3' });
  assert.equal(n.points('T2'), 3);
  n.bar('barBack', { teamId: 'T3' });
  assert.equal(n.points('T2'), 0);
  assert.equal(serve(n, 'T3').servedAt, null);
  n.bar('barNext', { teamId: 'T3' });
  n.bar('barDone', { teamId: 'T3' });
  n.bar('barNext', { teamId: 'T2' });
  assert.equal(n.points('T1'), 17);
  assert.equal(round(n).phase, 'drinks');
  n.bar('barStart', { teamId: 'T2' });
  n.wait(31); // T2 runs out of time
  assert.equal(round(n).serves[1].missed, true);
  assert.equal(round(n).serves[1].finishedBy, 'timer');
  assert.equal(round(n).phase, 'done');
  // T2 owes an extra shot of the cheapest drink in the next round's queue.
  playRound(n);
  n.host('startDrinks');
  const pen = serve(n, 'T2');
  assert.equal(pen.drinks, 1);
  assert.equal(order(n, pen.orderIds[0]).origin, 'penalty');
  assert.deepEqual([order(n, pen.orderIds[0]).name, order(n, pen.orderIds[0]).qty], ['Soju Shot', 1]);
});

test('drink income: starts at 0 and grows $4 each round a team finishes in time; running out of time resets it', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  const roundWith = (qty: number) => {
    playRound(n);
    send(n, 'T2', 'T1', qty);
    n.host('startDrinks');
    n.bar('barNext', { teamId: 'T1' });
  };
  assert.equal(n.state.teams.T1.drinkStream, 0);
  roundWith(2);
  let m = n.money('T1');
  n.bar('barDone', { teamId: 'T1' });
  assert.equal(n.money('T1') - m, 4);
  roundWith(3);
  m = n.money('T1');
  n.bar('barDone', { teamId: 'T1' });
  assert.equal(n.money('T1') - m, 8, 'one step more, whatever the drink count');
  roundWith(1);
  m = n.money('T1');
  n.bar('barDone', { teamId: 'T1' });
  assert.equal(n.money('T1') - m, 12);
  roundWith(1);
  n.bar('barStart', { teamId: 'T1' });
  n.wait(31);
  assert.equal(n.state.teams.T1.drinkStream, 0);
  assert.equal(round(n).serves[0].streamLost, 12);
  // Back to the start: the next finish pays one step again.
  roundWith(1);
  m = n.money('T1');
  n.bar('barDone', { teamId: 'T1' });
  assert.equal(n.money('T1') - m, 4);
});

test('couldn’t finish at the bar: lose 10% of points and the drink income, but no extra shot (unlike running out of time)', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  setPoints(n, 'T1', 57);
  n.state.teams.T1.drinkStream = 15; // as if T1 had been finishing in time all night
  playRound(n);
  send(n, 'T2', 'T1', 2);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T1' });
  assert.equal(n.refused(() => n.bar('barFail', { teamId: 'T2' })), 'bar.noServe'); // T2 was never served
  n.bar('barFail', { teamId: 'T1' });
  assert.equal(n.points('T1'), 51, '57 − 6 (10%, rounded)');
  assert.equal(n.state.teams.T1.drinkStream, 0);
  const s = n.e().round!.serves.find((x) => x.teamId === 'T1')!;
  assert.deepEqual([s.failed, s.pointsLost], [true, 6]);
  assert.equal(n.tv().round!.serves.find((x) => x.teamId === 'T1')!.pointsLost, null, 'the room sees that they failed, not how many points it cost');
  assert.equal(n.refused(() => n.bar('barFail', { teamId: 'T1' })), 'round.none'); // that was the last team: the round is over
  assert.equal(n.state.penalties.filter((x) => x.teamId === 'T1').length, 0, 'no extra shot next round');
  const line = n.state.feed.find((f) => f.kind === 'bar.failed')!;
  assert.deepEqual(line.params, { teamId: 'T1', pct: 10, streamLost: 15 }, 'the feed doesn’t give the numbers away');
  // A team with 3 points still loses at least 1.
  playRound(n);
  setPoints(n, 'T1', 3);
  send(n, 'T2', 'T1', 1);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T1' });
  n.bar('barFail', { teamId: 'T1' });
  assert.equal(n.points('T1'), 2);
});

test('a team with no points loses nothing when it can’t finish, and its failure is never an extra shot', () => {
  const n = setup();
  setMoney(n, 'T2', 1000);
  playRound(n);
  send(n, 'T2', 'T1', 1);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T1' });
  n.bar('barFail', { teamId: 'T1' });
  assert.equal(n.points('T1'), 0);
  assert.deepEqual([serve(n, 'T1').failed, serve(n, 'T1').missed, serve(n, 'T1').pointsLost], [true, true, 0]);
  assert.equal(n.state.penalties.length, 0);
  assert.equal(n.state.ledger.filter((x) => x.why === 'bar.failed').length, 0);
});

test('the bartender starts the clock: Next only calls the team up; Start begins its 30 seconds', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  playRound(n);
  send(n, 'T1', 'T2', 2);
  n.host('startDrinks');
  assert.equal(n.refused(() => n.bar('barStart', { teamId: 'T2' })), 'bar.notCalled');
  n.bar('barNext', { teamId: 'T2' });
  assert.equal(round(n).serves[0].timerEndsAt, null, 'no clock yet');
  assert.equal(nextDeadline(n.state, n.roster), null);
  assert.equal(tick(n.state, { ...n.ctx(), now: n.now + 10 * 60 * 1000 }), null, 'nothing can time out before the clock starts');
  assert.ok(!round(n).serves[0].finishedAt);
  n.bar('barStart', { teamId: 'T2' });
  const ends = round(n).serves[0].timerEndsAt!;
  assert.equal(ends, n.now + 30000);
  assert.equal(nextDeadline(n.state, n.roster), ends);
  // A second tap on Start changes nothing: the clock isn't restarted.
  n.wait(5);
  n.bar('barStart', { teamId: 'T2' });
  assert.equal(round(n).serves[0].timerEndsAt, ends);
  n.now = ends + 1;
  n.wait(0);
  assert.equal(round(n).serves[0].missed, true, 'once started, running out of time works as before');
});

test('a penalty carries to the next round’s queue once, as its own order that scores nobody', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  playRound(n);
  send(n, 'T1', 'T2', 2);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barStart', { teamId: 'T2' });
  n.wait(30); // the clock runs out on the dot
  assert.equal(serve(n, 'T2').finishedBy, 'timer');
  assert.deepEqual(n.tv().penaltiesOwed, [{ teamId: 'T2', qty: 1, itemId: 'soju-shot', reason: 'missed_time' }]);
  // Round 2: T1 sends T2 one more; the penalty rides along in the same serve.
  playRound(n);
  send(n, 'T1', 'T2', 1);
  n.host('startDrinks');
  assert.equal(serve(n, 'T2').drinks, 2);
  assert.deepEqual(serve(n, 'T2').orderIds.map((id) => order(n, id).origin).sort(), [null, 'penalty']);
  assert.deepEqual(n.tv().penaltiesOwed, []);
  const before = n.points('T1');
  n.bar('barNext', { teamId: 'T2' });
  assert.equal(n.points('T1') - before, 3, 'only the Spirit T1 paid for scores');
  n.bar('barDone', { teamId: 'T2' });
  // Round 3: nothing left over.
  playRound(n);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves, []);
  assert.equal(round(n).phase, 'done');
});

test('a penalty is poured as the drink that was cheapest when the time ran out', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  playRound(n);
  send(n, 'T1', 'T2', 1);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barStart', { teamId: 'T2' });
  n.wait(31);
  n.host('updateItem', { itemId: 'wine', price: 1 }); // wine is the cheapest from now on
  playRound(n);
  n.host('startDrinks');
  assert.equal(order(n, serve(n, 'T2').orderIds[0]).itemId, 'soju-shot');
});

test('a round with no drinks sent is over the moment the shop closes', () => {
  const n = setup();
  playRound(n);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves, []);
  assert.equal(round(n).phase, 'done');
  assert.deepEqual(n.state.feed.find((f) => f.kind === 'drinks.started')!.params, { order: [] });
  assert.equal(n.refused(() => n.bar('barNext', { teamId: 'T1' })), 'round.none');
});

test('teams owing the same number of drinks line up by the dice', () => {
  const lineUp = (dice: number) => {
    const n = threeTeams();
    send(n, 'T1', 'T2', 2);
    send(n, 'T2', 'T3', 2);
    send(n, 'T3', 'T1', 2);
    n.dice = dice;
    n.host('startDrinks');
    return round(n).serves.map((s) => s.teamId).join(' ');
  };
  assert.notEqual(lineUp(0), lineUp(0.99));
  assert.equal(lineUp(0.4), lineUp(0.4), 'the same dice give the same line');
});

// ---------- new behaviour: every bar action names its team ----------

test('Next only calls the team at the head of the line; tapping it twice pays the senders once', () => {
  const n = threeTeams();
  send(n, 'T1', 'T2', 5);
  send(n, 'T2', 'T3', 1);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((s) => s.teamId), ['T3', 'T2']);
  assert.equal(n.refused(() => n.bar('barNext', { teamId: 'T2' })), 'bar.notNext');
  assert.equal(n.refused(() => n.bar('barNext', { teamId: 'T1' })), 'bar.noServe');
  assert.equal(n.refused(() => n.bar('barNext', {})), 'bar.noServe');
  n.bar('barNext', { teamId: 'T3' });
  const after = n.state;
  n.bar('barNext', { teamId: 'T3' });
  n.bar('barNext', { teamId: 'T3' });
  assert.equal(n.points('T2'), 3, 'paid once');
  assert.deepEqual(n.state.ledger, after.ledger);
  assert.equal(serve(n, 'T2').servedAt, null, 'a double tap doesn’t call the next team up');
  assert.equal(n.state.feed.filter((f) => f.kind === 'bar.called').length, 1);
});

test('Done and Fail tapped twice change nothing the second time', () => {
  const n = threeTeams();
  setPoints(n, 'T2', 50);
  send(n, 'T1', 'T2', 1);
  send(n, 'T1', 'T3', 2);
  send(n, 'T2', 'T1', 3);
  n.host('startDrinks');
  assert.deepEqual(round(n).serves.map((s) => s.teamId), ['T2', 'T3', 'T1']);
  assert.equal(n.refused(() => n.bar('barDone', { teamId: 'T2' })), 'bar.notCalled');
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barDone', { teamId: 'T2' });
  const money = n.money('T2');
  n.bar('barDone', { teamId: 'T2' });
  assert.equal(n.money('T2'), money, 'drink income is paid once');
  assert.equal(n.state.teams.T2.drinkStream, 4);
  n.bar('barFail', { teamId: 'T2' }); // already finished in time: a late Fail is ignored too
  assert.equal(n.points('T2'), 50);
  assert.equal(serve(n, 'T2').failed, false);
  n.bar('barNext', { teamId: 'T3' });
  setPoints(n, 'T3', 40);
  n.bar('barFail', { teamId: 'T3' });
  n.bar('barFail', { teamId: 'T3' });
  assert.equal(n.points('T3'), 36, '10% is taken once');
  assert.equal(round(n).phase, 'drinks', 'T1 is still to come');
});

test('Back only sends back the last team called up, before it has finished; on a team still in line it does nothing', () => {
  const n = threeTeams();
  send(n, 'T1', 'T2', 1);
  send(n, 'T1', 'T3', 2);
  send(n, 'T2', 'T1', 3);
  n.host('startDrinks'); // T2, T3, T1
  const before = n.state;
  n.bar('barBack', { teamId: 'T2' }); // not called up yet
  assert.deepEqual(n.state.rounds, before.rounds);
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barNext', { teamId: 'T3' });
  assert.equal(n.refused(() => n.bar('barBack', { teamId: 'T2' })), 'bar.notLast');
  n.bar('barStart', { teamId: 'T3' });
  n.bar('barBack', { teamId: 'T3' });
  assert.deepEqual([serve(n, 'T3').servedAt, serve(n, 'T3').timerEndsAt, serve(n, 'T3').awards], [null, null, []]);
  assert.ok(serve(n, 'T3').orderIds.every((id) => order(n, id).status === 'pending'));
  assert.equal(n.points('T1'), 3, 'only T2’s serve still counts');
  n.bar('barDone', { teamId: 'T2' });
  assert.equal(n.refused(() => n.bar('barBack', { teamId: 'T2' })), 'bar.finished');
  n.bar('barNext', { teamId: 'T3' });
  assert.equal(n.points('T1'), 3 + 6, 'called up again, paid again, once');
});

test('Back puts the last team still drinking back in line, even when a team called up after it has already finished', () => {
  // Legacy barBack took "the last serve that is served and not finished" (game.js:2863).
  const n = threeTeams();
  send(n, 'T1', 'T2', 1);
  send(n, 'T1', 'T3', 2);
  n.host('startDrinks'); // T2, then T3
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barNext', { teamId: 'T3' });
  n.bar('barDone', { teamId: 'T3' }); // T3 downs theirs first
  assert.equal(n.points('T1'), 3 + 6);
  n.bar('barBack', { teamId: 'T2' }); // T2 is the only team still drinking
  assert.equal(serve(n, 'T2').servedAt, null);
  assert.equal(n.points('T1'), 6, 'the points for T2’s serve come back off');
});

test('undoing a serve never takes the sender below zero points', () => {
  const n = threeTeams();
  send(n, 'T1', 'T2', 1);
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  assert.equal(n.points('T1'), 3);
  n.host('adjustPoints', { teamId: 'T1', amount: -2 }); // a ruling in between
  n.bar('barBack', { teamId: 'T2' });
  assert.equal(n.points('T1'), 0);
  assert.ok(n.state.ledger.filter((x) => x.kind === 'points' && x.teamId === 'T1').reduce((a, x) => a + x.delta, 0) >= 0);
});

test('the host can do everything the bar can; a team’s phone can’t touch the bar', () => {
  const n = threeTeams();
  send(n, 'T1', 'T2', 1);
  n.host('startDrinks');
  for (const type of ['barNext', 'barStart', 'barBack', 'barDone', 'barFail']) {
    assert.equal(n.refused(() => n.team('T2', type, { teamId: 'T2' })), 'action.forbidden', type);
  }
  n.host('barNext', { teamId: 'T2' });
  n.host('barStart', { teamId: 'T2' });
  n.host('barDone', { teamId: 'T2' });
  assert.equal(round(n).phase, 'done');
});
