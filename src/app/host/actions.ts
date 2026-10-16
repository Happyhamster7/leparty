'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import {
  hostPasscode,
  hostCookieName,
  isHost,
  joinCode,
  BLOCK_COLOURS,
  BLOCK_NAMES,
} from '@/lib/host';
import type { PotluckCategory } from '@/lib/types';

export type HostState = {
  error?: string;
  notice?: string;
  /** The name just added, so a form can clear only what it submitted. */
  added?: string;
};

const CATEGORIES: PotluckCategory[] = ['main', 'side', 'dessert', 'snack', 'ice', 'mixer'];

export async function login(_prev: HostState, formData: FormData): Promise<HostState> {
  const given = String(formData.get('passcode') || '');
  if (given !== hostPasscode()) return { error: 'Not that one.' };

  cookies().set(hostCookieName(), hostPasscode(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });

  redirect('/host');
}

export async function logout() {
  cookies().delete(hostCookieName());
  redirect('/host');
}

/** Shared by create and edit. */
function readEventFields(formData: FormData) {
  const targets: Partial<Record<PotluckCategory, number>> = {};
  for (const key of CATEGORIES) {
    const n = Number(formData.get(`target_${key}`) || 0);
    if (Number.isFinite(n) && n > 0) targets[key] = Math.min(40, Math.round(n));
  }

  const heldOn = String(formData.get('held_on') || '').trim();

  return {
    name: String(formData.get('name') || '').trim(),
    blockCount: Math.min(12, Math.max(2, Number(formData.get('block_count') || 8))),
    fields: {
      theme_key: String(formData.get('theme_key') || 'jail').trim() || 'jail',
      theme_title: String(formData.get('theme_title') || '').trim() || null,
      theme_blurb: String(formData.get('theme_blurb') || '').trim() || null,
      dress_code: String(formData.get('dress_code') || '').trim() || null,
      dress_code_notes: String(formData.get('dress_code_notes') || '').trim() || null,
      venue: String(formData.get('venue') || '').trim() || null,
      held_on: heldOn || null,
      starts_at_label: String(formData.get('starts_at_label') || '').trim() || null,
    },
    config: {
      starting_sentence: Math.max(1, Number(formData.get('starting_sentence') || 25)),
      starting_commissary: Math.max(0, Number(formData.get('starting_commissary') || 200)),
      potluck_targets: targets,
    },
  };
}

export async function createEvent(_prev: HostState, formData: FormData): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const { name, blockCount, fields, config } = readEventFields(formData);
  if (!name) return { error: 'Give the party a name.' };

  const supabase = db();

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      name,
      ...fields,
      status: 'open',
      config: { block_count: blockCount, ...config },
    })
    .select('id')
    .single();

  if (error || !event) return { error: 'Could not create the event. Check your Supabase keys.' };

  await supabase.from('blocks').insert(makeBlocks(event.id, 0, blockCount));

  revalidatePath('/host');
  redirect(`/host/${event.id}`);
}

function makeBlocks(eventId: string, from: number, to: number) {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => {
    const index = from + i;
    return {
      event_id: eventId,
      name: BLOCK_NAMES[index] ?? `Block ${index + 1}`,
      colour: BLOCK_COLOURS[index % BLOCK_COLOURS.length],
      join_code: joinCode(),
    };
  });
}

export async function updateEvent(
  eventId: string,
  _prev: HostState,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const { name, blockCount, fields, config } = readEventFields(formData);
  if (!name) return { error: 'Give the party a name.' };

  const supabase = db();

  const { data: existing } = await supabase
    .from('events')
    .select('config')
    .eq('id', eventId)
    .maybeSingle();

  const { error } = await supabase
    .from('events')
    .update({
      name,
      ...fields,
      config: { ...(existing?.config ?? {}), block_count: blockCount, ...config },
    })
    .eq('id', eventId);

  if (error) return { error: 'Could not save those changes.' };

  // Reconcile the block count. Growing adds blocks; shrinking only ever
  // removes blocks that are empty and not in play, so an in-progress
  // night can't lose a block out from under it.
  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, name, in_play')
    .eq('event_id', eventId)
    .order('name', { ascending: true });

  const current = blocks ?? [];

  if (blockCount > current.length) {
    await supabase.from('blocks').insert(makeBlocks(eventId, current.length, blockCount));
  } else if (blockCount < current.length) {
    const { data: occupied } = await supabase
      .from('participants')
      .select('block_id')
      .eq('event_id', eventId)
      .not('block_id', 'is', null);

    const inUse = new Set((occupied ?? []).map((r) => r.block_id));
    const removable = current
      .slice(blockCount)
      .filter((b) => !b.in_play && !inUse.has(b.id))
      .map((b) => b.id);

    if (removable.length > 0) {
      await supabase.from('blocks').delete().in('id', removable);
    }

    const kept = current.length - removable.length;
    if (kept > blockCount) {
      revalidatePath(`/host/${eventId}`);
      return {
        notice: `Saved, but ${kept} blocks remain — the extras have people in them or are in play. Clear the draw first if you really want fewer.`,
      };
    }
  }

  revalidatePath(`/host/${eventId}`);
  revalidatePath('/host');
  return { notice: 'Saved.' };
}

/**
 * Add someone to a party.
 *
 * The host either picks an existing person from the list or types a new
 * name. Names are never matched silently: two different people called
 * Sam Rafiq must not collapse into one profile, and a second person
 * with the same name is a real thing that happens at a 40-person party.
 */
export async function addGuest(
  eventId: string,
  _prev: HostState,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const supabase = db();
  const pickedId = String(formData.get('person_id') || '').trim();
  const name = String(formData.get('display_name') || '').trim();
  const forceNew = formData.get('force_new') === 'on';
  const bandRaw = formData.get('capacity_band');
  const band = bandRaw ? Number(bandRaw) : null;

  let personId: string | undefined;

  if (pickedId) {
    personId = pickedId;
    if (band) {
      await supabase.from('people').update({ capacity_band: band }).eq('id', personId);
    }
  } else {
    if (!name) return { error: 'Enter a name, or pick someone from the list.' };

    const { data: matches } = await supabase
      .from('people')
      .select('id, display_name')
      .eq('display_name', name);

    if ((matches?.length ?? 0) > 0 && !forceNew) {
      return {
        error: `There's already a ${name} on file. Pick them from the list above, or tick "different person" to add a second one — in which case give them a name that tells them apart, like "${name} (work)".`,
      };
    }

    const { data: created, error } = await supabase
      .from('people')
      .insert({ display_name: name, capacity_band: band })
      .select('id')
      .single();

    if (error || !created) return { error: 'Could not add that person.' };
    personId = created.id;
  }

  const { error: partError } = await supabase
    .from('participants')
    .insert({ event_id: eventId, person_id: personId });

  if (partError) return { error: 'They are already on this list.' };

  revalidatePath(`/host/${eventId}`);

  const { data: who } = await supabase
    .from('people')
    .select('display_name')
    .eq('id', personId)
    .maybeSingle();

  return { notice: `Added ${who?.display_name ?? ''}.`.trim(), added: who?.display_name ?? name };
}

export async function removeGuest(eventId: string, participantId: string) {
  if (!isHost()) return;
  await db().from('participants').delete().eq('id', participantId);
  revalidatePath(`/host/${eventId}`);
  redirect(`/host/${eventId}`);
}

export async function updateGuest(
  eventId: string,
  participantId: string,
  _prev: HostState,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const supabase = db();

  const { data: participant } = await supabase
    .from('participants')
    .select('person_id')
    .eq('id', participantId)
    .maybeSingle();

  if (!participant) return { error: 'No such guest.' };

  const name = String(formData.get('display_name') || '').trim();
  if (!name) return { error: 'They need a name.' };

  const bandRaw = formData.get('capacity_band');
  const band = bandRaw ? Number(bandRaw) : null;

  await supabase
    .from('people')
    .update({ display_name: name, capacity_band: band })
    .eq('id', participant.person_id);

  const rsvp = String(formData.get('rsvp') || 'pending');
  const category = String(formData.get('potluck_category') || '');

  await supabase
    .from('participants')
    .update({
      rsvp: ['pending', 'yes', 'no'].includes(rsvp) ? rsvp : 'pending',
      potluck_item: String(formData.get('potluck_item') || '').trim() || null,
      potluck_category: CATEGORIES.includes(category as PotluckCategory) ? category : null,
      dietary_notes: String(formData.get('dietary_notes') || '').trim() || null,
    })
    .eq('id', participantId);

  revalidatePath(`/host/${eventId}`);
  revalidatePath(`/host/${eventId}/guest/${participantId}`);
  return { notice: 'Saved.' };
}

/** New link, old one dead. For a link sent to the wrong person. */
export async function rotateInviteToken(eventId: string, participantId: string) {
  if (!isHost()) return;

  const fresh = Array.from({ length: 32 }, () =>
    '0123456789abcdef'[Math.floor(Math.random() * 16)]
  ).join('');

  await db().from('participants').update({ invite_token: fresh }).eq('id', participantId);

  revalidatePath(`/host/${eventId}/guest/${participantId}`);
  revalidatePath(`/host/${eventId}`);
  redirect(`/host/${eventId}/guest/${participantId}`);
}

export async function deleteGuestPhoto(eventId: string, participantId: string) {
  if (!isHost()) return;

  const supabase = db();
  const { data: p } = await supabase
    .from('participants')
    .select('photo_path')
    .eq('id', participantId)
    .maybeSingle();

  if (p?.photo_path) {
    await supabase.storage.from(MUGSHOT_BUCKET).remove([p.photo_path]);
  }

  await supabase.from('participants').update({ photo_path: null }).eq('id', participantId);

  revalidatePath(`/host/${eventId}/guest/${participantId}`);
  revalidatePath(`/host/${eventId}/checkin`);
  redirect(`/host/${eventId}/guest/${participantId}`);
}

/** Host-side photo upload, used at the door and on the guest page. */
export async function saveGuestPhoto(
  eventId: string,
  participantId: string,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { error: 'No photo came through.' };
  if (file.size > 4_000_000) return { error: 'That photo is too large.' };

  const supabase = db();
  const path = `${eventId}/${participantId}.jpg`;

  const { error } = await supabase.storage
    .from(MUGSHOT_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: true });

  if (error) return { error: 'The photo would not upload.' };

  await supabase.from('participants').update({ photo_path: path }).eq('id', participantId);

  revalidatePath(`/host/${eventId}/checkin`);
  revalidatePath(`/host/${eventId}/guest/${participantId}`);
  return { notice: 'Filed.' };
}

export async function saveBlocks(
  eventId: string,
  _prev: HostState,
  formData: FormData
): Promise<HostState> {
  if (!isHost()) return { error: 'Sign in first.' };

  const supabase = db();

  const { data: blocks } = await supabase.from('blocks').select('id').eq('event_id', eventId);

  for (const b of blocks ?? []) {
    const name = String(formData.get(`name_${b.id}`) || '').trim();
    const charge = String(formData.get(`charge_${b.id}`) || '').trim();
    const colour = String(formData.get(`colour_${b.id}`) || '').trim();

    const patch: Record<string, unknown> = { charge: charge || null };
    if (name) patch.name = name;
    if (/^#[0-9a-fA-F]{6}$/.test(colour)) patch.colour = colour;

    await supabase.from('blocks').update(patch).eq('id', b.id);
  }

  revalidatePath(`/host/${eventId}`);
  revalidatePath(`/host/${eventId}/cards`);
  return { notice: 'Blocks saved.' };
}

export async function setEventStatus(eventId: string, status: string) {
  if (!isHost()) return;
  await db().from('events').update({ status }).eq('id', eventId);
  revalidatePath(`/host/${eventId}`);
  revalidatePath('/host');
}
