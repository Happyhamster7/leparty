'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { isHost, joinCode } from '@/lib/host';
import { writeLedgerEntries } from '@/lib/ledger';
import type { HostState } from '../../../actions';

/**
 * "The host can adjust any balance manually, and the reason is
 * logged" (docs/halloween-game-design.md section 5). ledger_entries
 * has no free-text field for the other reasons, but 'host_adjust' is
 * exactly this escape hatch, so it gets one (`note`, migration 0009).
 */
export async function adjustBalance(eventId: string, _prev: HostState, formData: FormData): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const blockId = String(formData.get('block_id') || '');
  const kind = String(formData.get('kind') || '');
  const amount = parseInt(String(formData.get('amount') || ''), 10);
  const note = String(formData.get('note') || '').trim() || null;

  if (!blockId || (kind !== 'money' && kind !== 'points') || !amount) {
    return { error: 'Pick a block, a kind, and a non-zero amount.' };
  }

  await writeLedgerEntries([{ block_id: blockId, kind, delta: amount, reason: 'host_adjust', note }]);

  revalidatePath(`/host/${eventId}/game/admin`);
  return { notice: 'Balance adjusted.' };
}

/**
 * "Drinks assigned by the admin go into the same queue as the teams'
 * orders" (section 6, Orders). Only works before the queue exists —
 * patching an already-built queue needs more than this slice builds.
 */
export async function assignDrink(eventId: string, _prev: HostState, formData: FormData): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const supabase = db();
  const { data: round } = await supabase
    .from('rounds')
    .select('id, drinks_started_at')
    .eq('event_id', eventId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round) return { error: 'No round to assign a drink into yet.' };
  if (round.drinks_started_at) {
    return { error: 'This round’s drinks queue is already built — can’t add more now.' };
  }

  const targetBlockId = String(formData.get('target_block_id') || '');
  const drinkTypeId = String(formData.get('drink_type_id') || '');
  const qty = parseInt(String(formData.get('qty') || ''), 10);

  if (!targetBlockId || !drinkTypeId || !qty || qty < 1) {
    return { error: 'Pick a team, a drink, and a quantity of at least 1.' };
  }

  const { error } = await supabase.from('drink_orders').insert({
    round_id: round.id,
    sender_block_id: null,
    origin: 'admin',
    target_block_id: targetBlockId,
    drink_type_id: drinkTypeId,
    qty,
    status: 'pending',
  });
  if (error) return { error: 'Could not assign that drink. Try again.' };

  revalidatePath(`/host/${eventId}/game/admin`);
  return { notice: 'Drink assigned.' };
}

/** "If a code leaks, the host issues a new one" (section 2, Team phones). */
export async function reissueCode(eventId: string, blockId: string) {
  if (!isHost()) return;

  const alphabet = '0123456789abcdef';
  let token = '';
  for (let i = 0; i < 32; i++) token += alphabet[Math.floor(Math.random() * alphabet.length)];

  await db()
    .from('blocks')
    .update({ join_token: token, join_code: joinCode(), team_device_id: null, team_device_claimed_at: null })
    .eq('id', blockId);

  revalidatePath(`/host/${eventId}/game/admin`);
  revalidatePath(`/host/${eventId}/cards`);
}
