import { NextResponse } from 'next/server';
import { sessions } from '@/lib/sessions/server';
import { resolveViewer } from '@/lib/sessions/viewer';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * One action on a game: `{ type, args, id }`. `id` is minted by the
 * sender once per tap; sending it again returns the first answer and
 * changes nothing. Who is acting comes from the request's cookie or
 * token, never from the body.
 *
 * A rule saying no is a 200 with `ok: false` and the rule's code, so
 * the screen can say why in the party's own words.
 */
export async function POST(req: Request, { params }: { params: { sessionId: string } }) {
  const head = await sessions.store.head(params.sessionId);
  if (!head) return NextResponse.json({ ok: false, error: 'No such game.' }, { status: 404, headers: noStore });

  const viewer = await resolveViewer(req, head.eventId);
  if (!viewer) return NextResponse.json({ ok: false, error: 'This screen isn’t signed in to this party.' }, { status: 401, headers: noStore });
  if (viewer.role === 'display') return NextResponse.json({ ok: false, code: 'action.forbidden', params: {} }, { status: 403, headers: noStore });

  let body: { type?: unknown; args?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Send JSON.' }, { status: 400, headers: noStore });
  }
  if (typeof body.type !== 'string' || !body.type) return NextResponse.json({ ok: false, error: 'An action needs a type.' }, { status: 400, headers: noStore });
  const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? (body.args as Record<string, unknown>) : {};
  const id = typeof body.id === 'string' && body.id ? body.id : null;

  const out = await sessions.dispatch(params.sessionId, viewer, { type: body.type, args, id });
  return NextResponse.json(out, { headers: noStore });
}
