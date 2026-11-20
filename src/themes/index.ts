import type { ThemeCopy, ThemePack } from './types';
import { PRISON } from './prison';
import { PLAIN } from './plain';

export type { ThemeCopy, ThemePack } from './types';

/** Every theme a host can pick, in picker order. */
export const THEME_PACKS: ThemePack[] = [PRISON, PLAIN];

const BY_KEY = new Map(THEME_PACKS.map((p) => [p.key, p]));

/**
 * The pack for an event's `theme_key`. An unknown key gets Prison, not
 * Plain: events created before themes were split carry keys (heist,
 * cult, custom) that always rendered as Prison.
 */
export function themePack(key: string | null | undefined): ThemePack {
  return BY_KEY.get(key ?? '') ?? PRISON;
}

/** The words for an event's theme. */
export function getTheme(key: string | null | undefined): ThemeCopy {
  return themePack(key).copy;
}

/**
 * The theme for pages that belong to no party. Plain unless the
 * deployment sets SITE_THEME to a pack's key (for example `jail`).
 */
export function sitePack(): ThemePack {
  return BY_KEY.get(process.env.SITE_THEME ?? '') ?? PLAIN;
}

/** A `:root` rule carrying a pack's tokens, for a <style> tag. */
export function themeCss(pack: ThemePack): string {
  const body = Object.entries(pack.tokens)
    .filter(([name, value]) => /^--[a-z0-9-]+$/.test(name) && /^[#a-zA-Z0-9(),.%\s'-]+$/.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return `:root{${body}}`;
}
