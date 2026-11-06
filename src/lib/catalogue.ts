import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameFormat, ItemBuyerRule, ResultType } from '@/lib/types';

/**
 * Placeholder catalogue from docs/halloween-game-design.md sections 7–8.
 * Names, effects, limits, prices and rules are all explicitly marked
 * "to be finalised later" there — this seeds something playable, not
 * the final balance.
 */

type PlaceholderGame = {
  name: string;
  rules: string | null;
  format: GameFormat;
  players_needed: number | null;
  is_group: boolean;
  result_type: ResultType;
};

export const PLACEHOLDER_GAMES: PlaceholderGame[] = [
  { name: 'Chinese charades', rules: null, format: 'team_relay', players_needed: null, is_group: true, result_type: 'placings' },
  { name: 'Chinese dance', rules: null, format: 'all_teams', players_needed: null, is_group: true, result_type: 'placings' },
  { name: 'Basketball', rules: 'Score or placings — not yet decided.', format: 'per_team', players_needed: 1, is_group: false, result_type: 'score' },
  { name: 'Cup shooting', rules: null, format: 'per_team', players_needed: 1, is_group: false, result_type: 'placings' },
  { name: 'Trivia', rules: null, format: 'all_teams', players_needed: null, is_group: true, result_type: 'score' },
  { name: 'Cold War drinking', rules: 'Rules not yet defined.', format: 'per_team', players_needed: 1, is_group: false, result_type: 'winner' },
  { name: 'Is Jason lying?', rules: 'Does a wrong guess mean drinking? Not yet decided.', format: 'per_team', players_needed: 1, is_group: false, result_type: 'per_player' },
  { name: 'Dark room cuffs', rules: 'Rules not yet defined.', format: 'per_team', players_needed: 1, is_group: false, result_type: 'winner' },
  { name: 'Make Edwin laugh', rules: null, format: 'per_team', players_needed: 1, is_group: false, result_type: 'winner' },
  { name: 'Flip cup', rules: null, format: 'team_relay', players_needed: null, is_group: true, result_type: 'placings' },
  { name: '1 minute chess', rules: 'Bracket, or one match per pair of teams? Not yet decided.', format: 'head_to_head', players_needed: 1, is_group: false, result_type: 'winner' },
  { name: 'Lights off you move, lights on you freeze', rules: null, format: 'all_teams', players_needed: null, is_group: true, result_type: 'winner' },
];

type PlaceholderItem = {
  key: string;
  name: string;
  description: string;
  buyer_rule: ItemBuyerRule;
  limit_per_round: number | null;
  limit_per_night: number | null;
  /**
   * Null means "not priced". Eye Spy, Reflect and both Bounties are
   * buildable with what's in the schema today (see
   * supabase/migrations/0008_bounty_tracking.sql for the bounty
   * table). Bus ticket and Lock-up are dropped, not deferred — their
   * "on the bus"/holding-cell effects were cut rather than built, so
   * these two rows stay seeded but permanently unpriced and out of
   * the shop UI.
   */
  price: number | null;
};

export const PLACEHOLDER_ITEMS: PlaceholderItem[] = [
  {
    key: 'eye_spy',
    name: 'Eye Spy',
    description:
      'Privately shows a table, round by round since the start of the game, of which team sent drinks to whom and how many.',
    buyer_rule: 'any',
    limit_per_round: 1,
    limit_per_night: null,
    price: 40,
  },
  {
    key: 'reflect',
    name: 'Reflect',
    description:
      'All drinks aimed at the buyer this round go back to their senders. Only one team can play Reflect each round.',
    buyer_rule: 'any',
    limit_per_round: null,
    limit_per_night: 1,
    price: 60,
  },
  {
    key: 'bus_ticket',
    name: 'Bus ticket',
    description: 'Sends one top-team player "on the bus".',
    buyer_rule: 'bottom_4',
    limit_per_round: null,
    limit_per_night: 1,
    price: null,
  },
  {
    key: 'lock_up',
    name: 'Lock-up',
    description: 'Sends one top-team player to the holding cell.',
    buyer_rule: 'bottom_4',
    limit_per_round: null,
    limit_per_night: 1,
    price: null,
  },
  {
    key: 'open_bounty',
    name: 'Open Bounty',
    description:
      'Send 5 drinks of any type within 3 rounds for a 100 money reward. Only one bounty (Open or Winner\'s) can be active per team at a time. Miss the deadline and you owe 3 shots of Spirit next round — the cost is still spent either way.',
    buyer_rule: 'any',
    limit_per_round: 1,
    limit_per_night: null,
    price: 50,
  },
  {
    key: 'winners_bounty',
    name: 'Winner\'s Bounty',
    description:
      'Only the team that just won this round\'s game can buy it. Same target as Open Bounty — 5 drinks of any type within 3 rounds — but a bigger reward: 150 money. Miss it and you owe 3 shots of Spirit next round.',
    buyer_rule: 'game_winner',
    limit_per_round: 1,
    limit_per_night: null,
    price: 50,
  },
];

/**
 * Decided catalogue (docs/halloween-game-design.md section 6a). Base
 * rate is 15 money / 3 points per standard drink. Bundle and bottle
 * discounts (5/10 for Spirit, Mystery Spirit, Mystery Cocktail; the
 * 8-shot Soju bottle) are order-time cost logic, not separate rows —
 * see that section for the implementation note.
 */
type PlaceholderDrinkType = {
  name: string;
  points: number;
  cost: number;
};

export const PLACEHOLDER_DRINK_TYPES: PlaceholderDrinkType[] = [
  { name: 'Wine', points: 4, cost: 25 },
  { name: 'Spirit', points: 3, cost: 15 },
  { name: 'Mystery Spirit', points: 3, cost: 15 },
  { name: 'Soju', points: 1, cost: 7 },
  { name: 'Mystery Cocktail', points: 4, cost: 18 },
];

/** Seeds the placeholder games, items and drink types for a newly created event. */
export async function seedCatalogue(supabase: SupabaseClient, eventId: string) {
  await supabase.from('games').insert(
    PLACEHOLDER_GAMES.map((g) => ({ event_id: eventId, ...g }))
  );

  await supabase.from('items').insert(
    PLACEHOLDER_ITEMS.map((i) => ({ event_id: eventId, ...i }))
  );

  await supabase.from('drink_types').insert(
    PLACEHOLDER_DRINK_TYPES.map((d) => ({ event_id: eventId, ...d }))
  );
}
