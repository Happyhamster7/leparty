import type { ThemePack } from './types';
import { letter } from './prison';

/**
 * No theme at all: neutral words and a neutral palette. Used for pages
 * that belong to no party (the home page, signup, the host's party
 * list) and for any party that doesn't want a theme.
 */
export const PLAIN: ThemePack = {
  key: 'plain',
  label: 'Plain',
  copy: {
    deptLabel: 'LeParty',
    hostTitle: 'Host',
    hostRef: 'the host',
    hostConsoleLabel: 'Host console',
    attendeeNoun: 'Guest',
    attendeeIdLabel: 'Guest no.',
    photoNoun: 'Photo',
    photoNounPlural: 'Photos',
    groupNoun: 'Team',
    groupNounPlural: 'Teams',
    groupFlavourLabel: 'Motto',
    bookedLabel: 'Confirmed',
    bookedPhrase: 'signed up',
    declinedLabel: 'Not coming',
    declinedNote: 'Maybe next time',
    intakeLabel: 'Signup',
    checkinLabel: 'Check-in desk',
    rsvpYesLabel: 'I’m coming',
    nameFieldLabel: 'Your name',
    seeBookingLabel: 'See your details',
  },
  tokens: {
    '--paper': '#f3f4f6',
    '--card': '#ffffff',
    '--ink': '#14181f',
    '--ink-soft': '#283040',
    '--muted': '#4b5563',
    '--muted-2': '#5b6472',
    '--line': '#c5ccd6',
    '--line-soft': '#dde2e9',
    '--fill': '#e5e9ef',
    '--rust': '#1d4ed8',
    '--rust-dark': '#1e40af',
  },
  roster: { bars: false, vacantLabel: 'Open', newestRowLabel: null, rowLabel: null },
  groupName: (i) => `Team ${letter(i)}`,
};
