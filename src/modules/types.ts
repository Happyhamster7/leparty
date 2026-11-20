/**
 * What a game module is, to the rest of the app. The core knows nothing
 * about any particular game: it stores a module's state as an opaque
 * document, hands it the roster and the sender, and saves what comes
 * back. See docs/rework-plan.md.
 */

/** Who is here tonight, from `blocks` and `participants`. A module may read ids only. */
export type Roster = {
  groups: { id: string; name: string; colour: string }[];
  members: { id: string; name: string; groupId: string | null; away: boolean }[];
};

/** Who is asking. `display` can look but never act. */
export type Viewer = { role: 'host' } | { role: 'bar' } | { role: 'display' } | { role: 'team'; teamId: string };

export type Actor = { role: 'host' | 'bar' | 'team' | 'system'; teamId?: string };

export type ModuleCtx = { now: number; rng: () => number; roster: Roster };

export type ModuleAction = { type: string; args?: Record<string, unknown> };

export interface GameModule {
  key: string;
  name: string;
  /** The version of the state shape this code writes. */
  schemaVersion: number;
  /** A new session's state. */
  init(ctx: ModuleCtx): unknown;
  /** Brings a stored state up to `schemaVersion`. */
  migrate(raw: unknown): unknown;
  /** Applies one action. Pure. Throws a rule error (see `ruleError`) when a rule says no. */
  reduce(state: unknown, action: ModuleAction, ctx: ModuleCtx & { actor: Actor }): { state: unknown; result: unknown };
  /** Settles any deadline that has passed. Null if nothing was due. */
  tick(state: unknown, ctx: ModuleCtx): unknown | null;
  /** When the clock next needs a nudge, in ms, or null. */
  nextDeadline(state: unknown, roster: Roster): number | null;
  /** What this viewer may know. Secrets are left out here, never on the client. */
  view(state: unknown, roster: Roster, now: number, viewer: Viewer): unknown;
  /** If `err` is one of this module's rule refusals, its code and parameters. */
  ruleError(err: unknown): { code: string; params: Record<string, unknown> } | null;
}
