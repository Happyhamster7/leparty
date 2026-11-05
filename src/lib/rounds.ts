import { db } from '@/lib/supabase';

type GameJoin = {
  name: string;
  format: string;
  players_needed: number | null;
  is_group: boolean;
  result_type: string;
};

export type OpenRound = {
  id: string;
  event_id: string;
  act_id: string;
  number: number;
  game_id: string;
  phase: string;
  pick_deadline: string | null;
  picks_revealed_at: string | null;
  shop_closed_at: string | null;
  drinks_started_at: string | null;
  games: GameJoin | null;
};

/** The most recent round for this event, whatever phase it's in. */
export async function currentOpenRound(eventId: string): Promise<OpenRound | null> {
  const { data } = await db()
    .from('rounds')
    .select(
      'id, event_id, act_id, number, game_id, phase, pick_deadline, picks_revealed_at, shop_closed_at, drinks_started_at, games(name, format, players_needed, is_group, result_type)'
    )
    .eq('event_id', eventId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as unknown as OpenRound) ?? null;
}

/**
 * Participants who played in either of the last two non-group rounds —
 * group games don't start a cooldown (docs/halloween-game-design.md,
 * "Player selection and cooldown").
 */
export async function cooldownParticipantIds(eventId: string): Promise<Set<string>> {
  const supabase = db();

  const { data: recent } = await supabase
    .from('rounds')
    .select('id, games(is_group)')
    .eq('event_id', eventId)
    .order('number', { ascending: false })
    .limit(8);

  const nonGroup = ((recent ?? []) as unknown as { id: string; games: { is_group: boolean } | null }[])
    .filter((r) => r.games && r.games.is_group === false)
    .slice(0, 2)
    .map((r) => r.id);

  if (nonGroup.length === 0) return new Set();

  const { data: rps } = await supabase
    .from('round_players')
    .select('participant_id')
    .in('round_id', nonGroup);

  return new Set((rps ?? []).map((r) => r.participant_id as string));
}

/** How many rounds each participant has played this event, for auto-pick tiebreaks. */
export async function gamesPlayedCounts(eventId: string): Promise<Map<string, number>> {
  const supabase = db();

  const { data: rounds } = await supabase.from('rounds').select('id').eq('event_id', eventId);
  const roundIds = (rounds ?? []).map((r) => r.id as string);
  if (roundIds.length === 0) return new Map();

  const { data: rps } = await supabase
    .from('round_players')
    .select('participant_id')
    .in('round_id', roundIds);

  const map = new Map<string, number>();
  for (const r of rps ?? []) {
    const id = r.participant_id as string;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

/**
 * If this round's pick deadline has passed and picks aren't revealed yet,
 * auto-pick for any in-play block that hasn't submitted, favouring
 * whoever has played the fewest games, then reveal. Group games are
 * revealed immediately when the round is created (see startRound), so
 * this only ever does real work for non-group rounds.
 */
export async function ensurePicksResolved(round: OpenRound): Promise<void> {
  if (round.phase !== 'game' || round.picks_revealed_at) return;
  if (!round.pick_deadline || new Date(round.pick_deadline) > new Date()) return;

  const supabase = db();

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id')
    .eq('event_id', round.event_id)
    .eq('in_play', true);

  const { data: already } = await supabase
    .from('round_players')
    .select('block_id')
    .eq('round_id', round.id);

  const pickedBlocks = new Set((already ?? []).map((r) => r.block_id as string));
  const missing = (blocks ?? []).filter((b) => !pickedBlocks.has(b.id as string));

  if (missing.length > 0 && round.games) {
    const cooldown = await cooldownParticipantIds(round.event_id);
    const played = await gamesPlayedCounts(round.event_id);
    const needed = round.games.is_group ? null : round.games.players_needed ?? 1;

    for (const block of missing) {
      const { data: roster } = await supabase
        .from('participants')
        .select('id')
        .eq('block_id', block.id)
        .eq('left_early', false);

      const eligible = (roster ?? [])
        .map((p) => p.id as string)
        .filter((id) => !cooldown.has(id))
        .sort((a, b) => (played.get(a) ?? 0) - (played.get(b) ?? 0));

      const pickIds = round.games.is_group ? eligible : eligible.slice(0, needed ?? 1);

      if (pickIds.length > 0) {
        await supabase.from('round_players').insert(
          pickIds.map((pid) => ({
            round_id: round.id,
            block_id: block.id,
            participant_id: pid,
            picked_by: 'auto' as const,
          }))
        );
      }
    }
  }

  await supabase.from('rounds').update({ picks_revealed_at: new Date().toISOString() }).eq('id', round.id);
}
