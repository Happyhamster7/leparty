'use server';

import { revalidatePath } from 'next/cache';
import { isHost } from '@/lib/host';
import { closePoll, getPoll, hidePoll, openPoll } from '@/lib/polls/polls';

export async function openCostumeVote(eventId: string) {
  if (!isHost()) return;
  await openPoll(eventId);
  revalidatePath(`/host/${eventId}`);
}

export async function closeCostumeVote(eventId: string, pollId: string) {
  if (!isHost()) return;
  const p = await getPoll(pollId);
  if (p?.eventId === eventId) await closePoll(pollId);
  revalidatePath(`/host/${eventId}`);
}

export async function hideCostumeVote(eventId: string, pollId: string) {
  if (!isHost()) return;
  const p = await getPoll(pollId);
  if (p?.eventId === eventId) await hidePoll(pollId);
  revalidatePath(`/host/${eventId}`);
}
