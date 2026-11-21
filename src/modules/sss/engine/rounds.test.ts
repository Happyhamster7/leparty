import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameError, nextDeadline, registerMechanic, tick } from './index';
import { roundLabel } from '../messages';
import { night } from './testkit';

/**
 * Ported from legacy/sss/test/game.test.js: the round loop, picks,
 * cooldown, results and prizes, the shop clock, the night's setup,
 * act mechanics, the night ending itself, and restart.
 */

type Night = ReturnType<typeof night>;

const round = (n: Night) => n.state.rounds[n.state.rounds.length - 1];

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

const addGame = (n: Night, args: Record<string, unknown>) => n.host('addGame', args)!.gameId as string;

/** A round of a new 1-player game, picks made by the app, taken to Spending. */
function playRound(n: Night, placings: Record<string, number> = { T1: 1, T2: 2 }) {
  n.host('startRound', { gameId: addGame(n, { name: `Game ${n.state.rounds.length + 1}`, playersNeeded: 1 }) });
  n.host('revealPicks');
  n.host('toResults');
  n.host('enterResults', { placings });
  return round(n);
}

/** Start from an empty library, as the legacy tests did. */
function emptyLibrary(n: Night) {
  for (const g of [...n.state.games]) n.host('removeGame', { gameId: g.id });
}

/** The error an action is refused with, parameters included. */
function refusal(fn: () => unknown): GameError {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) return err;
    throw err;
  }
  throw new Error('the action went through');
}

test('a new night opens on the tuned money: $32 to start, the prize ladder, and $4 drink-income steps', () => {
  const n = night();
  assert.equal(n.state.settings.startingBudget, 32);
  assert.deepEqual(n.state.settings.prizeMoney, [35, 29, 24, 20, 17, 14, 12, 9]);
  assert.equal(n.state.settings.streamStep, 4);
  assert.deepEqual(['T1', 'T2', 'T3'].map((id) => n.money(id)), [32, 32, 32]);
});

test('editing a game bumps the briefing version', () => {
  const n = night();
  const gameId = addGame(n, { name: 'Beer Pong', rules: 'Two cups.', playersNeeded: 0 });
  const game = () => n.state.games.find((g) => g.id === gameId)!;
  assert.equal(game().rulesVersion, 1);
  n.host('updateGame', { gameId, rules: 'Two cups.' });
  assert.equal(game().rulesVersion, 1, 'no change, no new pop-up');
  n.host('startRound', { gameId }); // the game goes live
  assert.equal(game().status, 'live');
  const live = game().rulesVersion;
  n.host('updateGame', { gameId, rules: 'Two cups.' });
  assert.equal(game().rulesVersion, live, 'no change, no new pop-up');
  n.host('updateGame', { gameId, rules: 'Three cups.' });
  assert.equal(game().rulesVersion, live + 1);
  assert.equal(n.state.feed[0].kind, 'game.rulesUpdated');
  assert.equal(n.state.feed[0].params.game, 'Beer Pong');
});

test('a round: teams pick players, picks show once every team is in, the shop stays shut', () => {
  const n = setup();
  const gameId = addGame(n, { name: 'Flip cup', playersNeeded: 1 });
  n.host('startRound', { gameId });
  assert.equal(round(n).phase, 'game');
  assert.equal(n.state.shopOpen, false);
  assert.equal(n.refused(() => n.team('T1', 'pick', { playerIds: ['T2-p1'] })), 'picks.ineligible'); // not their team
  assert.equal(n.refused(() => n.team('T1', 'pick', { playerIds: ['T1-p1', 'T1-p2'] })), 'picks.count');
  n.team('T1', 'pick', { playerIds: ['T1-p2'] });
  assert.equal(round(n).revealedAt, null);
  n.team('T2', 'pick', { playerIds: ['T2-p1'] });
  assert.ok(round(n).revealedAt);
  assert.deepEqual(round(n).picks, { T1: ['T1-p2'], T2: ['T2-p1'] });
  assert.equal(n.refused(() => n.host('startRound', { gameId })), 'round.running');
});

test('players who played either of the last two games sit out; auto-pick favours whoever has played least', () => {
  const n = setup();
  const one = addGame(n, { name: 'One', playersNeeded: 1 });
  n.host('startRound', { gameId: one });
  n.team('T1', 'pick', { playerIds: ['T1-p1'] });
  n.team('T2', 'pick', { playerIds: ['T2-p1'] });
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1, T2: 2 } });
  n.host('startDrinks');
  n.host('startRound', { gameId: one });
  assert.equal(n.refused(() => n.team('T1', 'pick', { playerIds: ['T1-p1'] })), 'picks.ineligible');
  // Nobody picks for T1; the deadline passes and the app picks someone who hasn't played.
  n.wait(61);
  assert.ok(round(n).revealedAt);
  assert.equal(round(n).pickedBy.T1, 'auto');
  assert.notEqual(round(n).picks.T1[0], 'T1-p1');
  assert.equal(round(n).picks.T1.length, 1);
});

test('the cooldown covers the last two picked games, and auto-pick takes the least-played player whatever the dice say', () => {
  // Plays four rounds, then leaves round 5 to the app with the dice loaded.
  const autoPick = (dice: number) => {
    const n = setup();
    const one = addGame(n, { name: 'One', playersNeeded: 1 });
    const finish = () => {
      n.host('toResults');
      n.host('enterResults', { placings: { T1: 1, T2: 2 } });
      n.host('startDrinks');
    };
    for (const pick of ['T1-p1', 'T1-p2']) {
      n.host('startRound', { gameId: one });
      n.team('T1', 'pick', { playerIds: [pick] });
      finish();
    }
    n.host('startRound', { gameId: one });
    assert.deepEqual(n.seenBy('T1').round!.eligible, ['T1-p3'], 'p1 and p2 both sit out');
    assert.deepEqual([...n.seenBy('T1').round!.cooldown].filter((id) => id.startsWith('T1')).sort(), ['T1-p1', 'T1-p2']);
    n.team('T1', 'pick', { playerIds: ['T1-p3'] });
    finish();
    // Round 4: p1 is free again (p2 and p3 played the last two).
    n.host('startRound', { gameId: one });
    assert.deepEqual(n.seenBy('T1').round!.eligible, ['T1-p1']);
    finish();
    assert.deepEqual([n.e().played['T1-p1'], n.e().played['T1-p2'], n.e().played['T1-p3']], [2, 1, 1]);
    // With the cooldown off, the app still picks whoever has played least.
    n.host('updateSettings', { cooldownGames: 0 });
    n.host('startRound', { gameId: one });
    assert.equal(n.seenBy('T1').round!.eligible.length, 3);
    n.dice = dice;
    n.wait(61);
    assert.equal(round(n).pickedBy.T1, 'auto');
    return round(n).picks.T1[0];
  };
  for (const dice of [0, 0.5, 0.99]) assert.notEqual(autoPick(dice), 'T1-p1', `dice ${dice}`);
});

test('group games: everyone plays at once and nobody goes on cooldown', () => {
  const n = setup();
  n.host('startRound', { gameId: addGame(n, { name: 'Charades', playersNeeded: 0 }) });
  assert.ok(round(n).revealedAt);
  assert.equal(round(n).picks.T1.length, 3);
  assert.equal(round(n).pickedBy.T1, 'group');
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1 } });
  n.host('startDrinks');
  n.host('startRound', { gameId: addGame(n, { name: 'Solo', playersNeeded: 1 }) });
  assert.equal(n.seenBy('T1').round!.eligible.length, 3);
});

test('results pay prize money by placing, crown the round winner and open the shop', () => {
  const n = setup();
  const r = playRound(n);
  const [first, second] = n.state.settings.prizeMoney;
  assert.equal(n.money('T1'), 200 + first);
  assert.equal(n.money('T2'), 200 + second);
  assert.equal(r.winnerTeamId, 'T1');
  assert.equal(r.phase, 'spending');
  assert.equal(n.state.shopOpen, true);
});

test('results need at least one placing, and can only be entered once', () => {
  const n = setup();
  n.host('startRound', { gameId: addGame(n, { name: 'Flip', playersNeeded: 0 }) });
  assert.equal(n.refused(() => n.host('enterResults', { placings: { T1: 1 } })), 'round.phase');
  n.host('toResults');
  assert.equal(n.refused(() => n.host('enterResults', { placings: {} })), 'results.empty');
  assert.equal(n.refused(() => n.host('enterResults', { placings: { T9: 1 } })), 'results.empty');
  n.host('enterResults', { placings: { T1: 2, T2: 3 } });
  assert.equal(round(n).winnerTeamId, null, 'nobody placed first, so nobody won');
  assert.equal(n.refused(() => n.host('enterResults', { placings: { T1: 1 } })), 'round.phase');
  assert.equal(n.money('T1'), 200 + n.state.settings.prizeMoney[1], 'paid once');
});

test('the night runs 4 acts of 3 rounds, games in schedule order, and stops after Act 4’s final round', () => {
  const n = setup();
  emptyLibrary(n);
  const games = Array.from({ length: 13 }, (_, i) => addGame(n, { name: `G${i + 1}`, playersNeeded: 0 }));
  const labels: string[] = [];
  for (let i = 0; i < 12; i++) {
    n.host('startRound'); // no game given: the next one in the schedule
    assert.equal(round(n).gameId, games[i]);
    labels.push(roundLabel(round(n)));
    n.host('toResults');
    n.host('enterResults', { placings: { T1: 1, T2: 2 } });
    n.host('startDrinks');
  }
  assert.deepEqual(labels.slice(0, 4), ['Act 1 · Round 1', 'Act 1 · Round 2', 'Act 1 · Final round', 'Act 2 · Round 1']);
  assert.equal(labels[11], 'Act 4 · Final round');
  assert.equal(n.refused(() => n.host('startRound')), 'round.last');
  assert.equal(roundLabel(n.tv().round!), 'Act 4 · Final round');
  assert.ok(n.state.feed.some((f) => f.kind === 'act.started' && f.params.act === 3));
  // Hosts can change the shape of the night.
  n.host('updateSettings', { actsCount: 5 });
  n.host('startRound');
  assert.equal(roundLabel(round(n)), 'Act 5 · Round 1');
});

test('setup: name each act, choose a game for every round, confirm; rounds then follow the sequence', () => {
  const n = night({ teams: 1, size: 1 });
  emptyLibrary(n);
  n.host('updateSettings', { actsCount: 2, roundsPerAct: 2 });
  assert.equal(n.state.night.status, 'draft');
  assert.deepEqual(n.state.night.acts.map((a) => a.rounds.length), [2, 2]);
  // A blank name is "Act n", worded outside the engine.
  assert.deepEqual(n.state.night.acts.map((a, i) => a.name || `Act ${i + 1}`), ['Act 1', 'Act 2']);
  const [cup, quiz, chess, dance] = ['Flip cup', 'Trivia', 'Chess', 'Dance'].map((name) => addGame(n, { name, playersNeeded: 0 }));
  n.host('renameAct', { act: 1, name: 'Booking Day' });
  n.host('setSlot', { act: 1, slot: 1, gameId: chess });
  n.host('setSlot', { act: 1, slot: 2, gameId: cup });
  n.host('setSlot', { act: 2, slot: 1, gameId: dance });
  const empty = refusal(() => n.host('confirmNight'));
  assert.equal(empty.code, 'night.emptyRounds');
  assert.equal(empty.params.count, 1);
  n.host('setSlot', { act: 2, slot: 2, gameId: quiz });
  n.host('confirmNight');
  assert.equal(n.state.night.status, 'live');
  assert.deepEqual(n.state.games.map((x) => x.name), ['Chess', 'Flip cup', 'Dance', 'Trivia']);
  // Rounds follow the sequence, labelled by the act's name.
  n.host('startRound');
  assert.deepEqual([round(n).gameName, roundLabel(n.tv().round!)], ['Chess', 'Booking Day · Round 1']);
  assert.equal(n.refused(() => n.host('setSlot', { act: 1, slot: 1, gameId: cup })), 'slot.played');
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1 } });
  n.host('startDrinks');
  n.host('startRound');
  assert.deepEqual([round(n).gameName, roundLabel(n.tv().round!)], ['Flip cup', 'Booking Day · Final round']);
  // Growing the night keeps what's set; shrinking trims.
  n.host('updateSettings', { actsCount: 3 });
  assert.equal(n.state.night.acts[0].name, 'Booking Day');
  assert.equal(n.state.night.acts[2].rounds.length, 2);
  n.host('updateSettings', { actsCount: 1 });
  assert.equal(n.state.night.acts.length, 1);
  assert.deepEqual(n.state.night.acts[0].rounds, [chess, cup]);
});

test('setup refuses acts, rounds and games that don’t exist', () => {
  const n = night();
  const gameId = n.gameId('Flip cup');
  assert.equal(n.refused(() => n.host('setSlot', { act: 9, slot: 1, gameId })), 'act.unknown');
  assert.equal(n.refused(() => n.host('setSlot', { act: 1, slot: 4, gameId })), 'slot.unknown');
  assert.equal(n.refused(() => n.host('setSlot', { act: 1, slot: 1, gameId: 'nope' })), 'game.unknown');
  assert.equal(n.refused(() => n.host('renameAct', { act: 0, name: 'x' })), 'act.unknown');
  n.host('setSlot', { act: 1, slot: 1, gameId });
  n.host('setSlot', { act: 1, slot: 1, gameId: '' });
  assert.equal(n.state.night.acts[0].rounds[0], null, 'a round can be emptied again');
});

test('act mechanics: hooks run only in the acts that switch them on', () => {
  const seen: string[] = [];
  registerMechanic('happyhour', {
    name: 'Happy hour',
    desc: 'Half-price drinks, double points.',
    actStart: (_e, act) => void seen.push(`start ${act.name}`),
    roundStart: (_e, r) => void seen.push(`round ${r.number}`),
    results: (_e, r) => void seen.push(`results ${r.number}`),
    drinksStart: (_e, r) => void seen.push(`drinks ${r.number}`),
    price: (_e, _teamId, item, price) => (item.type === 'drink' ? Math.ceil(price / 2) : price),
    points: (_e, _order, points) => points * 2,
  });
  const n = setup();
  setMoney(n, 'T1', 1000);
  setMoney(n, 'T2', 1000);
  n.host('updateSettings', { actsCount: 2, roundsPerAct: 1 });
  assert.equal(n.refused(() => n.host('setActMechanics', { act: 1, mechanics: ['nope'] })), 'mechanic.unknown');
  n.host('setActMechanics', { act: 2, mechanics: ['happyhour'] });
  n.host('renameAct', { act: 2, name: 'Happy Hour' });
  // Act 1: no mechanics.
  playRound(n);
  const before = n.money('T1');
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 1 });
  assert.equal(before - n.money('T1'), 15);
  n.host('startDrinks');
  n.drinkUp();
  assert.equal(n.points('T1'), 3);
  assert.deepEqual(seen, []);
  // Act 2: Happy hour.
  playRound(n);
  const before2 = n.money('T1');
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 1 });
  assert.equal(before2 - n.money('T1'), 8);
  n.host('startDrinks');
  n.drinkUp();
  assert.equal(n.points('T1'), 3 + 6);
  assert.deepEqual(seen, ['start Happy Hour', 'round 2', 'results 2', 'drinks 2']);
  assert.deepEqual(n.tv().round!.actMechanics, ['Happy hour']);
  assert.equal(n.tv().mechanics.happyhour.name, 'Happy hour');
});

test('deleting a game from the library empties the rounds that used it', () => {
  const n = night();
  n.host('updateSettings', { actsCount: 1, roundsPerAct: 2 });
  const quiz = addGame(n, { name: 'Quiz', playersNeeded: 0 });
  n.host('setSlot', { act: 1, slot: 1, gameId: quiz });
  n.host('setSlot', { act: 1, slot: 2, gameId: quiz });
  n.host('removeGame', { gameId: quiz });
  assert.deepEqual(n.state.night.acts[0].rounds, [null, null]);
});

test('the night ends itself: when the last act’s final round finishes, most points wins', () => {
  const n = setup();
  n.host('updateSettings', { actsCount: 1, roundsPerAct: 2 });
  playRound(n);
  n.host('startDrinks');
  assert.equal(n.state.winner, null); // not after the first round
  playRound(n);
  setPoints(n, 'T2', 12);
  setPoints(n, 'T1', 7);
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 1 });
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  assert.equal(n.state.winner, null); // the bar's still going
  n.bar('barDone', { teamId: 'T2' });
  assert.equal(n.state.winner!.teamId, 'T2'); // T2's 12 beats T1's 7 + 3
  assert.equal(n.tv().winner!.teamId, 'T2');
  assert.equal(n.tv().pointsAsOf, 'end');
  assert.equal(n.refused(() => n.host('startRound')), 'round.last');
});

test('money earned breaks a tie on points, and the hosts can crown someone else or take the crown back', () => {
  const n = setup(); // both topped up by the same amount, so "earned" starts level
  playRound(n, { T1: 2, T2: 1 }); // T2 earns the bigger prize
  n.host('startDrinks');
  n.host('crownWinner');
  assert.equal(n.state.winner!.teamId, 'T2');
  n.host('crownWinner', { teamId: 'T1' });
  assert.equal(n.state.winner!.teamId, 'T1');
  n.host('clearWinner');
  assert.equal(n.state.winner, null);
  assert.equal(n.refused(() => n.host('crownWinner', { teamId: 'T9' })), 'team.unknown');
});

test('the party’s games load into the library once, with how each is run', () => {
  const n = night();
  assert.equal(n.state.games.length, 16, 'a new night already has them');
  emptyLibrary(n);
  addGame(n, { name: 'Flip cup', playersNeeded: 0 });
  assert.equal(n.host('loadStarterGames')!.added, 15);
  assert.equal(n.host('loadStarterGames')!.added, 0);
  const by = Object.fromEntries(n.state.games.map((x) => [x.name, [x.runBy, x.playersNeeded]]));
  assert.deepEqual(by['Is Jason lying?'], ['host', 1]);
  assert.deepEqual(by['Flip 7'], ['host', 1]);
  assert.deepEqual(by['Anime opening guessing'], ['anime', 0]);
  assert.deepEqual(by['Cold War drinking'], ['coldwar', 0]);
  assert.deepEqual(by.Trivia, ['trivia', 0]);
  assert.deepEqual(by['Prisoner’s Dilemma'], ['dilemma', 0]);
  assert.deepEqual(by['Two-Thirds of the Average'], ['twothirds', 0]);
  assert.equal(n.state.games.find((x) => x.runBy === 'dilemma')!.stories, 3, 'three turns by default');
  assert.equal(n.state.games.length, 16);
});

test('ranking and reward are separate: a winner can be awarded less', () => {
  const n = night({ teams: 3, size: 2 });
  n.host('startRound', { gameId: addGame(n, { name: 'Beer pong', playersNeeded: 0 }) });
  n.host('toResults');
  const before = [n.money('T1'), n.money('T2'), n.money('T3')];
  n.host('enterResults', { placings: { T1: 1, T2: 2, T3: 3 }, rewards: { T1: 30, T2: '' } });
  const r = round(n);
  assert.equal(r.winnerTeamId, 'T1', 'still the winner');
  assert.equal(r.prizes.T1, 30, 'awarded less than 1st place’s prize');
  assert.equal(r.prizes.T2, n.state.settings.prizeMoney[1], 'blank reward = the place’s prize');
  assert.equal(r.prizes.T3, n.state.settings.prizeMoney[2]);
  assert.deepEqual([n.money('T1') - before[0], n.money('T2') - before[1]], [30, n.state.settings.prizeMoney[1]]);
  assert.equal(n.e().round!.proposed, null);
});

test('rewards can be zero, and are capped', () => {
  const n = night({ teams: 2, size: 2 });
  n.host('startRound', { gameId: addGame(n, { name: 'Beer pong', playersNeeded: 0 }) });
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1, T2: 2 }, rewards: { T1: 0, T2: 99999 } });
  assert.equal(round(n).prizes.T1, 0);
  assert.equal(round(n).prizes.T2, 1000);
  assert.deepEqual([n.money('T1'), n.money('T2')], [32, 1032]);
});

test('a bonus adds to the place’s prize, and places past the end of the ladder get the last prize', () => {
  const n = night({ teams: 2, size: 2 });
  n.host('updateSettings', { prizeMoney: '50,20' });
  n.host('startRound', { gameId: addGame(n, { name: 'Beer pong', playersNeeded: 0 }) });
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1, T2: 5 }, bonus: { T1: 7 } });
  assert.deepEqual(round(n).prizes, { T1: 57, T2: 20 });
});

test('an act’s final round publishes the standings', () => {
  const n = setup();
  n.host('updateSettings', { actsCount: 2, roundsPerAct: 1 });
  setMoney(n, 'T1', 1000);
  playRound(n);
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 2 });
  const shown = () => n.tv().teams.find((t) => t.id === 'T1')!.points;
  assert.equal(shown(), 0);
  n.host('startDrinks');
  assert.equal(shown(), 0, 'still private while the bar is going');
  n.drinkUp();
  assert.equal(round(n).final, true);
  assert.equal(shown(), n.points('T1'));
  assert.ok(n.points('T1') > 0);
  assert.ok(n.state.feed.some((f) => f.kind === 'points.published'));
});

test('the shop has a 90-second clock: when it runs out the shop closes and drinks start; hosts can add time', () => {
  const n = setup();
  setMoney(n, 'T1', 1000);
  playRound(n);
  assert.equal(round(n).phase, 'spending');
  assert.equal(round(n).shopDeadline, n.now + 90000);
  assert.equal(nextDeadline(n.state, n.roster), round(n).shopDeadline);
  n.host('extendShop', { seconds: 30 });
  const deadline = round(n).shopDeadline!;
  assert.equal(deadline, n.now + 120000);
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 2 });
  assert.equal(tick(n.state, { ...n.ctx(), now: deadline - 1 }), null, 'not yet');
  n.now = deadline + 1;
  n.wait(0);
  assert.equal(round(n).phase, 'drinks');
  assert.equal(n.state.shopOpen, false);
  assert.ok(n.state.feed.some((f) => f.kind === 'shop.timeUp'));
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'shop.closed');
  n.host('updateSettings', { shopSeconds: 0 });
  n.drinkUp();
  assert.equal(playRound(n).shopDeadline, null, '0 = no clock');
  n.host('extendShop', { seconds: 20 });
  assert.equal(round(n).shopDeadline, n.now + 20000, 'adding time starts a clock that wasn’t running');
});

test('an action that arrives after the shop clock ran out lands in the drinks phase, not the shop', () => {
  const n = setup();
  playRound(n);
  n.now += 91000; // nobody ticked; the next action settles the clock first
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'shop.closed');
  n.host('adjustMoney', { teamId: 'T1', amount: 1 });
  assert.equal(round(n).phase, 'done', 'no drinks were sent, so the round is over');
});

test('Restart from round 1 keeps everyone and their teams, and wipes everything that happened', () => {
  const n = setup();
  n.host('updateSettings', { actsCount: 1, roundsPerAct: 2 });
  const game = addGame(n, { name: 'Flip', playersNeeded: 0 });
  n.host('setSlot', { act: 1, slot: 1, gameId: game });
  n.host('setSlot', { act: 1, slot: 2, gameId: game });
  n.host('confirmNight');
  setMoney(n, 'T1', 1000);
  setPoints(n, 'T1', 40);
  playRound(n);
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 2 });
  n.team('T1', 'buy', { itemId: 'open-bounty', stake: 10 });
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barStart', { teamId: 'T2' });
  n.wait(31); // T2 runs out of time: a penalty is owed
  n.host('crownWinner');
  assert.ok(n.state.rounds.length && n.state.bounties.length && n.state.penalties.length && n.state.winner);
  n.host('restart');
  assert.equal(round(n), undefined);
  assert.deepEqual([n.state.rounds.length, n.state.orders.length, n.state.bounties.length, n.state.penalties.length], [0, 0, 0, 0]);
  assert.equal(n.state.winner, null);
  const t1 = n.e().teams.find((t) => t.id === 'T1')!;
  assert.deepEqual([t1.money, t1.points, t1.earned, n.points('T2')], [n.state.settings.startingBudget, 0, 0, 0]);
  assert.equal(n.state.teams.T2.drinkStream, 0);
  assert.equal(n.e().teams.length, 2, 'teams kept');
  assert.equal(Object.keys(n.seenBy('T1').played).length, 3, 'people kept on their teams');
  assert.deepEqual(Object.values(n.e().played), [0, 0, 0, 0, 0, 0], 'nobody has played a game');
  assert.equal(n.state.night.status, 'live', 'the night is still set up');
  assert.deepEqual(n.state.night.acts[0].rounds, [game, game], 'the sequence is kept');
  assert.ok(n.state.games.every((g) => g.status === 'upcoming' && g.results === null));
  assert.equal(n.state.shopOpen, false);
  assert.deepEqual(n.state.feed.map((f) => f.kind), ['night.restarted']);
  n.host('startRound');
  assert.equal(round(n).number, 1, 'the next round is round 1');
  assert.equal(round(n).gameName, 'Flip');
});

// ---------- new behaviour: the roster comes from outside ----------

test('a team first seen in the roster mid-night opens with the starting budget, and joins the next round', () => {
  const n = night({ teams: 2, size: 2 });
  n.host('startRound', { gameId: n.gameId('Flip cup') });
  n.roster.groups.push({ id: 'T3' });
  n.roster.members.push({ id: 'T3-p1', groupId: 'T3' });
  n.host('toResults');
  assert.equal(n.money('T3'), 32);
  assert.equal(round(n).picks.T3, undefined, 'it wasn’t there when this round’s players were set');
  n.host('enterResults', { placings: { T1: 1, T2: 2, T3: 3 } });
  n.host('startDrinks');
  n.host('startRound', { gameId: n.gameId('Chinese dance') });
  assert.deepEqual(round(n).picks.T3, ['T3-p1']);
  assert.equal(n.state.ledger.filter((x) => x.teamId === 'T3' && x.why === 'start').length, 1, 'the budget is granted once');
});

test('someone who is away is not on their team for play; a team with nobody here sits the night out', () => {
  const n = night({ teams: 3, size: 2 });
  n.roster.members.find((m) => m.id === 'T1-p1')!.away = true;
  for (const m of n.roster.members) if (m.groupId === 'T3') m.away = true;
  n.host('startRound', { gameId: n.gameId('Basketball') });
  assert.deepEqual(n.e().teams.map((t) => t.id), ['T1', 'T2']);
  assert.equal(n.refused(() => n.team('T1', 'pick', { playerIds: ['T1-p1'] })), 'picks.ineligible');
  assert.equal(n.refused(() => n.team('T3', 'pick', { playerIds: ['T3-p1'] })), 'team.unknown');
  n.team('T1', 'pick', { playerIds: ['T1-p2'] });
  n.team('T2', 'pick', { playerIds: ['T2-p1'] });
  assert.ok(round(n).revealedAt, 'the two teams that are here are everyone');
  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1, T2: 2, T3: 3 } });
  assert.deepEqual(round(n).placings, { T1: 1, T2: 2 });
});

test('a round can’t start with nobody on a team, or with a game that isn’t in the library', () => {
  const n = night({ teams: 0 });
  assert.equal(n.refused(() => n.host('startRound', { gameId: n.gameId('Flip cup') })), 'round.noTeams');
  const m = night();
  assert.equal(m.refused(() => m.host('startRound', { gameId: 'nope' })), 'round.noGame');
});
