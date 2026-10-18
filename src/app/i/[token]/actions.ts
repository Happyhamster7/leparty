'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import { loadInvite, nextStep } from '@/lib/invite';
import type { PotluckCategory } from '@/lib/types';

const CATEGORIES: PotluckCategory[] = ['protein', 'carbs', 'snacks', 'sweets', 'alcohol'];

/** Shape every form action returns, so useFormState can render errors. */
export type FormState = { error?: string; ok?: boolean };

export async function setRsvp(token: string, answer: 'yes' | 'no') {
  const ctx = await loadInvite(token);
  if (!ctx) return;

  await db().from('participants').update({ rsvp: answer }).eq('id', ctx.participant.id);

  revalidatePath(`/i/${token}`);

  if (answer === 'no') redirect(`/i/${token}/declined`);

  redirect(
    `/i/${token}/${nextStep({ ...ctx, participant: { ...ctx.participant, rsvp: 'yes' } })}`
  );
}

export async function saveIdentity(
  token: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await loadInvite(token);
  if (!ctx) return { error: 'This link no longer works.' };

  const name = String(formData.get('display_name') || '').trim();
  const bandRaw = formData.get('capacity_band');
  const band = bandRaw == null ? NaN : Number(bandRaw);

  if (!name) return { error: 'Enter the name you want on the big screen.' };
  if (!Number.isInteger(band) || band < 1 || band > 5) {
    return { error: 'Pick one of the five bands.' };
  }

  await db()
    .from('people')
    .update({ display_name: name, capacity_band: band })
    .eq('id', ctx.person.id);

  await db().from('participants').update({ rsvp: 'yes' }).eq('id', ctx.participant.id);

  revalidatePath(`/i/${token}`);
  redirect(`/i/${token}/potluck`);
}

export async function savePotluck(
  token: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await loadInvite(token);
  if (!ctx) return { error: 'This link no longer works.' };

  const item = String(formData.get('potluck_item') || '').trim();
  const category = String(formData.get('potluck_category') || '') as PotluckCategory;
  const dietary = String(formData.get('dietary_notes') || '').trim();

  if (!item) return { error: 'Say what you’re bringing, even roughly.' };
  if (!CATEGORIES.includes(category)) return { error: 'Pick a category.' };

  await db()
    .from('participants')
    .update({
      potluck_item: item,
      potluck_category: category,
      dietary_notes: dietary || null,
      // Anyone filling in what they're bringing is coming. Belt and
      // braces: a returning guest can reach here without passing
      // through the identity step that would otherwise set this.
      rsvp: 'yes',
    })
    .eq('id', ctx.participant.id);

  revalidatePath(`/i/${token}`);
  redirect(`/i/${token}/mugshot`);
}

/** Called from the camera component with a downscaled JPEG. */
export async function savePhoto(token: string, formData: FormData): Promise<FormState> {
  const ctx = await loadInvite(token);
  if (!ctx) return { error: 'This link no longer works.' };

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No photo came through. Try again, or skip it.' };
  }
  if (file.size > 4_000_000) {
    return { error: 'That photo is too large. Try again.' };
  }

  const supabase = db();
  const path = `${ctx.event.id}/${ctx.participant.id}.jpg`;

  const { error } = await supabase.storage
    .from(MUGSHOT_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: true });

  if (error) return { error: 'The photo would not upload. You can skip it for now.' };

  await supabase
    .from('participants')
    .update({ photo_path: path, signup_completed_at: new Date().toISOString() })
    .eq('id', ctx.participant.id);

  // The camera navigates on to /booked with a client-side router.push
  // rather than a server redirect, so the router cache for that exact
  // path has to be invalidated here or it serves the stale, photo-less
  // render instead of fetching the one that now has the photo.
  revalidatePath(`/i/${token}`);
  revalidatePath(`/i/${token}/mugshot`);
  revalidatePath(`/i/${token}/booked`);
  return { ok: true };
}

export async function finishSignup(token: string) {
  const ctx = await loadInvite(token);
  if (!ctx) return;

  if (!ctx.participant.signup_completed_at) {
    await db()
      .from('participants')
      .update({ signup_completed_at: new Date().toISOString() })
      .eq('id', ctx.participant.id);
  }

  revalidatePath(`/i/${token}`);
  redirect(`/i/${token}/booked`);
}
