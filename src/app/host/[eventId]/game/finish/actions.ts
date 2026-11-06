'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';

/** "Last round → Confirm the winner" (section 12, host workflow). */
export async function confirmWinner(eventId: string, formData: FormData) {
  if (!isHost()) return;

  const blockId = String(formData.get('block_id') || '');
  if (!blockId) return;

  await db().from('events').update({ ended_at: new Date().toISOString(), winner_block_id: blockId }).eq('id', eventId);

  revalidatePath(`/host/${eventId}/game/finish`);
  revalidatePath(`/host/${eventId}/game`);
  revalidatePath(`/host/${eventId}/game/screen`);
}
