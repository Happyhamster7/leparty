import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_PACKS, getTheme, sitePack, themeCss, themePack } from './index';
import { PRISON } from './prison';
import { PLAIN } from './plain';

test('every pack fills in every word, token and roster setting the others do', () => {
  const copyKeys = Object.keys(PRISON.copy).sort();
  const tokenKeys = Object.keys(PRISON.tokens).sort();
  for (const pack of THEME_PACKS) {
    assert.deepEqual(Object.keys(pack.copy).sort(), copyKeys, `${pack.key} copy`);
    assert.deepEqual(Object.keys(pack.tokens).sort(), tokenKeys, `${pack.key} tokens`);
    for (const [k, v] of Object.entries(pack.copy)) assert.ok(v.trim(), `${pack.key}.${k} is blank`);
    assert.ok(pack.roster.vacantLabel.trim(), `${pack.key} vacant label`);
  }
});

test('pack keys are unique, and Prison keeps the key existing parties were saved with', () => {
  const keys = THEME_PACKS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(PRISON.key, 'jail');
});

test('a party saved with a retired or missing theme key still renders as Prison', () => {
  for (const key of ['heist', 'cult', 'custom', '', null, undefined]) assert.equal(themePack(key), PRISON);
  assert.equal(getTheme('plain').hostTitle, 'Host');
  assert.equal(getTheme('jail').hostTitle, 'Warden');
});

test('pages with no party are Plain unless SITE_THEME names a pack', () => {
  const before = process.env.SITE_THEME;
  try {
    delete process.env.SITE_THEME;
    assert.equal(sitePack(), PLAIN);
    process.env.SITE_THEME = 'jail';
    assert.equal(sitePack(), PRISON);
    process.env.SITE_THEME = 'no-such-theme';
    assert.equal(sitePack(), PLAIN);
  } finally {
    if (before === undefined) delete process.env.SITE_THEME;
    else process.env.SITE_THEME = before;
  }
});

test('Plain carries no prison words', () => {
  const words = [...Object.values(PLAIN.copy), ...Object.values(PLAIN.roster), PLAIN.groupName(0)].join(' ').toLowerCase();
  for (const w of ['warden', 'inmate', 'mugshot', 'cell', 'block', 'intake', 'charge', 'prison', 'jail']) {
    assert.ok(!words.includes(w), `Plain says "${w}"`);
  }
});

test('default group names are distinct for as many groups as a party can have', () => {
  for (const pack of THEME_PACKS) {
    const names = Array.from({ length: 12 }, (_, i) => pack.groupName(i));
    assert.equal(new Set(names).size, 12, pack.key);
  }
  assert.equal(PRISON.groupName(0), 'Block A');
  assert.equal(PLAIN.groupName(1), 'Team B');
});

test('themeCss writes one :root rule and drops anything that could break out of it', () => {
  assert.match(themeCss(PLAIN), /^:root\{--paper:#f3f4f6;.*--rust-dark:#1e40af\}$/);
  const hostile = {
    ...PLAIN,
    tokens: { '--ink': '#000', '--bad': 'red}</style><script>alert(1)</script>', '--x;y': '#fff' },
  } as typeof PLAIN;
  assert.equal(themeCss(hostile), ':root{--ink:#000}');
});
