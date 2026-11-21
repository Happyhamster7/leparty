import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBallot, tally, type Candidate } from './tally';

const people: Candidate[] = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus'].map((name, i) => ({ id: `p${i + 1}`, name, groupId: i < 4 ? 'A' : 'B' }));
const ids = people.map((p) => p.id);

test('a ballot is up to three best and three worst, six different people', () => {
  assert.deepEqual(checkBallot({ best: ['p1', 'p2', 'p3'], worst: ['p4', 'p5', 'p6'] }, ids, 3), { ok: true, ballot: { best: ['p1', 'p2', 'p3'], worst: ['p4', 'p5', 'p6'] } });
  assert.equal(checkBallot({ best: ['p1'], worst: [] }, ids, 3).ok, true, 'one pick is enough');
  assert.equal(checkBallot({ best: ['p1', 'p2', 'p3', 'p4'], worst: [] }, ids, 3).ok, false, 'four best is too many');
  assert.equal(checkBallot({ best: [], worst: [] }, ids, 3).ok, false, 'an empty ballot');
  assert.equal(checkBallot({ best: ['p1'], worst: ['p1'] }, ids, 3).ok, false, 'best and worst at once');
  assert.equal(checkBallot({ best: ['p1', 'p1'], worst: [] }, ids, 3).ok, false, 'the same person twice');
  assert.equal(checkBallot({ best: ['nobody'], worst: [] }, ids, 3).ok, false, 'someone not here');
  assert.equal(checkBallot({ best: 'p1', worst: null }, ids, 3).ok, false, 'not a list');
});

test('each pick is a vote; most votes first, ties by name, whatever order the ballots come in', () => {
  const ballots = [
    { best: ['p1', 'p2'], worst: ['p7'] },
    { best: ['p2', 'p3'], worst: ['p7', 'p6'] },
    { best: ['p2', 'p1'], worst: ['p6'] },
  ];
  const r = tally(ballots, people);
  assert.deepEqual(r.best.map((x) => [x.name, x.votes]), [['Bo', 3], ['Ana', 2], ['Cy', 1]]);
  assert.deepEqual(r.worst.map((x) => [x.name, x.votes]), [['Flo', 2], ['Gus', 2]]);
  assert.equal(r.voters, 3);
  assert.equal(r.best[0].groupId, 'A');
  assert.deepEqual(tally([...ballots].reverse(), people), r);
});

test('votes for someone who has since left are dropped, and nobody voting gives an empty result', () => {
  const r = tally([{ best: ['p1', 'gone'], worst: [] }], people);
  assert.deepEqual(r.best.map((x) => x.id), ['p1']);
  assert.deepEqual(tally([], people), { best: [], worst: [], voters: 0 });
});
