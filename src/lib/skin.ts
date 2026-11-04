/**
 * Visual skins — how the app looks, separate from the party theme
 * (src/lib/theme.ts), which decides what things are called. A jail
 * party can be shown in any skin.
 *
 * The active skin is the `leparty_skin` cookie. Visiting any page with
 * `?skin=rpg`, `?skin=pixel` or `?skin=default` sets it (see
 * src/middleware.ts). Skins are on trial: nothing in the app links to
 * them, so guests only ever see the default unless given a ?skin= link.
 *
 * The pixel skin's component kit and gallery: src/components/pixel and
 * /kit. Its design notes: docs/pixel-ui-reference.md.
 */

export const SKINS = ['default', 'rpg', 'pixel'] as const;
export type Skin = (typeof SKINS)[number];

export const SKIN_COOKIE = 'leparty_skin';

export const SKIN_LABELS: Record<Skin, string> = {
  default: 'Original',
  rpg: 'Fantasy RPG',
  pixel: 'Pixel farm',
};

/** Google Fonts stylesheet each skin needs, loaded only while it's on. */
export const SKIN_FONTS: Record<Skin, string | null> = {
  default: null,
  rpg: 'https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Alegreya+Sans+SC:wght@500&family=Cinzel:wght@600;700&display=swap',
  // Self-hosted through @fontsource, imported in layout.tsx.
  pixel: null,
};

export function parseSkin(value: string | null | undefined): Skin {
  return (SKINS as readonly string[]).includes(value ?? '') ? (value as Skin) : 'default';
}
