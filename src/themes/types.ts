/**
 * A theme pack: everything that makes a party feel like one theme, and
 * nothing about how any game works. An event picks one with
 * `events.theme_key`; games read their words and colours from it.
 *
 * Add a theme by writing a pack and registering it in `index.ts`. A pack
 * is code, not database rows, because it will grow sprites, fonts and
 * sounds that need a developer anyway.
 */
export type ThemePack = {
  key: string;
  /** What the host sees in the theme picker. */
  label: string;
  copy: ThemeCopy;
  /**
   * CSS custom properties that override the defaults in `globals.css`,
   * for example `{ '--rust': '#1d4ed8' }`.
   */
  tokens: Record<`--${string}`, string>;
  /** How the "who's going" wall is dressed. */
  roster: {
    /** Draw bars across each photo. */
    bars: boolean;
    /** Label on an empty slot: "Vacant". */
    vacantLabel: string;
    /** Label on the newest row, or null for no row labels: "Fresh meat". */
    newestRowLabel: string | null;
    /** Prefix for older rows, numbered from 1: "Level". */
    rowLabel: string | null;
  };
  /** Default name for the nth group (0-based) when an event is created. */
  groupName: (index: number) => string;
};

/**
 * The structural nouns the app itself uses. Not the party's own flavour
 * text (theme_title and theme_blurb, written per event): what to call
 * the host, a photo, a small group, an attendee's number.
 *
 * Plain strings only, so the whole object can be passed to client
 * components.
 */
export type ThemeCopy = {
  /** Small label in the top bar: "Dept. of Corrections". */
  deptLabel: string;
  /** "Warden". */
  hostTitle: string;
  /** The host mid-sentence: "the Warden", "the host". */
  hostRef: string;
  /** "Warden's console". */
  hostConsoleLabel: string;
  /** "Inmate". */
  attendeeNoun: string;
  /** Printed before an attendee's number: "Inmate 4012". */
  attendeeIdLabel: string;
  /** "Mugshot". */
  photoNoun: string;
  photoNounPlural: string;
  /** "Block". */
  groupNoun: string;
  /** "Cell blocks". */
  groupNounPlural: string;
  /** Label for a group's one-line flavour text: "The charge". */
  groupFlavourLabel: string;
  /** Stamp on a finished signup: "Booked". */
  bookedLabel: string;
  /** Finishes "You're …" and "Sam …": "booked in". */
  bookedPhrase: string;
  /** Stamp on a declined invite: "Excused". */
  declinedLabel: string;
  /** Top-bar note on a declined invite: "Released without charge". */
  declinedNote: string;
  /** "Intake". */
  intakeLabel: string;
  /** "Intake desk". */
  checkinLabel: string;
  /** The yes button on an invite: "Report for intake". */
  rsvpYesLabel: string;
  /** Label on the name field: "Name on your paperwork". */
  nameFieldLabel: string;
  /** Link to a finished signup: "See your paperwork". */
  seeBookingLabel: string;
};
