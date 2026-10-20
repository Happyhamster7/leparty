'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import { loadInvite, nextStep } from '@/lib/invite';
import type { PotluckCategory } from '@/lib/types';

const CATEGORIES: PotluckCategory[] = ['protein', 'carbs', 'salad', 'snacks', 'sweets', 'alcohol'];

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
  redirect(`/i/${token}/mugshot`);
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
  if (item.split(/\s+/).filter(Boolean).length > 50) {
    return { error: 'Keep it to 50 words or fewer.' };
  }
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
      // Potluck is the last step now that mugshot comes first — this is
      // what "done" means. Previously savePhoto set this; moved here
      // when the order swapped, or the root page would've claimed
      // "nothing else to do" right after the photo, before potluck.
      signup_completed_at: new Date().toISOString(),
    })
    .eq('id', ctx.participant.id);

  revalidatePath(`/i/${token}`);
  revalidatePath(`/i/${token}/going`);
  redirect(`/i/${token}/booked`);
}

/** Called from the camera component with a downscaled JPEG. */
export async function savePhoto(token: string, formData: FormData): Promise<FormState> {
  const ctx = await loadInvite(token);
  if (!ctx) return { error: 'This link no longer works.' };

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No photo came through. Try again.' };
  }
  if (file.size > 4_000_000) {
    return { error: 'That photo is too large. Try again.' };
  }

  const supabase = db();
  const path = `${ctx.event.id}/${ctx.participant.id}.jpg`;

  const { error } = await supabase.storage
    .from(MUGSHOT_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: true });

  if (error) return { error: 'The photo would not upload. Try again.' };

  await supabase.from('participants').update({ photo_path: path }).eq('id', ctx.participant.id);

  // The camera navigates on with a client-side router.push rather than
  // a server redirect, so the router cache for the destination has to
  // be invalidated here or it serves a stale render. Mugshot is no
  // longer the last step, so this no longer stamps signup_completed_at
  // — potluck does that now.
  revalidatePath(`/i/${token}`);
  revalidatePath(`/i/${token}/mugshot`);
  revalidatePath(`/i/${token}/potluck`);
  revalidatePath(`/i/${token}/booked`);
  revalidatePath(`/i/${token}/going`);
  return { ok: true };
}

/**
 * Confirms an already-uploaded mugshot without retaking it. A mugshot
 * is required — this is not a skip path. Routes to wherever nextStep
 * says, not a hardcoded page: this is reached by revisiting mugshot
 * (e.g. the BACK link from potluck), so potluck might still be unfilled
 * even though a photo already exists.
 */
export async function finishSignup(token: string) {
  const ctx = await loadInvite(token);
  if (!ctx) return;

  if (!ctx.participant.photo_path) {
    redirect(`/i/${token}/mugshot`);
  }

  const step = nextStep(ctx);

  if (step === 'booked' && !ctx.participant.signup_completed_at) {
    await db()
      .from('participants')
      .update({ signup_completed_at: new Date().toISOString() })
      .eq('id', ctx.participant.id);
  }

  revalidatePath(`/i/${token}`);
  revalidatePath(`/i/${token}/going`);
  redirect(`/i/${token}/${step}`);
}
