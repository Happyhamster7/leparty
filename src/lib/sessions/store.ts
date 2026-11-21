import type { Actor } from '../../modules/types';

/** A session's row, without its document. Cheap enough to read on every poll. */
export type SessionHead = {
  id: string;
  eventId: string;
  moduleKey: string;
  status: 'active' | 'archived';
  version: number;
  /** When the game's clock next needs a nudge, in ms. */
  nextDeadlineAt: number | null;
};

export type SessionRow = SessionHead & { state: unknown; schemaVersion: number };

export type ApplyInput = {
  sessionId: string;
  expectedVersion: number;
  state: unknown;
  nextDeadlineAt: number | null;
  clientActionId: string | null;
  actor: Actor;
  type: string;
  args: Record<string, unknown>;
  result: unknown;
  atMs: number;
  seed: number;
};

export type ApplyResult =
  | { ok: true; version: number }
  /** Someone else saved first: reload and try again. */
  | { ok: false; reason: 'conflict' }
  /** This tap was already applied: return what it returned the first time. */
  | { ok: false; reason: 'duplicate' };

export type LoggedAction = { clientActionId: string | null; actor: Actor; type: string; args: Record<string, unknown>; result: unknown; version: number; atMs: number; seed: number };

/**
 * Where sessions live. The real one is Postgres (`supabaseStore.ts`);
 * tests use `memoryStore.ts`, which keeps the same promises: a save
 * and its log entry land together or not at all, a stale save is
 * refused, and a repeated tap is refused.
 */
export interface SessionStore {
  /** Throws if the party already has an active session. */
  create(input: { eventId: string; moduleKey: string; state: unknown; schemaVersion: number; nextDeadlineAt: number | null }): Promise<SessionHead>;
  head(sessionId: string): Promise<SessionHead | null>;
  load(sessionId: string): Promise<SessionRow | null>;
  activeForEvent(eventId: string): Promise<SessionHead | null>;
  findAction(sessionId: string, clientActionId: string): Promise<{ result: unknown; version: number } | null>;
  apply(input: ApplyInput): Promise<ApplyResult>;
  archive(sessionId: string): Promise<void>;
}
