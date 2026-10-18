'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { profileCookieName, loadProfile } from '@/lib/profile';

export type FormState = { error?: string };

function setProfileCookie(token: string) {
  cookies().set(profileCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Escape ILIKE wildcards so a name containing % or _ can't match more than itself. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Creates a profile on first visit, edits the existing one on a later
 * visit, or — if the name typed already belongs to someone else's
 * profile on this device-less flow — logs the guest into that existing
 * profile instead of creating a duplicate. Names are the whole matching
 * key now, so they must be unique: a DB constraint backs this up in
 * case two people submit the same new name at once.
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

  const { data: nameMatch } = await supabase
    .from('people')
    .select('id, profile_token')
    .ilike('display_name', escapeLike(name))
    .maybeSingle();

  if (existing) {
    if (nameMatch && nameMatch.id !== existing.id) {
      return {
        error: `Someone's already signed up as "${name}". If that's you, you're already in — try finding your original link. Otherwise pick a name that sets you apart.`,
      };
    }

    await supabase
      .from('people')
      .update({ display_name: name, capacity_band: band })
      .eq('id', existing.id);

    redirect('/parties');
  }

  if (nameMatch) {
    // Recognized by name — this is the returning-guest path. Bring them
    // to their existing profile instead of creating a second one.
    await supabase.from('people').update({ capacity_band: band }).eq('id', nameMatch.id);
    setProfileCookie(nameMatch.profile_token);
    redirect('/parties');
  }

  const { data: created, error } = await supabase
    .from('people')
    .insert({ display_name: name, capacity_band: band })
    .select('profile_token')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: `Someone's already signed up as "${name}". Pick a name that sets you apart.` };
    }
    return { error: 'Could not create your profile. Try again.' };
  }
  if (!created) return { error: 'Could not create your profile. Try again.' };

  setProfileCookie(created.profile_token);
  redirect('/parties');
}
