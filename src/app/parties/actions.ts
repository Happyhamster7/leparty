'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { loadProfile } from '@/lib/profile';

/**
 * Self-service "I'm going". Reuses an existing participant row if one
 * already exists (e.g. they'd previously said no), otherwise creates
 * one, then drops them straight into the potluck step — identity is
 * already covered by their profile.
 */
export async function joinParty(eventId: string) {
  const person = await loadProfile();
  if (!person) redirect('/signup');

  const supabase = db();

  const { data: existing } = await supabase
    .from('participants')
    .select('id, invite_token, rsvp')
    .eq('event_id', eventId)
    .eq('person_id', person.id)
    .maybeSingle();

  if (existing) {
    if (existing.rsvp !== 'yes') {
      await supabase.from('participants').update({ rsvp: 'yes' }).eq('id', existing.id);
    }
    redirect(`/i/${existing.invite_token}/potluck`);
  }

  const { data: created, error } = await supabase
    .from('participants')
    .insert({ event_id: eventId, person_id: person.id, rsvp: 'yes' })
    .select('invite_token')
    .single();

  if (error || !created) redirect('/parties');

  redirect(`/i/${created.invite_token}/potluck`);
}
