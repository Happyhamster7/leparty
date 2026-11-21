'use server';

import { revalidatePath } from 'next/cache';
import { isHost } from '@/lib/host';
import { moduleFor } from '@/modules';
import { sessions } from '@/lib/sessions/server';

/** Add a game to this party. A party runs one game at a time. */
export async function startGame(eventId: string, moduleKey: string) {
  if (!isHost() || !moduleFor(moduleKey)) return;
  // Tapping twice, or two hosts at once: the second finds the first's game and does nothing.
  if (!(await sessions.store.activeForEvent(eventId))) {
    try {
      await sessions.start(eventId, moduleKey);
    } catch {
      // The database allows one active game per party; losing that race is fine.
    }
  }
  revalidatePath(`/host/${eventId}`);
}

/** End this party's game. Its history is kept; a new game can then be added. */
export async function endGame(eventId: string, sessionId: string) {
  if (!isHost()) return;
  const head = await sessions.store.head(sessionId);
  if (head && head.eventId === eventId) await sessions.store.archive(sessionId);
  revalidatePath(`/host/${eventId}`);
}
