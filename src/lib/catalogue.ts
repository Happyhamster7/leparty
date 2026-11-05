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
  },
  {
    key: 'reflect',
    name: 'Reflect',
    description:
      'All drinks aimed at the buyer this round go back to their senders. Only one Reflect may be played per round across all teams — enforce that in the resolver, not here.',
    buyer_rule: 'any',
    limit_per_round: null,
    limit_per_night: 1,
  },
  {
    key: 'bus_ticket',
    name: 'Bus ticket',
    description: 'Sends one top-team player "on the bus".',
    buyer_rule: 'bottom_4',
    limit_per_round: null,
    limit_per_night: 1,
  },
  {
    key: 'lock_up',
    name: 'Lock-up',
    description: 'Sends one top-team player to the holding cell.',
    buyer_rule: 'bottom_4',
    limit_per_round: null,
    limit_per_night: 1,
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
  { name: 'Wine', points: 4, cost: 22 },
  { name: 'Spirit', points: 3, cost: 15 },
  { name: 'Mystery Spirit', points: 3, cost: 15 },
  { name: 'Soju', points: 1, cost: 7 },
  { name: 'Mystery Cocktail', points: 3, cost: 15 },
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
