'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase';

export type JoinState = { error?: string };

/**
 * The typed fallback for when a camera won't scan. Codes are unique
 * per event, so this resolves against the newest party that isn't
 * archived.
 */
export async function joinByCode(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const code = String(formData.get('code') || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  if (code.length < 4) return { error: 'That code looks too short.' };

  const supabase = db();

  const { data: events } = await supabase
    .from('events')
    .select('id')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(10);

  const eventIds = (events ?? []).map((e) => e.id);
  if (eventIds.length === 0) return { error: 'No parties are running.' };

  const { data: block } = await supabase
    .from('blocks')
    .select('join_token')
    .in('event_id', eventIds)
    .eq('join_code', code)
    .maybeSingle();

  if (!block) return { error: 'No block has that code. Check the card again.' };

  redirect(`/b/${block.join_token}`);
}
