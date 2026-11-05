'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { prizeMoneyForPlacing } from '@/lib/economy';
import { writeLedgerEntries, type LedgerInsert } from '@/lib/ledger';
import type { HostState } from '../../actions';

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

/** Moves the round on once picks are revealed. */
export async function advanceToResults(eventId: string, roundId: string) {
  if (!isHost()) return;

  const supabase = db();
  await supabase.from('rounds').update({ phase: 'results' }).eq('id', roundId);
  await supabase.from('events').update({ phase: 'results' }).eq('id', eventId);

  revalidatePath(`/host/${eventId}/game`);
}

/**
 * Records every in-play block's placing (and score, for score-type
 * games) for the round, pays prize money (placeholder curve, see
 * src/lib/economy.ts) and any host-entered bonus money into the
 * ledger, then moves the round on to spending.
 *
 * Upserts on (round_id, block_id) so a resubmit — the host fixing a
 * typo — doesn't create duplicate game_results rows or double-pay the
 * ledger via a second insert.
 */
export async function submitResults(
  eventId: string,
  roundId: string,
  _prev: HostState,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const supabase = db();

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id')
    .eq('event_id', eventId)
    .eq('in_play', true);

  if (!blocks || blocks.length === 0) return { error: 'No in-play blocks for this event.' };

  const entries = blocks.map((b) => {
    const blockId = b.id as string;
    const placingRaw = String(formData.get(`placing_${blockId}`) || '').trim();
    const scoreRaw = String(formData.get(`score_${blockId}`) || '').trim();
    const bonusRaw = String(formData.get(`bonus_${blockId}`) || '').trim();
    const noteRaw = String(formData.get(`note_${blockId}`) || '').trim();

    return {
      blockId,
      placing: placingRaw ? parseInt(placingRaw, 10) : null,
      score: scoreRaw ? parseInt(scoreRaw, 10) : null,
      bonus: bonusRaw ? parseInt(bonusRaw, 10) : 0,
      note: noteRaw || null,
    };
  });

  if (entries.some((e) => !e.placing || e.placing < 1)) {
    return { error: 'Enter a placing (1 or higher) for every block.' };
  }

  const { data: inserted, error } = await supabase
    .from('game_results')
    .upsert(
      entries.map((e) => ({
        round_id: roundId,
        block_id: e.blockId,
        placing: e.placing,
        score: e.score,
        note: e.note,
      })),
      { onConflict: 'round_id,block_id' }
    )
    .select('id, block_id');

  if (error || !inserted) return { error: 'Could not save results. Try again.' };

  const resultIdByBlock = new Map(inserted.map((r) => [r.block_id as string, r.id as string]));

  const ledger: LedgerInsert[] = [];
  for (const e of entries) {
    const resultId = resultIdByBlock.get(e.blockId) ?? null;
    ledger.push({
      block_id: e.blockId,
      round_id: roundId,
      kind: 'money',
      delta: prizeMoneyForPlacing(e.placing as number),
      reason: 'placing',
      ref_id: resultId,
    });
    if (e.bonus) {
      ledger.push({
        block_id: e.blockId,
        round_id: roundId,
        kind: 'money',
        delta: e.bonus,
        reason: 'bonus',
        ref_id: resultId,
      });
    }
  }
  await writeLedgerEntries(ledger);

  await supabase.from('rounds').update({ phase: 'spending' }).eq('id', roundId);
  await supabase.from('events').update({ phase: 'spending' }).eq('id', eventId);

  revalidatePath(`/host/${eventId}/game`);
  return { notice: 'Results saved and prize money paid out.' };
}
