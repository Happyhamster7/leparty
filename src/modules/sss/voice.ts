import type { ThemePack } from '../../themes/types';
import { DEFAULT_WORDS, type Voice } from './messages';

/**
 * The voice the game speaks in at one party: the theme's words for a
 * team, the host and the shop, plus tonight's names.
 */
export function voiceFor(
  pack: Pick<ThemePack, 'copy' | 'gameWords'>,
  names: { team: (id: string) => string | undefined; person: (id: string) => string | undefined },
): Voice {
  const group = pack.copy.groupNoun.toLowerCase();
  return {
    team: (id) => names.team(String(id)) ?? `a ${group}`,
    person: (id) => names.person(String(id)) ?? 'someone',
    money: (n) => `$${Number(n) || 0}`,
    group,
    groups: `${group}s`,
    host: pack.copy.hostRef || DEFAULT_WORDS.host,
    shop: pack.gameWords?.shop ?? DEFAULT_WORDS.shop,
  };
}

/** The theme's words for the game, as plain strings a server page can hand to a client screen. */
export type Words = { group: string; groups: string; host: string; shop: string };

export function wordsFor(pack: Pick<ThemePack, 'copy' | 'gameWords'>): Words {
  const v = voiceFor(pack, { team: () => undefined, person: () => undefined });
  return { group: v.group, groups: v.groups, host: v.host, shop: v.shop };
}

/** A voice for the browser: the party's words plus the names in the roster it was just sent. */
export function voiceFromWords(words: Words, roster: { groups: { id: string; name: string }[]; members: { id: string; name: string }[] }): Voice {
  const teams = new Map(roster.groups.map((g) => [g.id, g.name]));
  const people = new Map(roster.members.map((m) => [m.id, m.name]));
  return {
    ...words,
    team: (id) => teams.get(String(id)) ?? `a ${words.group}`,
    person: (id) => people.get(String(id)) ?? 'someone',
    money: (n) => `$${Number(n) || 0}`,
  };
}
