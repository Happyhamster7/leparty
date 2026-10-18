import { db } from './supabase';
import type { InviteContext, EventRow, PersonRow, ParticipantRow } from './types';

/**
 * Load everything behind an invite token. Returns null for an unknown
 * token so the page can render a generic "not found" rather than
 * leaking whether the token ever existed.
 */
export async function loadInvite(token: string): Promise<InviteContext | null> {
  const supabase = db();

  const { data: participant } = await supabase
    .from('participants')
    .select('*')
    .eq('invite_token', token)
    .maybeSingle();

  if (!participant) return null;

  const [{ data: person }, { data: event }] = await Promise.all([
    supabase.from('people').select('*').eq('id', participant.person_id).maybeSingle(),
    supabase.from('events').select('*').eq('id', participant.event_id).maybeSingle(),
  ]);

  if (!person || !event) return null;

  return {
    participant: participant as ParticipantRow,
    person: person as PersonRow,
    event: event as EventRow,
  };
}

/**
 * Has this person been to a previous party?
 *
 * Deliberately not "do they have a profile": the host can pre-fill
 * someone's capacity band when adding them, which would otherwise make
 * a first-timer look like a returning guest — greeted with "welcome
 * back" and skipped past the step where they'd correct that guess.
 */
export async function hasAttendedBefore(ctx: InviteContext): Promise<boolean> {
  const { count } = await db()
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', ctx.person.id);

  return (count ?? 1) > 1;
}

/**
 * Which step this guest still needs. Identity is set during profile
 * creation at /signup, so this almost never lands on 'identity' in
 * practice — it's just the fallback if that's somehow still missing.
 */
export function nextStep(ctx: InviteContext): 'identity' | 'potluck' | 'mugshot' | 'booked' {
  const { person, participant } = ctx;

  if (!person.display_name || person.capacity_band == null) return 'identity';
  if (!participant.potluck_item) return 'potluck';
  if (!participant.photo_path && !participant.signup_completed_at) return 'mugshot';
  return 'booked';
}
