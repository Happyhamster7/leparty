'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import type { HostState } from '../actions';

/**
 * Mark someone present or not. If the draw has already happened and
 * this person has no block, they drop into the block holding the least
 * capacity — the agreed rule for latecomers. The draw is never re-run,
 * because a stable draw matters more than perfect balance once the
 * game is running.
 */
export async function toggleCheckIn(
  eventId: string,
  participantId: string,
  present: boolean
) {
  if (!isHost()) return;
  const supabase = db();

  const patch: Record<string, unknown> = {
    checked_in_at: present ? new Date().toISOString() : null,
  };

  if (present) {
    patch.rsvp = 'yes';

    const { data: me } = await supabase
      .from('participants')
      .select('block_id')
      .eq('id', participantId)
      .maybeSingle();

    if (me && !me.block_id) {
      const blockId = await lightestInPlayBlock(eventId);
      if (blockId) patch.block_id = blockId;
    }
  }

  await supabase.from('participants').update(patch).eq('id', participantId);
  revalidatePath(`/host/${eventId}/checkin`);
  revalidatePath(`/host/${eventId}`);
}

/** The in-play block with the least total capacity, or null before the draw. */
async function lightestInPlayBlock(eventId: string): Promise<string | null> {
  const supabase = db();

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id')
    .eq('event_id', eventId)
    .eq('in_play', true);

  if (!blocks || blocks.length === 0) return null;

  const { data: rows } = await supabase
    .from('participants')
    .select('block_id, people(capacity_band)')
    .eq('event_id', eventId)
    .not('block_id', 'is', null);

  const totals = new Map<string, number>();
  for (const b of blocks) totals.set(b.id, 0);

  for (const r of (rows ?? []) as unknown as {
    block_id: string;
    people: { capacity_band: number | null } | null;
  }[]) {
    if (!totals.has(r.block_id)) continue;
    totals.set(r.block_id, (totals.get(r.block_id) ?? 0) + (r.people?.capacity_band ?? 0));
  }

  let best: string | null = null;
  let bestTotal = Infinity;
  for (const [id, total] of totals) {
    if (total < bestTotal) {
      bestTotal = total;
      best = id;
    }
  }
  return best;
}

/** Add someone who was never on the list. Three fields, twenty seconds. */
export async function doorRegister(
  eventId: string,
  _prev: HostState,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const name = String(formData.get('display_name') || '').trim();
  if (!name) return { error: 'Enter a name.' };

  const bandRaw = formData.get('capacity_band');
  const band = bandRaw ? Number(bandRaw) : 3;

  const supabase = db();

  const { data: existing } = await supabase
    .from('people')
    .select('id')
    .eq('display_name', name)
    .maybeSingle();

  let personId = existing?.id as string | undefined;

  if (!personId) {
    const { data: created, error } = await supabase
      .from('people')
      .insert({ display_name: name, capacity_band: band })
      .select('id')
      .single();
    if (error || !created) return { error: 'Could not add that person.' };
    personId = created.id;
  }

  const { data: already } = await supabase
    .from('participants')
    .select('id')
    .eq('event_id', eventId)
    .eq('person_id', personId)
    .maybeSingle();

  if (already) {
    await toggleCheckIn(eventId, already.id, true);
    return { notice: `${name} was already on the list — marked present.`, added: name };
  }

  const blockId = await lightestInPlayBlock(eventId);

  const { error: partError } = await supabase.from('participants').insert({
    event_id: eventId,
    person_id: personId,
    rsvp: 'yes',
    checked_in_at: new Date().toISOString(),
    block_id: blockId,
  });

  if (partError) return { error: 'Could not add them to this party.' };

  revalidatePath(`/host/${eventId}/checkin`);
  return { notice: `${name} booked in.`, added: name };
}

export async function closeCheckIn(eventId: string) {
  if (!isHost()) return;
  await db().from('events').update({ status: 'checkin' }).eq('id', eventId);
  revalidatePath(`/host/${eventId}`);
  redirect(`/host/${eventId}/draw`);
}

export async function reopenCheckIn(eventId: string) {
  if (!isHost()) return;
  await db().from('events').update({ status: 'open' }).eq('id', eventId);
  revalidatePath(`/host/${eventId}/checkin`);
  redirect(`/host/${eventId}/checkin`);
}

/**
 * Commit the draw. Writes block_id on every assigned participant,
 * marks the blocks that got people as in play, and moves the event to
 * running. Blocks the draw didn't need stay out of play, so their
 * printed cards simply go unused.
 */
export async function confirmDraw(eventId: string, assignmentJson: string) {
  if (!isHost()) return;

  let assignment: Record<string, string[]>;
  try {
    assignment = JSON.parse(assignmentJson);
  } catch {
    return;
  }

  const supabase = db();

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id')
    .eq('event_id', eventId);

  const validBlocks = new Set((blocks ?? []).map((b) => b.id));
  const usedBlocks: string[] = [];

  for (const [blockId, participantIds] of Object.entries(assignment)) {
    if (!validBlocks.has(blockId)) continue;
    if (participantIds.length > 0) usedBlocks.push(blockId);

    for (const pid of participantIds) {
      await supabase
        .from('participants')
        .update({ block_id: blockId })
        .eq('id', pid)
        .eq('event_id', eventId);
    }
  }

  // Snapshot capacity at draw time so past events stay accurate even
  // as someone's band drifts between parties.
  const { data: attending } = await supabase
    .from('participants')
    .select('id, people(capacity_band)')
    .eq('event_id', eventId)
    .not('block_id', 'is', null);

  for (const row of (attending ?? []) as unknown as {
    id: string;
    people: { capacity_band: number | null } | null;
  }[]) {
    await supabase
      .from('participants')
      .update({ capacity_snapshot: row.people?.capacity_band ?? null })
      .eq('id', row.id);
  }

  await supabase.from('blocks').update({ in_play: false }).eq('event_id', eventId);
  if (usedBlocks.length > 0) {
    await supabase.from('blocks').update({ in_play: true }).in('id', usedBlocks);
  }

  await supabase.from('events').update({ status: 'running' }).eq('id', eventId);

  revalidatePath(`/host/${eventId}`);
  redirect(`/host/${eventId}/cards`);
}

export async function clearDraw(eventId: string) {
  if (!isHost()) return;
  const supabase = db();
  await supabase.from('participants').update({ block_id: null }).eq('event_id', eventId);
  await supabase.from('blocks').update({ in_play: false }).eq('event_id', eventId);
  await supabase.from('events').update({ status: 'checkin' }).eq('id', eventId);
  revalidatePath(`/host/${eventId}/draw`);
  redirect(`/host/${eventId}/draw`);
}
