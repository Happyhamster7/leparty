import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERRORS, FEED, fill, roundLabel, sayError, sayFeed } from './messages';
import { voiceFor } from './voice';
import { defaultItems, STARTER_GAMES } from './engine/catalogue';
import { night } from './engine/testkit';
import { PLAIN } from '../../themes/plain';
import { PRISON } from '../../themes/prison';

const names = { team: (id: string) => `Team-${id}`, person: (id: string) => `Person-${id}` };
const plain = voiceFor(PLAIN, names);
const prison = voiceFor(PRISON, names);

/** One value for every parameter any template reads. */
const SAMPLE = {
  teamId: 'T1', toTeamId: 'T2', fromTeamId: 'T1', playerId: 'T1-p1', amount: 5, note: 'being late', game: 'Flip cup',
  qty: 2, name: 'Spirit', emoji: '🥃', bounty: 'open', target: 7, rounds: 3, startRound: 2, price: 30, jackpot: 80,
  acts: 4, act: 2, inAct: 1, final: false, actName: '', app: null, playersNeeded: 1, seconds: 30, mechanics: [], last: false,
  picks: { T1: ['T1-p1'] }, placings: { T1: 1, T2: 2 }, prizes: { T1: 35, T2: 29 }, order: ['T1', 'T2'], drinks: 3,
  reward: 4, next: 8, pct: 10, streamLost: 4, points: 9, n: 1, answer: 'Naruto', truth: 'truth', right: 2,
  average: 50, closest: 'T1', closestPick: 33, furthest: 'T2', furthestDrinks: 2,
  pairs: [{ a: 'T1', b: 'house', ca: 'silent', cb: 'snitch' }], bids: [{ teamId: 'T1', n: 3 }], drinkers: [{ teamId: 'T2', drinks: 4 }],
  line: 2, letters: 'A–D', max: 10, min: 5, has: 3, key: 'k', count: 2, phase: 'game', round: 1,
};

const THEMED = new RegExp('\\b(warden|inmate|commissary|cell|cells|block|blocks|mugshot|lockup|slammer)\\b', 'i');
const BROKEN = new RegExp('undefined|NaN|\\[object');

test('every feed line and every error has words, under any theme, and never says "undefined"', () => {
  for (const v of [plain, prison]) {
    for (const kind of Object.keys(FEED)) {
      const text = sayFeed(kind, SAMPLE, v);
      assert.ok(text.trim(), `${kind} is blank`);
      assert.ok(!BROKEN.test(text), `${kind}: ${text}`);
    }
    for (const code of Object.keys(ERRORS)) {
      const text = sayError(code, SAMPLE, v);
      assert.ok(text.trim(), `${code} is blank`);
      assert.ok(!BROKEN.test(text), `${code}: ${text}`);
    }
  }
});

test('under the Plain theme the game never uses a prison word; under Prison it uses the theme’s', () => {
  for (const kind of Object.keys(FEED)) assert.ok(!THEMED.test(sayFeed(kind, SAMPLE, plain)), `${kind}: ${sayFeed(kind, SAMPLE, plain)}`);
  for (const code of Object.keys(ERRORS)) assert.ok(!THEMED.test(sayError(code, SAMPLE, plain)), `${code}: ${sayError(code, SAMPLE, plain)}`);
  for (const item of defaultItems()) assert.ok(!THEMED.test(fill(`${item.name} ${item.desc}`, plain)), item.name);
  for (const [name, , , rules] of STARTER_GAMES) assert.ok(!THEMED.test(fill(`${name} ${rules}`, plain)), name);

  assert.equal(sayError('team.only', {}, plain), 'Only a team’s phone can do that.');
  assert.equal(sayError('team.only', {}, prison), 'Only a block’s phone can do that.');
  assert.equal(sayFeed('shop.opened', {}, plain), 'The shop is open.');
  assert.equal(sayFeed('shop.opened', {}, prison), 'The commissary is open.');
  assert.equal(sayFeed('money.paid', { teamId: 'T1', amount: 5, note: '' }, prison), 'The Warden paid Team-T1 $5.');
});

test('a played night’s feed renders: every line the engine really wrote has a template', () => {
  const n = night();
  n.toSpending({ T1: 1, T2: 2, T3: 3 });
  n.team('T1', 'buy', { itemId: 'spirit', targetTeamId: 'T2', qty: 5 });
  n.host('adjustPoints', { teamId: 'T1', amount: 30 });
  n.team('T1', 'buy', { itemId: 'open-bounty', stake: 10 });
  n.host('assignDrinks', { teamId: 'T3', itemId: 'wine', qty: 1, reason: 'heckling' });
  n.host('startDrinks');
  n.drinkUp();
  assert.ok(n.state.feed.length >= 8);
  for (const f of n.state.feed) {
    assert.ok(f.kind in FEED, `no template for ${f.kind}`);
    const text = sayFeed(f.kind, f.params, plain);
    assert.ok(text.trim() && !BROKEN.test(text), `${f.kind}: ${text}`);
  }
  assert.equal(sayFeed('nope', {}, plain), '', 'an unknown kind from a newer engine renders as nothing');
});

test('round labels and host-written text take the host’s act names and the theme’s words', () => {
  assert.equal(roundLabel({ act: 2, inAct: 3, final: true, actName: '' }), 'Act 2 · Final round');
  assert.equal(roundLabel({ act: 1, inAct: 2, final: false, actName: 'Booking Day' }), 'Booking Day · Round 2');
  assert.equal(fill('One shooter per {group}; all {groups} watch.', prison), 'One shooter per block; all blocks watch.');
});
