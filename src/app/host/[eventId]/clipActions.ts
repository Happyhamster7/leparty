'use server';

import { revalidatePath } from 'next/cache';
import { isHost } from '@/lib/host';
import { setClipHidden } from '@/lib/clips/clips';

export async function hideClip(eventId: string, clipId: string, hidden: boolean) {
  if (!isHost()) return;
  await setClipHidden(eventId, clipId, hidden);
  revalidatePath(`/host/${eventId}`);
}
