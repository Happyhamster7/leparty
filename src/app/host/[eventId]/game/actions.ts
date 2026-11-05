'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';

/**
 * Starts the next round. Group games skip the player-pick prompt
 * entirely — no cooldown starts, and there's nothing to reveal — so
 * those rounds are created already "revealed".
 *
 * Acts: how many there should be is still an open design question
 * (docs/halloween-game-design.md section 11), so every round lands in
 * a single Act 1 for now, created on first use.
 */
export async function startRound(eventId: string, formData: FormData) {
  if (!isHost()) return;

  const gameId = String(formData.get('game_id') || '');
  if (!gameId) return;

  const supabase = db();

  const { data: game } = await supabase
    .from('games')
    .select('is_group')
    .eq('id', gameId)
    .maybeSingle();
  if (!game) return;

  let actId: string | undefined;
  const { data: existingAct } = await supabase
    .from('acts')
    .select('id')
    .eq('event_id', eventId)
    .eq('number', 1)
    .maybeSingle();

  if (existingAct) {
    actId = existingAct.id;
  } else {
    const { data: createdAct } = await supabase
      .from('acts')
      .insert({ event_id: eventId, number: 1 })
      .select('id')
      .single();
    actId = createdAct?.id;
  }
  if (!actId) return;

  const { data: lastRound } = await supabase
    .from('rounds')
    .select('number')
    .eq('event_id', eventId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = (lastRound?.number ?? 0) + 1;
  const now = new Date();
  const deadline = new Date(now.getTime() + 60_000);

  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      event_id: eventId,
      act_id: actId,
      number: nextNumber,
      game_id: gameId,
      phase: 'game',
      pick_deadline: game.is_group ? now.toISOString() : deadline.toISOString(),
      picks_revealed_at: game.is_group ? now.toISOString() : null,
    })
    .select('id')
    .single();

  if (error || !round) return;

  await supabase.from('events').update({ phase: 'game', current_day: nextNumber }).eq('id', eventId);

  revalidatePath(`/host/${eventId}/game`);
}

/** Moves the round on once picks are revealed. Results entry itself is the next build slice. */
export async function advanceToResults(eventId: string, roundId: string) {
  if (!isHost()) return;

  const supabase = db();
  await supabase.from('rounds').update({ phase: 'results' }).eq('id', roundId);
  await supabase.from('events').update({ phase: 'results' }).eq('id', eventId);

  revalidatePath(`/host/${eventId}/game`);
}
