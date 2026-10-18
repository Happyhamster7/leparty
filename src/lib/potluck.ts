import { db } from './supabase';
import { POTLUCK_CATEGORIES, type PotluckCategory } from './types';

export type PotluckTally = {
  key: PotluckCategory;
  label: string;
  count: number;
};

/** A running count of who's bringing what — no targets, just the tally. */
export async function potluckTally(eventId: string): Promise<PotluckTally[]> {
  const { data } = await db()
    .from('participants')
    .select('potluck_category')
    .eq('event_id', eventId)
    .eq('rsvp', 'yes')
    .not('potluck_category', 'is', null);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const key = row.potluck_category as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return POTLUCK_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    count: counts.get(key) ?? 0,
  }));
}
