import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOUNDS, playCue, soundOn, type Cue } from './sounds';
import { THEME_PACKS } from '../themes/index';

const CUES = Object.keys(DEFAULT_SOUNDS) as Cue[];

test('every cue has a default, and every note is audible and short', () => {
  for (const [cue, sound] of Object.entries(DEFAULT_SOUNDS)) {
    assert.ok(sound.notes.length, cue);
    for (const [hz, ms] of sound.notes) assert.ok(hz >= 100 && hz <= 2000 && ms >= 40 && ms <= 600, `${cue}: ${hz}Hz ${ms}ms`);
    assert.ok(sound.notes.reduce((n, [, ms]) => n + ms, 0) <= 1500, `${cue} runs long`);
  }
});

test('a theme may bring its own sounds, but only for cues that exist', () => {
  for (const pack of THEME_PACKS) {
    for (const [cue, sound] of Object.entries(pack.sounds ?? {})) {
      assert.ok(CUES.includes(cue as Cue), `${pack.key} has an unknown cue: ${cue}`);
      for (const [hz, ms] of sound.notes) assert.ok(hz >= 100 && hz <= 2000 && ms >= 40 && ms <= 600, `${pack.key}.${cue}`);
    }
  }
});

test('with no sound turned on, playing a cue does nothing and never throws', () => {
  assert.equal(soundOn(), false);
  for (const cue of CUES) playCue(cue);
});
