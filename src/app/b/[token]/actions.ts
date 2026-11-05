'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { deviceCookieName, readDeviceId, freshDeviceId } from '@/lib/teamDevice';
import { cooldownParticipantIds } from '@/lib/rounds';

/**
 * Claims this block for whichever device loads the page. There's no
 * captain and no explicit "scan" signal distinct from a page load, so
 * every load counts as the latest scan — matching "one team phone,
 * latest scan wins".
 */
export async function claimTeamPhone(blockId: string, token: string) {
  let device = readDeviceId();
  if (!device) {
    device = freshDeviceId();
    cookies().set(deviceCookieName(), device, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  await db()
    .from('blocks')
    .update({ team_device_id: device, team_device_claimed_at: new Date().toISOString() })
    .eq('id', blockId);

  revalidatePath(`/b/${token}`);
}

export type PickState = { error?: string };

export async function submitPicks(
  roundId: string,
  blockId: string,
  token: string,
  _prev: PickState,
  formData: FormData
): Promise<PickState> {
  const device = readDeviceId();
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('team_device_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!block || block.team_device_id !== device) {
    return { error: 'This phone isn’t holding the team right now — reload the page.' };
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, event_id, phase, pick_deadline, picks_revealed_at, games(players_needed, is_group)')
    .eq('id', roundId)
    .maybeSingle();
  if (!round || round.phase !== 'game' || round.picks_revealed_at) {
    return { error: 'Picks are closed for this round.' };
  }
  if (round.pick_deadline && new Date(round.pick_deadline) < new Date()) {
    return { error: 'Time’s up — the host will pick for you.' };
  }

  const { data: already } = await supabase
    .from('round_players')
    .select('participant_id')
    .eq('round_id', roundId)
    .eq('block_id', blockId);
  if (already && already.length > 0) {
    return { error: 'Already picked.' };
  }

  const game = (round as unknown as { games: { players_needed: number | null; is_group: boolean } | null })
    .games;
  const needed = game?.is_group ? null : game?.players_needed ?? 1;

  const picked = formData.getAll('participant_id').map(String);
  if (needed !== null && picked.length !== needed) {
    return { error: `Pick exactly ${needed}.` };
  }
  if (picked.length === 0) {
    return { error: 'Pick at least one player.' };
  }

  const { data: roster } = await supabase.from('participants').select('id').eq('block_id', blockId);
  const rosterIds = new Set((roster ?? []).map((p) => p.id as string));
  const cooldown = await cooldownParticipantIds(round.event_id);

  for (const pid of picked) {
    if (!rosterIds.has(pid)) return { error: 'That player isn’t on this team.' };
    if (cooldown.has(pid)) return { error: 'One of those players is on cooldown.' };
  }

  await supabase.from('round_players').insert(
    picked.map((pid) => ({
      round_id: roundId,
      block_id: blockId,
      participant_id: pid,
      picked_by: 'team' as const,
    }))
  );

  revalidatePath(`/b/${token}`);
  return {};
}
