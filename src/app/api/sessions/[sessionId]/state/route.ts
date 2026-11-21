import { NextResponse } from 'next/server';
import { sessions } from '@/lib/sessions/server';
import { resolveViewer } from '@/lib/sessions/viewer';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * What the caller may see of a game. Screens poll this with the
 * version they hold as `?v=`; when nothing has changed the answer is
 * `{ same: true }` and costs one small row read.
 */
export async function GET(req: Request, { params }: { params: { sessionId: string } }) {
  const head = await sessions.store.head(params.sessionId);
  if (!head) return NextResponse.json({ ok: false, error: 'No such game.' }, { status: 404, headers: noStore });

  const viewer = await resolveViewer(req, head.eventId);
  if (!viewer) return NextResponse.json({ ok: false, error: 'This screen isn’t signed in to this party.' }, { status: 401, headers: noStore });

  const v = new URL(req.url).searchParams.get('v');
  const since = v !== null && /^\d+$/.test(v) ? Number(v) : null;
  const out = await sessions.read(params.sessionId, viewer, since);
  if (!out.found) return NextResponse.json({ ok: false, error: 'No such game.' }, { status: 404, headers: noStore });
  if (out.same) return NextResponse.json({ ok: true, same: true, version: out.version }, { headers: noStore });
  return NextResponse.json({ ok: true, same: false, version: out.version, module: out.moduleKey, role: viewer.role, view: out.view, roster: out.roster, status: head.status }, { headers: noStore });
}
