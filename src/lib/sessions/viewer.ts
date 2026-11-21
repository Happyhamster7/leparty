import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { readDeviceId } from '@/lib/teamDevice';
import type { Viewer } from '@/modules/types';

/**
 * Who is asking about a party's game, worked out on the server from
 * what the browser holds. Nothing here trusts a role or a team id sent
 * by the client.
 *
 * A screen that names its seat (a token header) is given that seat and
 * nothing more, even in a browser that is also signed in as host: a
 * host who picks up a team's phone sees what that team sees.
 *
 * - The host: the passcode cookie, when no seat is named.
 * - The bar and the TV: their own link's token, sent as `x-screen-token`.
 * - A team's phone: its card's token as `x-team-token`, and it must be
 *   the device that last scanned that card. An older phone is refused.
 */
export async function resolveViewer(req: Request, eventId: string): Promise<Viewer | null> {
  const screen = req.headers.get('x-screen-token') || '';
  if (/^[a-f0-9]{16,64}$/.test(screen)) {
    const { data } = await db().from('events').select('display_token, bar_token').eq('id', eventId).maybeSingle();
    if (data?.bar_token === screen) return { role: 'bar' };
    if (data?.display_token === screen) return { role: 'display' };
    return null;
  }

  const card = req.headers.get('x-team-token') || '';
  const device = readDeviceId();
  if (/^[a-f0-9]{16,64}$/.test(card) && device) {
    const { data } = await db().from('blocks').select('id, team_device_id').eq('join_token', card).eq('event_id', eventId).maybeSingle();
    if (data && data.team_device_id === device) return { role: 'team', teamId: data.id as string };
    return null;
  }

  // No seat named: the host console, if this browser is signed in as host.
  return isHost() ? { role: 'host' } : null;
}
