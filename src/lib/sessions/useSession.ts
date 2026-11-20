'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Roster } from '@/modules/types';

export type Sent = { ok: true; result: unknown; duplicate: boolean } | { ok: false; code: string; params: Record<string, unknown> };

export type SessionData<V> = { version: number; role: string; view: V; roster: Roster; status: 'active' | 'archived' };

/**
 * A screen's live connection to a game. Polls for changes (a cheap
 * "anything new since version N?" most of the time) and sends actions.
 *
 * `status` is 'denied' when the server won't serve this screen: a team
 * phone that another phone has taken over, or a link that's been
 * replaced. The screen should say so, not show stale data.
 */
export function useSession<V>(sessionId: string, headers: Record<string, string>, everyMs = 2000) {
  const [data, setData] = useState<SessionData<V> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied' | 'gone' | 'offline'>('loading');
  const version = useRef<number | null>(null);
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const pull = useCallback(
    async (force = false) => {
      try {
        const v = !force && version.current !== null ? `?v=${version.current}` : '';
        const res = await fetch(`/api/sessions/${sessionId}/state${v}`, { headers: headersRef.current, cache: 'no-store' });
        if (res.status === 401 || res.status === 403) return setStatus('denied');
        if (res.status === 404) return setStatus('gone');
        const body = await res.json();
        setStatus('ok');
        if (body.same) return;
        // An older answer that lost the race must not overwrite a newer one.
        if (version.current !== null && body.version < version.current) return;
        version.current = body.version;
        setData({ version: body.version, role: body.role, view: body.view, roster: body.roster, status: body.status });
      } catch {
        setStatus((s) => (s === 'ok' ? 'offline' : s));
      }
    },
    [sessionId],
  );

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!document.hidden) await pull();
      if (alive) timer = setTimeout(loop, everyMs);
    };
    loop();
    const wake = () => !document.hidden && pull();
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [pull, everyMs]);

  /**
   * Send one action. Each call mints its own id, so if the request is
   * retried or the button is hit twice in a way that reuses it, the
   * server applies it once.
   */
  const send = useCallback(
    async (type: string, args: Record<string, unknown> = {}, id: string = crypto.randomUUID()): Promise<Sent> => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headersRef.current },
          body: JSON.stringify({ type, args, id }),
        });
        if (res.status === 401) {
          setStatus('denied');
          return { ok: false, code: 'action.forbidden', params: {} };
        }
        const body = await res.json();
        await pull(true);
        if (body.ok) return { ok: true, result: body.result, duplicate: !!body.duplicate };
        return { ok: false, code: body.code || 'action.unknown', params: body.params || {} };
      } catch {
        return { ok: false, code: 'net.offline', params: {} };
      }
    },
    [sessionId, pull],
  );

  return { data, status, send, refresh: () => pull(true) };
}
