import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { sssAuthorised } from '@/lib/sssAuth';

export const dynamic = 'force-dynamic';

/**
 * One event's blocks and checked-in guests, for the game app to mirror.
 *
 * Blocks: the ones the draw put in play, plus any block a checked-in
 * guest is on (a latecomer lands on the lightest block at check-in).
 * Before the draw no guest has a block, so the game app holds them until
 * it runs. Guests: everyone checked in, with their block (or null) and
 * whether the host flagged them as having left early.
 */
export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  if (!sssAuthorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const supabase = db();

  const { data: event } = await supabase
    .from('events')
    .select('id, name, theme_title, status')
    .eq('id', params.eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: 'No such event' }, { status: 404 });

  const [{ data: blocks, error: blockError }, { data: participants, error: guestError }] = await Promise.all([
    supabase.from('blocks').select('id, name, colour, in_play').eq('event_id', params.eventId).order('name', { ascending: true }),
    supabase
      .from('participants')
      .select('id, block_id, left_early, people(display_name)')
      .eq('event_id', params.eventId)
      .not('checked_in_at', 'is', null),
  ]);
  if (blockError || guestError) return NextResponse.json({ error: (blockError || guestError)?.message }, { status: 500 });

  const guests = ((participants ?? []) as unknown as {
    id: string;
    block_id: string | null;
    left_early: boolean | null;
    people: { display_name: string } | null;
  }[])
    .filter((p) => p.people?.display_name)
    .map((p) => ({ id: p.id, name: p.people!.display_name, blockId: p.block_id, leftEarly: !!p.left_early }));

  const used = new Set(guests.map((g) => g.blockId).filter(Boolean));
  const out = ((blocks ?? []) as { id: string; name: string; colour: string | null; in_play: boolean | null }[])
    .filter((b) => b.in_play || used.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, colour: b.colour }));

  return NextResponse.json({ event, blocks: out, guests, at: new Date().toISOString() });
}
