import type { ThemePack } from './types';

/** The original LeParty look: intake paperwork, ink and one rust accent. */
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
  tokens: {
    '--paper': '#ede9e0',
    '--card': '#f7f5f0',
    '--ink': '#17171a',
    '--ink-soft': '#2c2a26',
    '--muted': '#4a4740',
    '--muted-2': '#5a574f',
    '--line': '#c9c3b5',
    '--line-soft': '#ddd6c6',
    '--fill': '#e2dcce',
    '--rust': '#9c3a17',
    '--rust-dark': '#7a2d11',
  },
  roster: { bars: true, vacantLabel: 'Vacant', newestRowLabel: 'Fresh meat', rowLabel: 'Level' },
  groupName: (i) => `Block ${letter(i)}`,
};

export function letter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}
