import { createSessions } from './sessions';
import { supabaseStore } from './supabaseStore';
import { loadRoster } from './roster';

/** The app's sessions: Postgres for storage, the core tables for who is here. */
export const sessions = createSessions({ store: supabaseStore, roster: loadRoster });
