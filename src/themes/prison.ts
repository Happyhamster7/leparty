import type { ThemePack } from './types';

/**
 * Prison: intake paperwork for words, and a pixel-art look (wooden
 * frames, parchment, one art pixel to three screen pixels). The art is
 * in `public/themes/prison`; see docs/pixel-ui-reference.md.
 */
export const PRISON: ThemePack = {
  key: 'jail',
  label: 'Prison',
  copy: {
    deptLabel: 'Dept. of Corrections',
    hostTitle: 'Warden',
    hostRef: 'the Warden',
    hostConsoleLabel: 'Warden’s console',
    attendeeNoun: 'Inmate',
    attendeeIdLabel: 'Inmate',
    photoNoun: 'Mugshot',
    photoNounPlural: 'Mugshots',
    groupNoun: 'Block',
    groupNounPlural: 'Cell blocks',
    groupFlavourLabel: 'The charge',
    bookedLabel: 'Booked',
    bookedPhrase: 'booked in',
    declinedLabel: 'Excused',
    declinedNote: 'Released without charge',
    intakeLabel: 'Intake',
    checkinLabel: 'Intake desk',
    rsvpYesLabel: 'Report for intake',
    nameFieldLabel: 'Name on your paperwork',
    seeBookingLabel: 'See your paperwork',
  },
  // The pixel kit's palette: dark brown on parchment, never black on white.
  tokens: {
    '--paper': '#fde6b2',
    '--card': '#fff6c8',
    '--ink': '#3b1d12',
    '--ink-soft': '#6e3416',
    '--muted': '#7a4a26',
    '--muted-2': '#7a4a26',
    '--line': '#dcab68',
    '--line-soft': '#f2cd8a',
    '--fill': '#f2cd8a',
    '--rust': '#a3521f',
    '--rust-dark': '#6e3416',
  },
  skin: {
    href: '/themes/prison/skin.css',
    fonts: 'https://fonts.googleapis.com/css2?family=Jersey+10&display=swap',
  },
  roster: { bars: true, vacantLabel: 'Vacant', newestRowLabel: 'Fresh meat', rowLabel: 'Level' },
  // Chiptune: square waves, like the art.
  sounds: {
    start: { wave: 'square', notes: [[392, 90], [523, 90], [659, 90], [784, 220]] },
    reveal: { wave: 'square', notes: [[659, 80], [988, 200]] },
    open: { wave: 'square', notes: [[523, 70], [659, 70], [784, 70], [1047, 180]] },
    drinks: { wave: 'square', notes: [[330, 120], [330, 120], [494, 300]] },
    alarm: { wave: 'square', notes: [[220, 160], [185, 160], [147, 420]] },
    win: { wave: 'square', notes: [[523, 100], [659, 100], [784, 100], [1047, 100], [784, 100], [1047, 420]] },
  },
  gameWords: { shop: 'the commissary' },
  groupName: (i) => `Block ${letter(i)}`,
};

export function letter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}
