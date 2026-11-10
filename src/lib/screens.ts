import { db } from './supabase';

export type ScreenEvent = {
  id: string;
  name: string;
  theme_key: string;
  theme_title: string | null;
  status: string;
};

/**
 * The two screens that aren't the host's. Each opens with its own
 * unguessable link (`events.display_token`, `events.bar_token`), so the
 * TV and the bar tablet never hold the host passcode and can't do what
 * a host can. Holding the link is the whole of the role.
 */
export type ScreenRole = 'display' | 'bar';

const COLUMN: Record<ScreenRole, string> = { display: 'display_token', bar: 'bar_token' };

/** The party a screen link belongs to, or null for an unknown or archived one. */
export async function eventForScreen(role: ScreenRole, token: string): Promise<ScreenEvent | null> {
  if (!/^[a-f0-9]{16,64}$/.test(token)) return null;
  const { data } = await db()
    .from('events')
    .select('id, name, theme_key, theme_title, status')
    .eq(COLUMN[role], token)
    .neq('status', 'archived')
    .maybeSingle();
  return (data as ScreenEvent | null) ?? null;
}
