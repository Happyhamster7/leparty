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
