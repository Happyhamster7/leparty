import { db } from './supabase';
import { POTLUCK_CATEGORIES, type EventConfig, type PotluckCategory } from './types';

export type PotluckTally = {
  key: PotluckCategory;
  label: string;
  count: number;
  target: number;
  short: number;
};

/**
 * What's coming, and what's still short. Shown to guests before they
 * choose, which is what stops seven bowls of chips.
 */
export async function potluckTally(
  eventId: string,
  config: EventConfig
): Promise<PotluckTally[]> {
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

  const targets = config?.potluck_targets ?? {};

  return POTLUCK_CATEGORIES.map(({ key, label }) => {
    const count = counts.get(key) ?? 0;
    const target = targets[key] ?? 0;
    return { key, label, count, target, short: Math.max(0, target - count) };
  }).sort((a, b) => b.short - a.short || b.count - a.count);
}
