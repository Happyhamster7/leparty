'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db, CLIPS_BUCKET } from '@/lib/supabase';
import { deviceCookieName, readDeviceId, freshDeviceId } from '@/lib/teamDevice';
import { cooldownParticipantIds } from '@/lib/rounds';
import { moneyBalance, writeLedgerEntries } from '@/lib/ledger';
import { priceOrder } from '@/lib/drinkPricing';
import { computeItemStatus, type ItemRow } from '@/lib/spending';
import { eyeSpyReport } from '@/lib/items';
import { activeBounty, isRoundWinner, createBounty } from '@/lib/bounty';

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

export type OrderState = { error?: string };

/**
 * A team's secret drink order. Money is charged now — not when the
 * drink is served — per docs/schema.md's "Starting the drinks phase".
 */
export async function placeOrder(
  roundId: string,
  blockId: string,
  token: string,
  _prev: OrderState,
  formData: FormData
): Promise<OrderState> {
  const device = readDeviceId();
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('team_device_id, event_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!block || block.team_device_id !== device) {
    return { error: 'This phone isn’t holding the team right now — reload the page.' };
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, phase, shop_closed_at')
    .eq('id', roundId)
    .maybeSingle();
  if (!round || round.phase !== 'spending' || round.shop_closed_at) {
    return { error: 'The shop is closed.' };
  }

  const targetBlockId = String(formData.get('target_block_id') || '');
  const drinkTypeId = String(formData.get('drink_type_id') || '');
  const qty = parseInt(String(formData.get('qty') || ''), 10);

  if (!targetBlockId || !drinkTypeId || !qty || qty < 1) {
    return { error: 'Pick a team, a drink and a quantity of at least 1.' };
  }

  const [{ data: targetBlock }, { data: drinkType }] = await Promise.all([
    supabase
      .from('blocks')
      .select('id')
      .eq('id', targetBlockId)
      .eq('event_id', block.event_id)
      .eq('in_play', true)
      .maybeSingle(),
    supabase
      .from('drink_types')
      .select('id, name, cost, points')
      .eq('id', drinkTypeId)
      .eq('event_id', block.event_id)
      .maybeSingle(),
  ]);

  if (!targetBlock) return { error: 'That team isn’t in play.' };
  if (!drinkType) return { error: 'Pick a drink from the list.' };

  const { cost } = priceOrder(drinkType.name, drinkType.cost, drinkType.points, qty);

  const balance = await moneyBalance(blockId);
  if (balance < cost) {
    return { error: `Not enough money — this order costs ${cost}, you have ${balance}.` };
  }

  const { data: order, error } = await supabase
    .from('drink_orders')
    .insert({
      round_id: roundId,
      sender_block_id: blockId,
      origin: 'team',
      target_block_id: targetBlockId,
      drink_type_id: drinkTypeId,
      qty,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !order) return { error: 'Could not place that order. Try again.' };

  await writeLedgerEntries([
    {
      block_id: blockId,
      round_id: roundId,
      kind: 'money',
      delta: -cost,
      reason: 'drink_cost',
      ref_id: order.id,
    },
  ]);

  revalidatePath(`/b/${token}`);
  return {};
}

export type ShopState = { error?: string };

function statusMessage(status: ReturnType<typeof computeItemStatus>): string {
  switch (status) {
    case 'bought_this_round':
      return 'Already bought this round.';
    case 'bought_tonight':
      return 'Already used for the night.';
    case 'taken_this_round':
      return 'Reflect’s already been played by someone this round.';
    case 'not_priced':
      return 'Not priced yet — ask the host.';
    case 'bounty_active':
      return 'You already have a bounty running — only one at a time.';
    case 'not_round_winner':
      return 'Only the team that just won this round’s game can buy this.';
    default:
      return 'Not available.';
  }
}

/** Buys Eye Spy, Reflect, or either Bounty — the items priced so far, see src/lib/catalogue.ts. */
export async function buyItem(
  roundId: string,
  blockId: string,
  token: string,
  itemKey: string,
  _prev: ShopState,
  _formData: FormData
): Promise<ShopState> {
  const device = readDeviceId();
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('team_device_id, event_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!block || block.team_device_id !== device) {
    return { error: 'This phone isn’t holding the team right now — reload the page.' };
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, number, phase, shop_closed_at')
    .eq('id', roundId)
    .maybeSingle();
  if (!round || round.phase !== 'spending' || round.shop_closed_at) {
    return { error: 'The shop is closed.' };
  }

  const { data: item } = await supabase
    .from('items')
    .select('id, key, price, limit_per_round, limit_per_night')
    .eq('event_id', block.event_id)
    .eq('key', itemKey)
    .maybeSingle();
  if (!item) return { error: 'That item doesn’t exist for this event.' };

  const { data: usesRows } = await supabase
    .from('item_uses')
    .select('round_id, block_id')
    .eq('item_id', item.id);
  let status = computeItemStatus(item as ItemRow, usesRows ?? [], roundId, blockId);

  const isBounty = item.key === 'open_bounty' || item.key === 'winners_bounty';
  if (status === 'available' && isBounty) {
    if (await activeBounty(blockId)) {
      status = 'bounty_active';
    } else if (item.key === 'winners_bounty' && !(await isRoundWinner(roundId, blockId))) {
      status = 'not_round_winner';
    }
  }

  if (status !== 'available') {
    return { error: statusMessage(status) };
  }

  const balance = await moneyBalance(blockId);
  if (item.price === null || balance < item.price) {
    return { error: `Not enough money — this costs ${item.price ?? '?'}, you have ${balance}.` };
  }

  const result = item.key === 'eye_spy' ? await eyeSpyReport(blockId) : null;

  const { data: use, error } = await supabase
    .from('item_uses')
    .insert({ round_id: roundId, block_id: blockId, item_id: item.id, result })
    .select('id')
    .single();
  if (error || !use) return { error: 'Could not record that purchase. Try again.' };

  await writeLedgerEntries([
    { block_id: blockId, round_id: roundId, kind: 'money', delta: -item.price, reason: 'item', ref_id: use.id },
  ]);

  if (isBounty) {
    await createBounty({
      itemUseId: use.id,
      blockId,
      eventId: block.event_id,
      startRoundNumber: round.number,
      itemKey: item.key,
    });
  }

  revalidatePath(`/b/${token}`);
  return {};
}

export type ClipUploadStart = { error?: string; uploadUrl?: string; clipId?: string };

/**
 * Hands the team phone a one-time signed upload URL so the video
 * never passes through a Vercel function (docs/halloween-game-design.md,
 * "Direct upload"). The browser PUTs straight to Supabase Storage with
 * a plain fetch/XHR — no Supabase client in the browser, matching the
 * app's service-role-only rule — mirroring what the SDK's own
 * uploadToSignedUrl does under the hood (FormData with a cacheControl
 * field and the file under an empty-string key).
 */
export async function beginClipUpload(
  roundId: string,
  blockId: string,
  token: string,
  _prev: ClipUploadStart,
  _formData: FormData
): Promise<ClipUploadStart> {
  const device = readDeviceId();
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('team_device_id, event_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!block || block.team_device_id !== device) {
    return { error: 'This phone isn’t holding the team right now — reload the page.' };
  }

  const { data: serve } = await supabase
    .from('serves')
    .select('id, served_at')
    .eq('round_id', roundId)
    .eq('block_id', blockId)
    .maybeSingle();
  if (!serve || !serve.served_at) return { error: 'Nothing to film right now.' };

  const suffix = Math.random().toString(36).slice(2, 10);
  const path = `${block.event_id}/${serve.id}/${suffix}.mov`;

  const { data: signed, error: signError } = await supabase.storage
    .from(CLIPS_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) return { error: 'Could not start the upload. Try again.' };

  const { data: clip, error } = await supabase
    .from('clips')
    .insert({ serve_id: serve.id, storage_path: path, upload_state: 'pending' })
    .select('id')
    .single();
  if (error || !clip) return { error: 'Could not start the upload. Try again.' };

  return { uploadUrl: signed.signedUrl, clipId: clip.id };
}

async function clipBelongsToDevice(clipId: string, device: string | null): Promise<boolean> {
  if (!device) return false;
  const supabase = db();

  const { data: clip } = await supabase.from('clips').select('serve_id').eq('id', clipId).maybeSingle();
  if (!clip) return false;

  const { data: serve } = await supabase.from('serves').select('block_id').eq('id', clip.serve_id).maybeSingle();
  if (!serve) return false;

  const { data: block } = await supabase.from('blocks').select('team_device_id').eq('id', serve.block_id).maybeSingle();
  return !!block && block.team_device_id === device;
}

export async function confirmClipUploaded(clipId: string, token: string): Promise<void> {
  if (!(await clipBelongsToDevice(clipId, readDeviceId()))) return;

  await db()
    .from('clips')
    .update({ upload_state: 'uploaded', uploaded_at: new Date().toISOString() })
    .eq('id', clipId);

  revalidatePath(`/b/${token}`);
}

export async function markClipFailed(clipId: string, token: string): Promise<void> {
  if (!(await clipBelongsToDevice(clipId, readDeviceId()))) return;

  await db().from('clips').update({ upload_state: 'failed' }).eq('id', clipId);

  revalidatePath(`/b/${token}`);
}
