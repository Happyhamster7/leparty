import { db } from '@/lib/supabase';
import type { Roster } from '@/modules/types';

/**
 * Who is at a party right now: every group, and everyone checked in.
 * This is the only place a game learns about people, and it is read
 * fresh from `blocks` and `participants` each time, never copied.
 */
export async function loadRoster(eventId: string): Promise<Roster> {
  const supabase = db();
  const [{ data: blocks }, { data: people }] = await Promise.all([
    supabase.from('blocks').select('id, name, colour').eq('event_id', eventId).order('name', { ascending: true }),
    supabase
      .from('participants')
      .select('id, block_id, left_early, people(display_name)')
      .eq('event_id', eventId)
      .not('checked_in_at', 'is', null),
  ]);

  return {
    groups: ((blocks ?? []) as { id: string; name: string; colour: string }[]).map((b) => ({ id: b.id, name: b.name, colour: b.colour })),
    members: ((people ?? []) as unknown as { id: string; block_id: string | null; left_early: boolean | null; people: { display_name: string } | null }[]).map((p) => ({
      id: p.id,
      name: p.people?.display_name ?? 'Unknown',
      groupId: p.block_id,
      away: !!p.left_early,
    })),
  };
}
