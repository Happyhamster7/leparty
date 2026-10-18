export type ThemeKey = 'jail' | 'heist' | 'cult' | 'custom';

/**
 * The vocabulary that makes a party feel like a specific theme — not
 * the party's own flavor text (theme_title/theme_blurb, written per
 * event), but the structural nouns the app itself uses: what to call
 * the host, a photo, a small group, an attendee's number.
 */
export type ThemeCopy = {
  key: ThemeKey;
  label: string;
  deptLabel: string;
  hostTitle: string;
  hostConsoleLabel: string;
  attendeeNoun: string;
  attendeeIdLabel: string;
  photoNoun: string;
  groupNoun: string;
  groupNounPlural: string;
  bookedLabel: string;
  declinedLabel: string;
  intakeLabel: string;
  checkinLabel: string;
};

const JAIL: ThemeCopy = {
  key: 'jail',
  label: 'Prison',
  deptLabel: 'Dept. of Corrections',
  hostTitle: 'Warden',
  hostConsoleLabel: "Warden's console",
  attendeeNoun: 'Inmate',
  attendeeIdLabel: 'Inmate',
  photoNoun: 'Mugshot',
  groupNoun: 'Block',
  groupNounPlural: 'Cell blocks',
  bookedLabel: 'Booked',
  declinedLabel: 'Excused',
  intakeLabel: 'Intake',
  checkinLabel: 'Intake desk',
};

// heist/cult/custom don't have their own copy yet — they alias to the
// jail dictionary so nothing renders blank, but are distinct, selectable
// keys so a real theme can be dropped in here later without touching
// every page that reads from THEMES.
const THEMES: Record<ThemeKey, ThemeCopy> = {
  jail: JAIL,
  heist: JAIL,
  cult: JAIL,
  custom: JAIL,
};

/** True only for themes with their own written copy, not a jail alias. */
export const THEMES_WITH_COPY: ThemeKey[] = ['jail'];

export function getTheme(key: string | null | undefined): ThemeCopy {
  return THEMES[key as ThemeKey] ?? JAIL;
}
