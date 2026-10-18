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

export type PotluckItem = {
  item: string;
  categoryLabel: string | null;
  name: string;
};

/** What's actually being brought, and by whom — so a guest can see the list before picking their own thing. */
export async function potluckItems(eventId: string): Promise<PotluckItem[]> {
  const { data } = await db()
    .from('participants')
    .select('potluck_item, potluck_category, people(display_name)')
    .eq('event_id', eventId)
    .eq('rsvp', 'yes')
    .not('potluck_item', 'is', null)
    .order('created_at', { ascending: true });

  const labelByKey = new Map(POTLUCK_CATEGORIES.map((c) => [c.key, c.label]));

  return ((data ?? []) as unknown as {
    potluck_item: string;
    potluck_category: PotluckCategory | null;
    people: { display_name: string } | null;
  }[]).map((r) => ({
    item: r.potluck_item,
    categoryLabel: r.potluck_category ? labelByKey.get(r.potluck_category) ?? null : null,
    name: r.people?.display_name ?? 'Someone',
  }));
}
