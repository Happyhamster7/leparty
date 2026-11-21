'use server';

import { db } from '@/lib/supabase';
import { readDeviceId } from '@/lib/teamDevice';
import { beginClip, confirmClip } from '@/lib/clips/clips';

/** The block this phone holds right now, from its card's token and its device cookie. */
async function myBlock(token: string): Promise<{ id: string; eventId: string } | null> {
  const device = readDeviceId();
  if (!device) return null;
  const { data } = await db().from('blocks').select('id, event_id, team_device_id').eq('join_token', token).maybeSingle();
  return data && data.team_device_id === device ? { id: data.id as string, eventId: data.event_id as string } : null;
}

export async function startClip(token: string, type: string, size: number) {
  const block = await myBlock(token);
  if (!block) return { ok: false as const, error: 'Another phone has taken over this card. Reload to take it back.' };
  return beginClip(block.eventId, block.id, { type, size });
}

export async function finishClip(token: string, clipId: string, caption: string): Promise<boolean> {
  const block = await myBlock(token);
  return block ? confirmClip(clipId, block.id, caption) : false;
}
