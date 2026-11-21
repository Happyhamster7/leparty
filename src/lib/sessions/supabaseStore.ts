import { db } from '@/lib/supabase';
import type { ApplyInput, ApplyResult, SessionHead, SessionRow, SessionStore } from './store';

const HEAD = 'id, event_id, module_key, status, version, next_deadline_at';

type HeadRow = { id: string; event_id: string; module_key: string; status: 'active' | 'archived'; version: number; next_deadline_at: string | null };

const head = (r: HeadRow): SessionHead => ({
  id: r.id,
  eventId: r.event_id,
  moduleKey: r.module_key,
  status: r.status,
  version: r.version,
  nextDeadlineAt: r.next_deadline_at ? Date.parse(r.next_deadline_at) : null,
});

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sessions in Postgres (migration 0011). Saving goes through the
 * `apply_game_action` function, which writes the new state and its log
 * entry in one transaction and refuses a stale version.
 */
export const supabaseStore: SessionStore = {
  async create({ eventId, moduleKey, state, schemaVersion, nextDeadlineAt }) {
    const { data, error } = await db()
      .from('game_sessions')
      .insert({ event_id: eventId, module_key: moduleKey, state, schema_version: schemaVersion, next_deadline_at: iso(nextDeadlineAt) })
      .select(HEAD)
      .single();
    if (error || !data) throw new Error(error?.message || 'Could not start the game.');
    return head(data as HeadRow);
  },

  async head(sessionId) {
    if (!UUID.test(sessionId)) return null;
    const { data } = await db().from('game_sessions').select(HEAD).eq('id', sessionId).maybeSingle();
    return data ? head(data as HeadRow) : null;
  },

  async load(sessionId) {
    if (!UUID.test(sessionId)) return null;
    const { data } = await db().from('game_sessions').select(`${HEAD}, state, schema_version`).eq('id', sessionId).maybeSingle();
    if (!data) return null;
    const row = data as HeadRow & { state: unknown; schema_version: number };
    return { ...head(row), state: row.state, schemaVersion: row.schema_version } satisfies SessionRow;
  },

  async activeForEvent(eventId) {
    const { data } = await db().from('game_sessions').select(HEAD).eq('event_id', eventId).eq('status', 'active').maybeSingle();
    return data ? head(data as HeadRow) : null;
  },

  async findAction(sessionId, clientActionId) {
    const { data } = await db()
      .from('game_actions')
      .select('result, version')
      .eq('session_id', sessionId)
      .eq('client_action_id', clientActionId)
      .maybeSingle();
    return data ? { result: data.result as unknown, version: data.version as number } : null;
  },

  async apply(input: ApplyInput): Promise<ApplyResult> {
    const { data, error } = await db().rpc('apply_game_action', {
      p_session_id: input.sessionId,
      p_expected_version: input.expectedVersion,
      p_state: input.state,
      p_next_deadline_at: iso(input.nextDeadlineAt),
      p_client_action_id: input.clientActionId,
      p_actor_role: input.actor.role,
      p_actor_team_id: input.actor.teamId ?? null,
      p_type: input.type,
      p_args: input.args,
      p_result: input.result ?? null,
      p_at_ms: input.atMs,
      p_seed: input.seed,
    });
    // 23505: this tap's id is already in the log. The function's save was rolled back with it.
    if (error) {
      if (error.code === '23505') return { ok: false, reason: 'duplicate' };
      throw new Error(error.message);
    }
    return typeof data === 'number' ? { ok: true, version: data } : { ok: false, reason: 'conflict' };
  },

  async archive(sessionId) {
    await db().from('game_sessions').update({ status: 'archived', next_deadline_at: null }).eq('id', sessionId);
  },
};
