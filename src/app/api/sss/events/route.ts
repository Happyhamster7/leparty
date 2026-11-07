import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { sssAuthorised } from '@/lib/sssAuth';

export const dynamic = 'force-dynamic';

/** Events the game app can pick from: everything not archived, newest first. */
export async function GET(req: Request) {
  if (!sssAuthorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { data, error } = await db()
    .from('events')
    .select('id, name, theme_title, held_on, status')
    .neq('status', 'archived')
    .order('held_on', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
