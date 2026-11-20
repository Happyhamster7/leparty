import { notFound } from 'next/navigation';
import { eventForScreen } from '@/lib/screens';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import AutoRefresh from '@/components/AutoRefresh';
import { sessions } from '@/lib/sessions/server';
import { GAME_UI } from '@/modules/ui';
import { GameScreen } from '@/modules/sss/ui/common';
import { wordsFor } from '@/modules/sss/voice';

export const dynamic = 'force-dynamic';

/**
 * The bar's tablet. A running game fills this page with its queue;
 * with no game there is nothing to pour. The bar has its own link, so
 * it never holds the host's passcode.
 *
 * The page itself refreshes every few seconds so it notices a game
 * being added or ended; the game's own screen polls faster than that.
 */
export default async function BarPage({ params }: { params: { token: string } }) {
  const ev = await eventForScreen('bar', params.token);
  if (!ev) notFound();

  const pack = themePack(ev.theme_key);
  const game = await sessions.store.activeForEvent(ev.id);
  const ui = game ? GAME_UI[game.moduleKey] : null;

  return (
    <>
      <ThemeStyle pack={pack} />
      <AutoRefresh seconds={5} />
      <div className="shell shell--wide">
        <div className="topbar">
          <span>{(ev.theme_title || ev.name).toUpperCase()}</span>
          <span>BAR</span>
        </div>
        <div className="body">
          {game && ui ? (
            <GameScreen sessionId={game.id} headers={{ 'x-screen-token': params.token }} words={wordsFor(pack)}>
              <ui.Bar />
            </GameScreen>
          ) : (
            <>
              <h1>Nothing to pour</h1>
              <p className="lede">
                Orders show up here when a game with a bar is running. Leave this page open.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
