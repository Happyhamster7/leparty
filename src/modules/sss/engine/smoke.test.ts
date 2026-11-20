import { test } from 'node:test';
import assert from 'node:assert/strict';
import { night } from './testkit';

test('a whole round: pick, results, spend, the bar, and the money and points that follow', () => {
  const n = night();
  assert.equal(n.money('T1'), 32, 'every team opens with the starting budget');

  n.host('startRound', { gameId: n.gameId('Basketball') });
  assert.equal(n.refused(() => n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 1 })), 'shop.closed');
  n.team('T1', 'pick', { playerIds: ['T1-p1'] });
  n.team('T2', 'pick', { playerIds: ['T2-p2'] });
  assert.deepEqual(n.seenBy('T1').round!.picks, { T1: ['T1-p1'] }, 'other teams’ picks stay secret');
  n.team('T3', 'pick', { playerIds: ['T3-p3'] });
  assert.ok(n.state.rounds[0].revealedAt, 'the last pick reveals them all');

  n.host('toResults');
  n.host('enterResults', { placings: { T1: 1, T2: 2, T3: 3 } });
  assert.deepEqual([n.money('T1'), n.money('T2'), n.money('T3')], [67, 61, 56]);

  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 2 });
  assert.equal(n.money('T1'), 37);
  assert.equal(n.points('T1'), 0, 'drinks score when served, not when bought');

  n.host('startDrinks');
  assert.deepEqual(n.state.rounds[0].serves.map((s) => s.teamId), ['T2']);
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barNext', { teamId: 'T2' }); // a double tap
  assert.equal(n.points('T1'), 6, 'paid once, however many times Next is tapped');
  n.bar('barStart', { teamId: 'T2' });
  n.bar('barDone', { teamId: 'T2' });
  assert.equal(n.money('T2'), 65, 'finishing in time pays the first step of drink income');
  assert.equal(n.state.rounds[0].phase, 'done');
});

test('roles: the bar can’t run the round, a team can’t act for another, and the host can do the bar’s job', () => {
  const n = night();
  assert.equal(n.refused(() => n.bar('startRound')), 'action.forbidden');
  assert.equal(n.refused(() => n.team('T1', 'adjustPoints', { teamId: 'T1', amount: 50 })), 'action.forbidden');
  assert.equal(n.refused(() => n.host('buy', { itemId: 'spirit', targetTeamId: 'T2' })), 'action.forbidden');
  assert.equal(n.refused(() => n.team('T9', 'pick', { playerIds: [] })), 'team.unknown');
  n.toSpending({ T1: 1, T2: 2, T3: 3 });
  n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T3', qty: 1 });
  n.host('startDrinks');
  n.host('barNext', { teamId: 'T3' });
  assert.equal(n.points('T1'), 1);
});

test('reduce is pure: the state passed in is never changed', () => {
  const n = night();
  const before = JSON.stringify(n.state);
  const kept = n.state;
  n.host('startRound', { gameId: n.gameId('Flip cup') });
  assert.equal(JSON.stringify(kept), before);
  assert.notEqual(n.state, kept);
});

test('the answers to trivia and openings reach the host only, never a phone or the TV', () => {
  const n = night();
  n.host('updateGame', { gameId: n.gameId('Trivia'), questions: 'Capital of France? | Paris | Rome | A' });
  n.host('updateGame', { gameId: n.gameId('Anime opening guessing'), openings: 'Opening 1 | Zzyzx Road Saga' });
  assert.match(JSON.stringify(n.e().games), /Zzyzx Road Saga/);
  for (const view of [n.tv(), n.seenBy('T1')]) {
    const text = JSON.stringify(view);
    assert.ok(!text.includes('Zzyzx Road Saga') && !text.includes('Capital of France'), 'answers leaked');
    assert.equal((view.games.find((g) => g.name === 'Trivia') as { questionCount: number }).questionCount, 1);
  }
});

test('a fine on points keeps its reason in the ledger, and how much a team lost at the bar stays between it and the host', () => {
  const n = night();
  n.host('adjustPoints', { teamId: 'T2', amount: 40 });
  n.host('adjustPoints', { teamId: 'T2', amount: -5, reason: 'heckling' });
  assert.equal(n.state.ledger.at(-1)!.note, 'heckling');
  n.toSpending({ T1: 1, T2: 2, T3: 3 });
  n.team('T1', 'buy', { itemId: 'soju-shot', targetTeamId: 'T2', qty: 1 });
  n.host('startDrinks');
  n.bar('barNext', { teamId: 'T2' });
  n.bar('barFail', { teamId: 'T2' });
  assert.equal(n.e().round!.serves[0].pointsLost, 4);
  assert.equal(n.seenBy('T2').round!.serves[0].pointsLost, 4);
  assert.equal(n.seenBy('T1').round!.serves[0].pointsLost, null);
  assert.equal(n.tv().round!.serves[0].pointsLost, null);
});
