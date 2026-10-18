'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { profileCookieName, loadProfile } from '@/lib/profile';

export type FormState = { error?: string };

/**
 * Creates a profile on first visit (setting the cookie that is this
 * browser's whole identity, same pattern as a participant's invite
 * token), or edits the existing one on a later visit.
 */
export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('display_name') || '').trim();
  const bandRaw = formData.get('capacity_band');
  const band = bandRaw == null ? NaN : Number(bandRaw);

  if (!name) return { error: 'Enter the name you want on the big screen.' };
  if (!Number.isInteger(band) || band < 1 || band > 5) {
    return { error: 'Pick one of the five bands.' };
  }

  const supabase = db();
  const existing = await loadProfile();

  if (existing) {
    await supabase
      .from('people')
      .update({ display_name: name, capacity_band: band })
      .eq('id', existing.id);
  } else {
    const { data: created, error } = await supabase
      .from('people')
      .insert({ display_name: name, capacity_band: band })
      .select('profile_token')
      .single();

    if (error || !created) return { error: 'Could not create your profile. Try again.' };

    cookies().set(profileCookieName(), created.profile_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect('/parties');
}
