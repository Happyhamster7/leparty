'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { castBallot } from '@/lib/polls/polls';
import { deviceCookieName, freshDeviceId, readDeviceId } from '@/lib/teamDevice';

export type VoteState = { error?: string; saved?: boolean };

/** One vote per phone: the phone is whoever holds this browser's device cookie. */
export async function vote(pollId: string, best: string[], worst: string[]): Promise<VoteState> {
  let voter = readDeviceId();
  if (!voter) {
    voter = freshDeviceId();
    cookies().set(deviceCookieName(), voter, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  const out = await castBallot(pollId, voter, { best, worst });
  if (!out.ok) return { error: out.error };
  revalidatePath(`/vote/${pollId}`);
  return { saved: true };
}
