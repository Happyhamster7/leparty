import { cookies } from 'next/headers';
import { db } from './supabase';
import type { PersonRow } from './types';

const COOKIE = 'leparty_profile';

export function profileCookieName(): string {
  return COOKIE;
}

/** The signed-in guest's profile for this browser, or null if there isn't one yet. */
export async function loadProfile(): Promise<PersonRow | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;

  const { data } = await db()
    .from('people')
    .select('*')
    .eq('profile_token', token)
    .maybeSingle();

  return (data as PersonRow) ?? null;
}
