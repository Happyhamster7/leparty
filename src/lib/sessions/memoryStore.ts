import type { ApplyInput, ApplyResult, LoggedAction, SessionHead, SessionRow, SessionStore } from './store';

/**
 * Sessions in memory, for tests. Behaves like the Postgres store: every
 * call is async, documents are copied in and out, and `apply` is all or
 * nothing.
 */
export function memoryStore() {
  const rows = new Map<string, SessionRow>();
  const log = new Map<string, LoggedAction[]>();
  let n = 0;
  const pause = () => new Promise<void>((r) => setImmediate(r));
  const head = ({ state: _state, schemaVersion: _sv, ...h }: SessionRow): SessionHead => ({ ...h });

  const store: SessionStore & { actions(sessionId: string): LoggedAction[]; applies: number } = {
    applies: 0,
    actions: (sessionId) => log.get(sessionId) || [],
    async create({ eventId, moduleKey, state, schemaVersion, nextDeadlineAt }) {
      await pause();
      if ([...rows.values()].some((r) => r.eventId === eventId && r.status === 'active')) throw new Error('active session exists');
      const row: SessionRow = { id: `s${++n}`, eventId, moduleKey, status: 'active', version: 0, nextDeadlineAt, state: structuredClone(state), schemaVersion };
      rows.set(row.id, row);
      log.set(row.id, []);
      return head(row);
    },
    async head(id) {
      await pause();
      const r = rows.get(id);
      return r ? head(r) : null;
    },
    async load(id) {
      await pause();
      const r = rows.get(id);
      return r ? structuredClone(r) : null;
    },
    async activeForEvent(eventId) {
      await pause();
      const r = [...rows.values()].find((x) => x.eventId === eventId && x.status === 'active');
      return r ? head(r) : null;
    },
    async findAction(sessionId, clientActionId) {
      await pause();
      const a = (log.get(sessionId) || []).find((x) => x.clientActionId === clientActionId);
      return a ? { result: structuredClone(a.result), version: a.version } : null;
    },
    async apply(input: ApplyInput): Promise<ApplyResult> {
      await pause();
      store.applies += 1;
      const r = rows.get(input.sessionId);
      // Checked and written with no await between, as one transaction would be.
      if (!r || r.status !== 'active' || r.version !== input.expectedVersion) return { ok: false, reason: 'conflict' };
      const actions = log.get(r.id) as LoggedAction[];
      if (input.clientActionId && actions.some((a) => a.clientActionId === input.clientActionId)) return { ok: false, reason: 'duplicate' };
      r.state = structuredClone(input.state);
      r.version += 1;
      r.nextDeadlineAt = input.nextDeadlineAt;
      actions.push(structuredClone({ clientActionId: input.clientActionId, actor: input.actor, type: input.type, args: input.args, result: input.result, version: r.version, atMs: input.atMs, seed: input.seed }));
      return { ok: true, version: r.version };
    },
    async archive(id) {
      await pause();
      const r = rows.get(id);
      if (r) r.status = 'archived';
    },
  };
  return store;
}
