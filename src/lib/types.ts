export type PotluckCategory = 'protein' | 'carbs' | 'salad' | 'snacks' | 'sweets' | 'alcohol';

export const POTLUCK_CATEGORIES: { key: PotluckCategory; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'salad', label: 'Salad' },
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

// ---------------------------------------------------------------------
// Phase 2 — the game. See docs/halloween-game-design.md (source of
// truth) and docs/schema.md (tables).
// ---------------------------------------------------------------------

export type RoundPhase = 'game' | 'results' | 'spending' | 'drinks' | 'done';
export type GameFormat = 'per_team' | 'team_relay' | 'all_teams' | 'head_to_head';
export type ResultType = 'placings' | 'score' | 'winner' | 'per_player';
export type LedgerKind = 'money' | 'points' | 'stars';
export type LedgerReason =
  | 'placing'
  | 'bonus'
  | 'star'
  | 'item'
  | 'drink_cost'
  | 'drink_served'
  | 'host_adjust'
  | 'bounty';
export type DrinkOrderOrigin = 'team' | 'admin' | 'penalty';
export type DrinkOrderStatus = 'pending' | 'cancelled' | 'reflected' | 'served';
export type ItemBuyerRule = 'any' | 'bottom_4' | 'game_winner';

export type ActRow = {
  id: string;
  event_id: string;
  number: number;
  name: string | null;
};

export type GameRow = {
  id: string;
  event_id: string;
  name: string;
  rules: string | null;
  format: GameFormat;
  players_needed: number | null;
  is_group: boolean;
  result_type: ResultType;
};

export type RoundRow = {
  id: string;
  event_id: string;
  act_id: string;
  number: number;
  game_id: string;
  phase: RoundPhase;
  pick_deadline: string | null;
  picks_revealed_at: string | null;
  shop_closed_at: string | null;
  drinks_started_at: string | null;
  completed_at: string | null;
};

export type RoundPlayerRow = {
  round_id: string;
  block_id: string;
  participant_id: string;
  picked_by: 'team' | 'auto';
};

export type GameResultRow = {
  id: string;
  round_id: string;
  block_id: string;
  placing: number | null;
  score: number | null;
  note: string | null;
};

export type DrinkTypeRow = {
  id: string;
  event_id: string;
  name: string;
  points: number;
  cost: number;
};

export type ItemRow = {
  id: string;
  event_id: string;
  key: string;
  name: string;
  description: string | null;
  /** Null means "not priced yet", distinct from a free item costing 0. */
  price: number | null;
  buyer_rule: ItemBuyerRule;
  limit_per_round: number | null;
  limit_per_night: number | null;
};

export type ItemUseRow = {
  id: string;
  round_id: string;
  block_id: string;
  item_id: string;
  target_block_id: string | null;
  target_participant_id: string | null;
  result: unknown;
};

export type PenaltyRow = {
  id: string;
  block_id: string;
  from_round_id: string;
  applies_round_id: string | null;
  kind: 'extra_shot';
  reason: 'missed_time' | 'host' | 'failed_bounty';
  /** Null means the default (1, cheapest drink type) — see src/lib/drinks.ts. */
  qty: number | null;
  drink_type_id: string | null;
};

export type BountyRow = {
  id: string;
  item_use_id: string;
  block_id: string;
  event_id: string;
  start_round_number: number;
  deadline_round_number: number;
  target_qty: number;
  target_drink_type_id: string | null;
  reward_money: number;
  resolved_at: string | null;
  hit: boolean | null;
};

export type DrinkOrderRow = {
  id: string;
  round_id: string;
  sender_block_id: string | null;
  origin: DrinkOrderOrigin;
  target_block_id: string;
  drink_type_id: string;
  qty: number;
  status: DrinkOrderStatus;
  scores_for_block_id: string | null;
  penalty_id: string | null;
};

export type ServeRow = {
  id: string;
  round_id: string;
  block_id: string;
  drink_count: number;
  queue_position: number;
  served_at: string | null;
  timer_ends_at: string | null;
  finished_at: string | null;
  finished_by: 'timer' | 'host' | null;
  missed_time: boolean;
};

export type ClipRow = {
  id: string;
  serve_id: string;
  storage_path: string;
  upload_state: 'pending' | 'uploaded' | 'failed';
  status: 'shown' | 'removed';
  uploaded_at: string | null;
};

export type LedgerEntryRow = {
  id: string;
  block_id: string;
  round_id: string | null;
  kind: LedgerKind;
  delta: number;
  reason: LedgerReason;
  ref_id: string | null;
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
