import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from './index';
import { night } from './testkit';
import type { Play } from './types';

/**
 * Ported from legacy/sss/test/game.test.js: the six games the app runs
 * on the team phones (Cold War, Two-Thirds, Trivia, Is Jason lying?,
 * Anime openings, Prisoner's Dilemma), and finishing one by hand.
 */

type Night = ReturnType<typeof night>;

const round = (n: Night) => n.state.rounds[n.state.rounds.length - 1];
const serve = (n: Night, teamId: string) => round(n).serves.find((s) => s.teamId === teamId);

/** Teams of two, one phone each. */
const appSetup = (teams = 4) => night({ teams, size: 2 });

const addGame = (n: Night, args: Record<string, unknown>) => n.host('addGame', args)!.gameId as string;
const game = (n: Night, id: string) => n.state.games.find((g) => g.id === id)!;
const answer = (n: Night, teamId: string, value: unknown) => n.team(teamId, 'answer', { value });

/** The game in progress, as the state holds it. */
function playOf<K extends Play['kind']>(n: Night, kind: K) {
  const pl = round(n).play;
  assert.equal(pl?.kind, kind);
  return pl as Extract<Play, { kind: K }>;
}

/** The game in progress, as one screen is shown it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shown = (view: { round: { play: unknown } | null }) => view.round!.play as Record<string, any>;

function refusal(fn: () => unknown): GameError {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) return err;
    throw err;
  }
  throw new Error('the action went through');
}

// ---------- Cold War ----------

test('Cold War: secret picks, revealed together; the two lowest drink theirs plus the two highest’s; places by number', () => {
  const n = appSetup(5);
  const gameId = addGame(n, { name: 'Cold War', runBy: 'coldwar' });
  assert.equal(game(n, gameId).playersNeeded, 0);
  n.host('startRound', { gameId });
  assert.equal(round(n).play!.kind, 'coldwar');
  assert.equal(n.refused(() => answer(n, 'T1', 16)), 'coldwar.range');
  assert.equal(n.refused(() => answer(n, 'T1', 0)), 'coldwar.range');
  const picks = [15, 3, 9, 1, 12]; // T1 … T5
  picks.slice(0, 4).forEach((v, i) => answer(n, `T${i + 1}`, v));
  // Others can't see the numbers before the reveal; your own team can.
  assert.deepEqual(shown(n.seenBy('T2')).bids.T1, { locked: true });
  assert.equal(shown(n.seenBy('T1')).bids.T1.n, 15);
  assert.deepEqual(shown(n.tv()).bids.T1, { locked: true });
  assert.equal(shown(n.e()).bids.T1.n, 15, 'the hosts see them as they come in');
  assert.equal(shown(n.seenBy('T1')).drinks, null);
  answer(n, 'T5', 12); // the last team locks in: revealed at once
  const pl = playOf(n, 'coldwar');
  assert.equal(pl.revealed, true);
  // Order: T1 15, T5 12, T3 9, T2 3, T4 1. T4 (lowest) takes T1's 15, T2 (second lowest) takes T5's 12.
  assert.deepEqual(pl.drinks, { T1: 0, T5: 0, T3: 9, T2: 3 + 12, T4: 1 + 15 });
  assert.deepEqual(pl.order, ['T1', 'T5', 'T3', 'T2', 'T4']);
  const shots = n.state.orders.filter((o) => o.origin === 'game');
  assert.deepEqual(shots.map((o) => [o.targetTeamId, o.qty]).sort(), [['T2', 15], ['T3', 9], ['T4', 16]]);
  assert.ok(shots.every((o) => o.fromTeamId === null && o.points === 0 && o.price === 0 && o.itemId === 'spirit'));
  assert.equal(n.refused(() => answer(n, 'T1', 5)), 'play.revealed');
  assert.equal(shown(n.seenBy('T2')).bids.T1.n, 15, 'everyone sees them after the reveal');
  n.host('playFinish');
  assert.equal(round(n).phase, 'results', 'the host confirms the rewards');
  n.host('enterResults', { placings: round(n).proposed });
  assert.equal(round(n).phase, 'spending');
  assert.deepEqual(round(n).placings, { T1: 1, T5: 2, T3: 3, T2: 4, T4: 5 });
  assert.equal(round(n).winnerTeamId, 'T1');
  n.host('startDrinks'); // the Cold War shots are in the bar queue
  assert.equal(serve(n, 'T4')!.drinks, 16);
  n.drinkUp();
  assert.ok(['T1', 'T2', 'T3', 'T4', 'T5'].every((id) => n.points(id) === 0), 'game shots score nobody');
});

test('Cold War: teams that don’t pick in time count as 1; two teams means lowest takes the highest’s', () => {
  const n = appSetup(2);
  n.host('startRound', { gameId: addGame(n, { name: 'CW', runBy: 'coldwar' }) });
  answer(n, 'T1', 6);
  n.wait(61);
  const pl = playOf(n, 'coldwar');
  assert.equal(pl.bids.T2.auto, true);
  assert.deepEqual(pl.drinks, { T1: 0, T2: 1 + 6 });
});

test('Cold War: a team can change its number until the reveal; equal numbers rank by who locked in first', () => {
  const n = appSetup(4);
  n.host('startRound', { gameId: n.gameId('Cold War drinking') });
  answer(n, 'T1', 4);
  n.wait(1);
  answer(n, 'T2', 9);
  n.wait(1);
  answer(n, 'T3', 9);
  n.wait(1);
  answer(n, 'T1', 2); // changed its mind
  assert.equal(playOf(n, 'coldwar').revealed, false);
  n.wait(1);
  answer(n, 'T4', 2);
  const pl = playOf(n, 'coldwar');
  // 9s: T2 before T3. 2s: T1 before T4, so T4 ranks lowest and takes the highest's (T2's 9).
  assert.deepEqual(pl.order, ['T2', 'T3', 'T1', 'T4']);
  assert.deepEqual(pl.drinks, { T2: 0, T3: 0, T1: 2 + 9, T4: 2 + 9 });
  n.wait(120); // the pick clock is off once it's revealed: nothing else happens
  assert.equal(round(n).phase, 'game');
});

// ---------- Trivia ----------

test('Trivia: questions from the library, answered on the phones, scored and placed by score then speed', () => {
  const n = appSetup(3);
  const bad = refusal(() => n.host('addGame', { name: 'Bad', runBy: 'trivia', questions: 'Just a question' }));
  assert.deepEqual([bad.code, bad.params.line], ['game.triviaLine', 1]);
  const gameId = addGame(n, { name: 'Quiz', runBy: 'trivia', questions: 'Capital of France? | Paris | Rome | Oslo | A\n2 + 2? | 3 | 4 | 2\nBiggest planet? | Mars | Jupiter | Venus | Earth | Jupiter' });
  assert.deepEqual(game(n, gameId).questions.map((q) => q.answer), [0, 1, 1]);
  n.host('startRound', { gameId });
  assert.equal(n.refused(() => answer(n, 'T1', 0)), 'play.closed');
  n.host('playNext');
  assert.equal(shown(n.seenBy('T1')).question.answer, null); // hidden while asking
  assert.equal(shown(n.tv()).question.answer, null);
  assert.equal(shown(n.e()).question.answer, 0, 'the hosts have the answer');
  answer(n, 'T1', 0); // T1 right
  assert.equal(n.refused(() => answer(n, 'T1', 1)), 'play.answered');
  assert.equal(n.refused(() => answer(n, 'T2', 3)), 'trivia.choice'); // only three answers to this one
  answer(n, 'T2', 2); // T2 wrong
  assert.deepEqual(shown(n.seenBy('T3')).answers, {}, 'nobody sees what the others tapped');
  assert.deepEqual(shown(n.seenBy('T3')).answered.sort(), ['T1', 'T2'], 'only that they have');
  answer(n, 'T3', 0); // T3 right; everyone in: revealed
  assert.equal(playOf(n, 'trivia').state, 'revealed');
  assert.equal(shown(n.tv()).question.answer, 0);
  n.host('playNext');
  answer(n, 'T2', 1); // T2 right
  n.wait(21); // time runs out for the others
  assert.equal(playOf(n, 'trivia').state, 'revealed');
  n.host('playNext');
  answer(n, 'T3', 1); // T3 right
  assert.equal(n.refused(() => n.host('playNext')), 'play.revealFirst');
  n.host('playFinish');
  n.host('enterResults', { placings: round(n).proposed });
  // T3 has 2 right answers, T1 and T2 one each.
  assert.equal(round(n).placings.T3, 1);
  const pl = playOf(n, 'trivia');
  assert.deepEqual([pl.scores.T1, pl.scores.T2, pl.scores.T3], [1, 1, 2]);
  assert.equal(round(n).phase, 'spending');
});

test('Trivia: equal scores place by speed, and a team with no right answer places last', () => {
  const n = appSetup(3);
  n.host('startRound', { gameId: addGame(n, { name: 'Quiz', runBy: 'trivia', questions: 'Q1? | a | b | A\nQ2? | a | b | B' }) });
  n.host('playNext');
  n.wait(5);
  answer(n, 'T2', 0); // right, 5 seconds in
  n.wait(5);
  answer(n, 'T1', 0); // right, 10 seconds in
  answer(n, 'T3', 1); // wrong
  n.host('playNext');
  assert.equal(n.refused(() => n.host('playReveal')), null, 'the host can reveal early');
  assert.equal(n.refused(() => n.host('playReveal')), 'play.closed');
  assert.equal(n.refused(() => n.host('playNext')), 'play.wasLast');
  n.host('playFinish');
  assert.deepEqual(round(n).proposed, { T2: 1, T1: 2, T3: 3 });
  assert.equal(n.refused(() => n.host('playNext')), 'round.phase');
});

test('Trivia and Anime openings can’t start until their questions are written', () => {
  const n = appSetup(2);
  assert.equal(n.refused(() => n.host('startRound', { gameId: n.gameId('Trivia') })), 'game.noQuestions');
  assert.equal(n.refused(() => n.host('startRound', { gameId: n.gameId('Anime opening guessing') })), 'game.noOpenings');
  assert.equal(n.refused(() => n.host('addGame', { name: 'Odd', runBy: 'bingo' })), 'game.kind');
  n.host('updateGame', { gameId: n.gameId('Trivia'), questions: 'Q? | yes | no | yes' });
  n.host('startRound', { gameId: n.gameId('Trivia') });
  assert.equal(round(n).play!.kind, 'trivia');
});

// ---------- Is Jason lying? ----------

test('Is Jason lying?: phones vote Truth or Lie, the host says which it was, right teams score', () => {
  const n = appSetup(3);
  n.host('startRound', { gameId: addGame(n, { name: 'Is he lying?', runBy: 'lying', stories: 2 }) });
  n.host('playNext');
  answer(n, 'T1', 'lie');
  answer(n, 'T2', 'truth');
  assert.equal(n.refused(() => answer(n, 'T3', 'maybe')), 'lying.choice');
  assert.deepEqual(shown(n.seenBy('T3')).votes, {}); // others' votes are hidden
  assert.deepEqual(shown(n.seenBy('T1')).votes.T1.choice, 'lie');
  assert.equal(n.refused(() => n.host('playNext')), 'play.revealFirst');
  assert.equal(n.refused(() => n.host('playReveal', {})), 'lying.truth');
  n.host('playReveal', { truth: 'lie' });
  assert.equal(playOf(n, 'lying').scores.T1, 1);
  assert.deepEqual(n.state.feed[0].params, { n: 1, truth: 'lie', right: 1 });
  assert.equal(shown(n.tv()).truth, 'lie');
  n.host('playNext');
  assert.equal(shown(n.tv()).truth, null, 'the next story’s answer isn’t out yet');
  answer(n, 'T3', 'truth');
  n.wait(31); // voting closes; still waiting on the host
  assert.equal(playOf(n, 'lying').state, 'closed');
  assert.equal(n.refused(() => answer(n, 'T1', 'truth')), 'play.closed');
  assert.equal(n.refused(() => n.host('playFinish')), 'play.revealFirst');
  n.host('playReveal', { truth: 'truth' });
  assert.equal(n.refused(() => n.host('playNext')), 'play.wasLast');
  n.host('playFinish');
  assert.equal(Object.keys(round(n).proposed!).length, 3);
  n.host('enterResults', { placings: round(n).proposed });
  assert.equal(round(n).phase, 'spending');
  assert.equal(Object.keys(round(n).placings).length, 3);
});

test('Is Jason lying?: voting closes as soon as every team has voted', () => {
  const n = appSetup(2);
  n.host('startRound', { gameId: addGame(n, { name: 'Is he lying?', runBy: 'lying', stories: 1 }) });
  n.host('playNext');
  answer(n, 'T1', 'lie');
  assert.equal(playOf(n, 'lying').state, 'voting');
  answer(n, 'T2', 'lie');
  assert.equal(playOf(n, 'lying').state, 'closed');
});

// ---------- finishing by hand ----------

test('an app-run game can still be finished by hand', () => {
  const n = appSetup(2);
  n.host('startRound', { gameId: addGame(n, { name: 'Quiz', runBy: 'trivia', questions: 'Q? | a | b | A' }) });
  n.host('toResults');
  n.host('enterResults', { placings: { T2: 1, T1: 2 } });
  assert.equal(round(n).winnerTeamId, 'T2');
});

test('an app-run game ranks the teams and then waits for the host: nothing is paid until the results are confirmed', () => {
  const n = appSetup(3);
  n.host('startRound', { gameId: n.gameId('Cold War drinking') });
  answer(n, 'T1', 3);
  answer(n, 'T2', 7);
  answer(n, 'T3', 5);
  n.host('playFinish');
  assert.deepEqual(round(n).proposed, { T2: 1, T3: 2, T1: 3 });
  assert.deepEqual(['T1', 'T2', 'T3'].map((id) => n.money(id)), [32, 32, 32]);
  assert.deepEqual(n.e().round!.proposed, { T2: 1, T3: 2, T1: 3 });
  assert.equal(n.tv().round!.proposed, null, 'only the hosts see the suggestion');
  assert.equal(n.seenBy('T1').round!.proposed, null);
  assert.equal(n.state.feed[0].kind, 'play.finished');
  // The host overrules the app.
  n.host('enterResults', { placings: { T1: 1, T2: 2, T3: 3 } });
  assert.equal(round(n).winnerTeamId, 'T1');
  assert.equal(round(n).proposed, null);
  assert.equal(n.money('T1'), 32 + 35);
});

test('games the hosts run have no app steps', () => {
  const n = appSetup(2);
  n.host('startRound', { gameId: n.gameId('Flip cup') });
  assert.equal(n.refused(() => answer(n, 'T1', 3)), 'play.none');
  assert.equal(n.refused(() => n.host('playNext')), 'play.none');
  assert.equal(n.refused(() => n.host('playFinish')), 'play.none');
  const m = appSetup(2);
  m.host('startRound', { gameId: m.gameId('Cold War drinking') });
  assert.equal(m.refused(() => m.host('playNext')), 'play.noNext');
});

// ---------- Anime openings ----------

test('Anime openings: teams type the anime; only the first right answer scores; typos and alternate names count', () => {
  const n = appSetup(3);
  const gameId = addGame(n, { name: 'Openings', runBy: 'anime', openings: 'Opening 1 | Attack on Titan | Shingeki no Kyojin | AoT\nOpening 2 | Naruto\nOpening 3 | My Hero Academia' });
  assert.equal(game(n, gameId).openings.length, 3);
  n.host('startRound', { gameId });
  assert.equal(n.refused(() => answer(n, 'T1', 'Naruto')), 'play.closed');
  n.host('playNext');
  assert.equal(shown(n.seenBy('T1')).answer, null); // hidden while it plays
  assert.equal(shown(n.tv()).answer, null);
  assert.equal(shown(n.tv()).accepted, null);
  assert.deepEqual(shown(n.e()).accepted, ['Attack on Titan', 'Shingeki no Kyojin', 'AoT']);
  assert.deepEqual(answer(n, 'T1', 'Bleach'), { correct: false });
  assert.deepEqual(answer(n, 'T1', 'Bleach'), { correct: false }); // guess again as often as you like
  assert.equal(shown(n.seenBy('T1')).myTries, 2);
  assert.equal(shown(n.seenBy('T2')).myTries, 0);
  assert.equal(n.refused(() => answer(n, 'T1', '   ')), 'anime.blank');
  assert.deepEqual(answer(n, 'T2', 'attack on titen!'), { correct: true }); // one typo forgiven
  assert.equal(playOf(n, 'anime').state, 'won');
  assert.equal(n.refused(() => answer(n, 'T3', 'AoT')), 'play.closed'); // closed for everyone
  assert.equal(shown(n.tv()).answer, 'Attack on Titan');
  assert.equal(shown(n.tv()).winner, 'T2');
  n.host('playNext');
  answer(n, 'T3', 'NARUTO');
  n.host('playNext');
  n.wait(61); // nobody gets opening 3
  assert.equal(playOf(n, 'anime').state, 'missed');
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params], ['anime.timeUp', { n: 3, answer: 'My Hero Academia' }]);
  n.host('playFinish');
  n.host('enterResults', { placings: round(n).proposed });
  assert.equal(round(n).phase, 'spending');
  const pl = playOf(n, 'anime');
  assert.deepEqual([pl.scores.T2, pl.scores.T3, pl.scores.T1 || 0], [1, 1, 0]);
  assert.equal(round(n).placings.T1, 3);
});

test('Anime openings: an alternate name wins it, and the next opening can’t start while one is still playing', () => {
  const n = appSetup(2);
  n.host('startRound', { gameId: addGame(n, { name: 'Openings', runBy: 'anime', openings: 'O1 | Attack on Titan | Shingeki no Kyojin | AoT\nO2 | Naruto' }) });
  n.host('playNext');
  assert.equal(n.refused(() => n.host('playNext')), 'play.revealFirst');
  assert.deepEqual(answer(n, 'T1', 'aot'), { correct: true });
  assert.equal(playOf(n, 'anime').winners[0], 'T1');
  n.host('playNext');
  assert.deepEqual(answer(n, 'T2', 'Narutoo'), { correct: true }, 'six letters or more forgive one slip');
  assert.equal(n.refused(() => n.host('playNext')), 'play.wasLast');
});

test('Anime openings: hosts can give a near-miss to a team, or call nobody', () => {
  const n = appSetup(2);
  n.host('startRound', { gameId: addGame(n, { name: 'Openings', runBy: 'anime', openings: 'O1 | Spy x Family\nO2 | Bleach' }) });
  const bad = refusal(() => n.host('addGame', { name: 'Bad', runBy: 'anime', openings: 'Just a label' }));
  assert.deepEqual([bad.code, bad.params.line], ['game.openingLine', 1]);
  n.host('playNext');
  n.host('playReveal', { teamId: 'T2' });
  assert.equal(playOf(n, 'anime').winners[0], 'T2');
  assert.equal(playOf(n, 'anime').scores.T2, 1);
  n.host('playNext');
  n.host('playReveal', {});
  assert.equal(playOf(n, 'anime').state, 'missed');
  assert.deepEqual([n.state.feed[0].kind, n.state.feed[0].params], ['anime.nobody', { n: 2, answer: 'Bleach' }]);
  assert.equal(n.refused(() => n.host('playReveal', {})), 'play.closed');
});

// ---------- Two-Thirds of the Average ----------

test('Two-Thirds of the Average: closest to ⅔ of the average wins; ties to the first to lock in; no-shows last; the furthest drinks', () => {
  const n = appSetup(5);
  n.host('startRound', { gameId: addGame(n, { name: 'Two-Thirds', runBy: 'twothirds' }) });
  assert.equal(n.refused(() => answer(n, 'T1', 101)), 'twothirds.range');
  assert.equal(n.refused(() => answer(n, 'T1', 2.5)), 'twothirds.range');
  answer(n, 'T1', 50);
  assert.equal(n.refused(() => answer(n, 'T1', 20)), 'play.answered');
  assert.deepEqual(shown(n.seenBy('T2')).picks.T1, { locked: true }, 'picks stay secret');
  assert.equal(shown(n.seenBy('T1')).picks.T1.n, 50);
  assert.equal(shown(n.seenBy('T2')).target, null);
  answer(n, 'T2', 30);
  answer(n, 'T3', 20);
  answer(n, 'T4', 100);
  // T5 never picks: the clock runs out
  n.wait(61);
  const pl = playOf(n, 'twothirds');
  assert.equal(pl.revealed, true);
  assert.equal(pl.average, 50, 'the average counts only the teams that picked');
  assert.equal(pl.target, 33.3);
  assert.deepEqual(pl.order, ['T2', 'T3', 'T1', 'T4', 'T5']);
  assert.deepEqual(pl.missed, ['T5']);
  assert.equal(pl.drinks!.T4, 7, '100 is 66.7 off: 7 shots');
  assert.equal(pl.drinks!.T5, 1, 'didn’t pick: 1 shot');
  assert.deepEqual(n.state.feed[0].params, { average: 50, target: 33.3, closest: 'T2', closestPick: 30, furthest: 'T4', furthestDrinks: 7 });
  n.host('playFinish');
  assert.equal(round(n).phase, 'results');
  assert.deepEqual(round(n).proposed, { T2: 1, T3: 2, T1: 3, T4: 4, T5: 5 });
  n.host('enterResults', { placings: round(n).proposed });
  n.host('startDrinks');
  assert.equal(serve(n, 'T4')!.drinks, 7);
  assert.equal(serve(n, 'T5')!.drinks, 1);
  assert.equal(serve(n, 'T2'), undefined);
});

test('Two-Thirds: a tie goes to the team that locked in first', () => {
  const n = appSetup(3);
  n.host('startRound', { gameId: addGame(n, { name: 'Two-Thirds', runBy: 'twothirds' }) });
  answer(n, 'T3', 10);
  n.wait(1); // T3 locked in a second earlier
  answer(n, 'T1', 10);
  answer(n, 'T2', 40); // all in: reveals. avg 20 → target 13.3
  assert.deepEqual(playOf(n, 'twothirds').order, ['T3', 'T1', 'T2']);
  assert.equal(playOf(n, 'twothirds').target, 13.3);
});

test('Two-Thirds: with nobody picking, everyone ranks by the dice and drinks one', () => {
  const n = appSetup(3);
  n.host('startRound', { gameId: n.gameId('Two-Thirds of the Average') });
  n.host('playFinish');
  const pl = playOf(n, 'twothirds');
  assert.deepEqual([pl.average, pl.target], [0, 0]);
  assert.deepEqual([...pl.order!].sort(), ['T1', 'T2', 'T3']);
  assert.deepEqual(pl.drinks, { T1: 1, T2: 1, T3: 1 });
  assert.equal(n.state.feed.find((f) => f.kind === 'twothirds.revealed')!.params.closest, null);
});

// ---------- Prisoner's Dilemma ----------

test('Prisoner’s Dilemma: fixed pairs, secret picks, the payoff table, no-shows stay silent, and the ranking', () => {
  const n = appSetup(4);
  n.host('startRound', { gameId: addGame(n, { name: 'PD', runBy: 'dilemma', stories: 2 }) });
  assert.equal(playOf(n, 'dilemma').pairs.length, 2);
  assert.equal(playOf(n, 'dilemma').total, 2);
  const [[a, b], [c, d]] = playOf(n, 'dilemma').pairs;
  assert.deepEqual([a, b, c, d].sort(), ['T1', 'T2', 'T3', 'T4']);
  const scores = () => [a, b, c, d].map((id) => playOf(n, 'dilemma').scores[id]);
  const shots = () => [a, b, c, d].map((id) => playOf(n, 'dilemma').shots[id]);
  assert.equal(n.refused(() => answer(n, a, 'silent')), 'play.closed');
  n.host('playNext'); // turn 1
  assert.equal(n.refused(() => answer(n, a, 'maybe')), 'dilemma.choice');
  answer(n, a, 'silent');
  assert.equal(n.refused(() => answer(n, a, 'snitch')), 'play.answered');
  assert.ok(!shown(n.seenBy(b)).results[1], 'nothing shows while the turn is open');
  assert.equal(shown(n.seenBy(b)).partner, a);
  assert.deepEqual(shown(n.seenBy(b)).picked, [a], 'only that the other side has picked');
  assert.equal(shown(n.seenBy(b)).mine, null);
  assert.equal(shown(n.seenBy(a)).mine, 'silent');
  assert.equal(shown(n.seenBy(b)).live, null);
  assert.equal(shown(n.e()).live[a].choice, 'silent', 'the hosts watch it live');
  answer(n, b, 'snitch');
  answer(n, c, 'snitch');
  answer(n, d, 'snitch'); // everyone in: resolves
  assert.equal(playOf(n, 'dilemma').state, 'revealed');
  assert.deepEqual(scores(), [0, 5, 1, 1]);
  assert.deepEqual(shots(), [5, 0, 3, 3]);
  assert.deepEqual(shown(n.seenBy(b)).results[1][a], { choice: 'silent', auto: false, pts: 0, shots: 5, vs: b, theirs: 'snitch' });
  n.host('playNext'); // turn 2: a and b both silent, c silent, d never picks (counts as silent)
  answer(n, a, 'silent');
  answer(n, b, 'silent');
  answer(n, c, 'silent');
  n.wait(31);
  assert.equal(playOf(n, 'dilemma').results[2][d].auto, true);
  assert.deepEqual(scores(), [3, 8, 4, 4]);
  assert.deepEqual(shots(), [6, 1, 4, 4]);
  assert.equal(n.refused(() => n.host('playNext')), 'play.wasLast');
  n.host('playFinish');
  // b 8 pts; c and d tie on 4 points and 4 shots; a 3 points last
  assert.equal(round(n).proposed![b], 1);
  assert.equal(round(n).proposed![a], 4);
  n.host('enterResults', { placings: round(n).proposed });
  n.host('startDrinks');
  assert.equal(serve(n, a)!.drinks, 6, 'the turn shots go to the bar');
  assert.equal(serve(n, b)?.drinks, 1);
});

test('Prisoner’s Dilemma: with an odd number of teams, the spare one plays the House', () => {
  const n = appSetup(3);
  n.host('startRound', { gameId: addGame(n, { name: 'PD', runBy: 'dilemma' }) });
  assert.equal(playOf(n, 'dilemma').pairs.filter((p) => p.includes('house')).length, 1);
  n.host('playNext');
  for (const id of ['T1', 'T2', 'T3']) answer(n, id, 'snitch');
  assert.equal(playOf(n, 'dilemma').state, 'revealed');
  assert.equal(Object.keys(playOf(n, 'dilemma').results[1]).length, 3, 'the House isn’t scored');
});

test('Prisoner’s Dilemma: the House picks by the dice, the pairs are drawn by the dice, and the host can close a turn early', () => {
  const pairsWith = (dice: number) => {
    const n = appSetup(3);
    n.dice = dice;
    n.host('startRound', { gameId: n.gameId('Prisoner’s Dilemma') });
    return n;
  };
  assert.notDeepEqual(playOf(pairsWith(0), 'dilemma').pairs, playOf(pairsWith(0.99), 'dilemma').pairs);
  const n = pairsWith(0.99); // no swaps: T1 v T2, T3 v the House
  assert.deepEqual(playOf(n, 'dilemma').pairs, [['T1', 'T2'], ['T3', 'house']]);
  assert.equal(playOf(n, 'dilemma').total, 3, 'three turns by default');
  assert.equal(shown(n.seenBy('T3')).partner, 'house');
  n.host('playNext');
  answer(n, 'T3', 'silent');
  n.dice = 0.9; // the House snitches
  n.host('playReveal'); // T1 and T2 never picked: silent
  const res = playOf(n, 'dilemma').results[1];
  assert.deepEqual([res.T3.theirs, res.T3.pts, res.T3.shots], ['snitch', 0, 5]);
  assert.deepEqual([res.T1.auto, res.T1.pts, res.T2.auto, res.T2.pts], [true, 3, true, 3]);
  assert.equal(n.refused(() => n.host('playReveal')), 'play.closed');
  n.host('playNext');
  answer(n, 'T3', 'snitch');
  n.dice = 0.1; // the House stays silent
  n.host('playReveal');
  assert.deepEqual([playOf(n, 'dilemma').results[2].T3.pts, playOf(n, 'dilemma').results[2].T3.shots], [5, 0]);
  // Finishing early places by points, fewer shots breaking the tie: T1 and T2 6 points and 2 shots each, T3 5 points.
  n.host('playFinish');
  assert.equal(round(n).proposed!.T3, 3);
  n.host('enterResults', { placings: round(n).proposed });
  n.host('startDrinks');
  assert.deepEqual(['T1', 'T2', 'T3'].map((id) => serve(n, id)!.drinks), [2, 2, 5]);
});
