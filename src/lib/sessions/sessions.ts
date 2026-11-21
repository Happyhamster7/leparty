import { moduleFor } from '../../modules/index';
import type { Actor, ModuleAction, Roster, Viewer } from '../../modules/types';
import { seededRng } from './rng';
import type { SessionHead, SessionStore } from './store';

export type Deps = {
  store: SessionStore;
  /** Who is at this party right now, from the core tables. */
  roster: (eventId: string) => Promise<Roster>;
  now?: () => number;
  /** A fresh 32-bit seed for one action's dice. */
  seed?: () => number;
};

export type DispatchResult =
  | { ok: true; version: number; result: unknown; duplicate: boolean }
  /** A rule said no (`code` is the module's), or the session couldn't take it. */
  | { ok: false; code: string; params: Record<string, unknown> };

export type ReadResult =
  | { found: false }
  | { found: true; same: true; version: number }
  | { found: true; same: false; version: number; moduleKey: string; view: unknown; roster: Roster };

const MAX_TRIES = 12;
const jitter = (attempt: number) => new Promise<void>((r) => setTimeout(r, Math.random() * Math.min(120, 10 * (attempt + 1))));

/**
 * Everything the app does with a running game: start one, send it an
 * action, read it. This is the only code that writes a session.
 *
 * Writes are optimistic. An action is applied to the state as read; the
 * save names the version it read and is refused if that has moved, in
 * which case it is applied again to the fresh state. Each tap carries
 * an id minted by the sender; a repeat returns the first result and
 * changes nothing.
 */
export function createSessions({ store, roster, now = Date.now, seed = () => Math.floor(Math.random() * 0x100000000) }: Deps) {
  async function start(eventId: string, moduleKey: string): Promise<SessionHead> {
    const mod = moduleFor(moduleKey);
    if (!mod) throw new Error(`Unknown game: ${moduleKey}`);
    const people = await roster(eventId);
    const state = mod.init({ now: now(), rng: seededRng(seed()), roster: people });
    return store.create({ eventId, moduleKey, state, schemaVersion: mod.schemaVersion, nextDeadlineAt: mod.nextDeadline(state, people) });
  }

  async function dispatch(sessionId: string, actor: Actor, action: ModuleAction & { id?: string | null }): Promise<DispatchResult> {
    const clientActionId = action.id ? String(action.id).slice(0, 80) : null;
    const stored = async (): Promise<DispatchResult | null> => {
      const first = clientActionId ? await store.findAction(sessionId, clientActionId) : null;
      return first ? { ok: true, version: first.version, result: first.result, duplicate: true } : null;
    };
    const again = await stored();
    if (again) return again;

    let people: Roster | null = null;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const row = await store.load(sessionId);
      if (!row || row.status !== 'active') return { ok: false, code: 'session.gone', params: {} };
      const mod = moduleFor(row.moduleKey);
      if (!mod) return { ok: false, code: 'session.gone', params: {} };
      people ||= await roster(row.eventId);
      const atMs = now();
      const s = seed();
      let out: { state: unknown; result: unknown };
      try {
        out = mod.reduce(mod.migrate(row.state), { type: action.type, args: action.args }, { now: atMs, rng: seededRng(s), roster: people, actor });
      } catch (err) {
        const refused = mod.ruleError(err);
        if (refused) return { ok: false, ...refused };
        throw err;
      }
      const saved = await store.apply({
        sessionId, expectedVersion: row.version, state: out.state, nextDeadlineAt: mod.nextDeadline(out.state, people), clientActionId,
        actor, type: action.type, args: action.args || {}, result: out.result, atMs, seed: s,
      });
      if (saved.ok) return { ok: true, version: saved.version, result: out.result, duplicate: false };
      if (saved.reason === 'duplicate') return (await stored()) ?? { ok: false, code: 'session.busy', params: {} };
      // Either someone else saved first, or this same tap did: check before applying it again.
      const landed = await stored();
      if (landed) return landed;
      await jitter(attempt);
    }
    return { ok: false, code: 'session.busy', params: {} };
  }

  /** Settle a deadline that has passed. Losing the race to another writer is fine: they settled it. */
  async function settle(sessionId: string): Promise<void> {
    const row = await store.load(sessionId);
    if (!row || row.status !== 'active') return;
    const mod = moduleFor(row.moduleKey);
    if (!mod) return;
    const people = await roster(row.eventId);
    const atMs = now();
    const s = seed();
    const next = mod.tick(mod.migrate(row.state), { now: atMs, rng: seededRng(s), roster: people });
    if (!next) return;
    await store.apply({
      sessionId, expectedVersion: row.version, state: next, nextDeadlineAt: mod.nextDeadline(next, people), clientActionId: null,
      actor: { role: 'system' }, type: 'tick', args: {}, result: null, atMs, seed: s,
    });
  }

  /**
   * What one viewer may see. Pass the version the caller already has
   * as `since`: if nothing changed, the answer is one small row read.
   * Any screen polling is what moves the clock: a passed deadline is
   * settled here before answering.
   */
  async function read(sessionId: string, viewer: Viewer, since?: number | null): Promise<ReadResult> {
    let head = await store.head(sessionId);
    if (!head) return { found: false };
    if (head.status === 'active' && head.nextDeadlineAt !== null && now() >= head.nextDeadlineAt) {
      await settle(sessionId);
      head = (await store.head(sessionId)) ?? head;
    }
    if (since !== undefined && since !== null && since === head.version) return { found: true, same: true, version: head.version };
    const row = await store.load(sessionId);
    const mod = row && moduleFor(row.moduleKey);
    if (!row || !mod) return { found: false };
    const people = await roster(row.eventId);
    return { found: true, same: false, version: row.version, moduleKey: row.moduleKey, view: mod.view(mod.migrate(row.state), people, now(), viewer), roster: people };
  }

  return { start, dispatch, read, settle, store };
}
