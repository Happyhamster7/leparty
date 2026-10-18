export type PotluckCategory = 'protein' | 'carbs' | 'snacks' | 'sweets' | 'alcohol';

export const POTLUCK_CATEGORIES: { key: PotluckCategory; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'sweets', label: 'Sweets' },
  { key: 'alcohol', label: 'Alcohol' },
];

export const CAPACITY_BANDS: { value: number; label: string }[] = [
  { value: 1, label: '0 standard drinks' },
  { value: 2, label: '5 standard drinks' },
  { value: 3, label: '10 standard drinks' },
  { value: 4, label: '15 standard drinks' },
  { value: 5, label: 'The whole cabinet' },
];

export type EventConfig = {
  block_count: number;
  starting_sentence: number;
  starting_commissary: number;
};

export type EventRow = {
  id: string;
  name: string;
  theme_key: string;
  theme_title: string | null;
  theme_blurb: string | null;
  dress_code: string | null;
  dress_code_notes: string | null;
  venue: string | null;
  held_on: string | null;
  starts_at_label: string | null;
  status: string;
  config: EventConfig;
  created_at: string;
};

export type PersonRow = {
  id: string;
  display_name: string;
  capacity_band: number | null;
  profile_token: string;
};

export type ParticipantRow = {
  id: string;
  event_id: string;
  person_id: string;
  block_id: string | null;
  invite_token: string;
  rsvp: 'pending' | 'yes' | 'no';
  potluck_item: string | null;
  potluck_category: PotluckCategory | null;
  dietary_notes: string | null;
  photo_path: string | null;
  capacity_snapshot: number | null;
  inmate_number: number | null;
  checked_in_at: string | null;
  signup_completed_at: string | null;
};

export type InviteContext = {
  participant: ParticipantRow;
  person: PersonRow;
  event: EventRow;
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatHeldOn(held_on: string | null, label: string | null): string {
  if (!held_on) return label || '';
  const d = new Date(held_on + 'T00:00:00');
  const text = d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return label ? `${text} · ${label}` : text;
}
