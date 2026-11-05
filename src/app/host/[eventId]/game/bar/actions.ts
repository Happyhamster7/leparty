'use server';

import { revalidatePath } from 'next/cache';
import { isHost } from '@/lib/host';
import { markServed, markDone } from '@/lib/drinks';

export async function serveNext(eventId: string, roundId: string, serveId: string) {
  if (!isHost()) return;
  await markServed(roundId, serveId);
  revalidatePath(`/host/${eventId}/game/bar`);
  revalidatePath(`/host/${eventId}/game`);
}

export async function serveDone(eventId: string, roundId: string, serveId: string) {
  if (!isHost()) return;
  await markDone(roundId, serveId);
  revalidatePath(`/host/${eventId}/game/bar`);
  revalidatePath(`/host/${eventId}/game`);
}
