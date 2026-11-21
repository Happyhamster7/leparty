import type { ComponentType } from 'react';
import SssHost from './sss/ui/Host';
import SssTeam from './sss/ui/Team';
import SssBar from './sss/ui/Bar';
import SssDisplay from './sss/ui/Display';

/**
 * Each game's screens, one per seat. A core page (the host's game
 * page, the team phone, the bar, the TV) looks its game up here and
 * renders the screen for its seat inside a <GameScreen>.
 */
export const GAME_UI: Record<string, { Host: ComponentType; Team: ComponentType; Bar: ComponentType; Display: ComponentType }> = {
  sss: { Host: SssHost, Team: SssTeam, Bar: SssBar, Display: SssDisplay },
};
