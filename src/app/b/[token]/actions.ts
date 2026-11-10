'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { deviceCookieName, readDeviceId, freshDeviceId } from '@/lib/teamDevice';

/**
 * Claims this block for whichever device loads the page. There's no
 * captain and no explicit "scan" signal distinct from a page load, so
 * every load counts as the latest scan — matching "one team phone,
 * latest scan wins".
 *
 * The block is looked up by its join token, never by an id from the
 * client: holding the card is what entitles a phone to claim it.
 */
export async function claimTeamPhone(token: string) {
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
    .eq('join_token', token);

  revalidatePath(`/b/${token}`);
}
