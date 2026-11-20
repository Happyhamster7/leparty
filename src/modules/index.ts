import type { GameModule } from './types';
import { sss } from './sss/index';

/** Every game a host can add to a party. Add a module here to offer it. */
export const MODULES: Record<string, GameModule> = { [sss.key]: sss };

export function moduleFor(key: string): GameModule | null {
  return MODULES[key] ?? null;
}
