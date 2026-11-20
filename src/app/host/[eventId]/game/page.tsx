import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { themePack } from '@/themes';
import { moduleFor } from '@/modules';
import { GAME_UI } from '@/modules/ui';
import { sessions } from '@/lib/sessions/server';
import { GameScreen } from '@/modules/sss/ui/common';
import { wordsFor } from '@/modules/sss/voice';

export const dynamic = 'force-dynamic';

/** The host's console for the game this party is running. */
export default async function HostGamePage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');
  const { data: ev } = await db().from('events').select('name, theme_key, theme_title').eq('id', params.eventId).maybeSingle();
  if (!ev) notFound();
  const game = await sessions.store.activeForEvent(params.eventId);
  const ui = game ? GAME_UI[game.moduleKey] : null;
  const pack = themePack(ev.theme_key);

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>
          {(ev.theme_title || ev.name).toUpperCase()} &middot; {(game && moduleFor(game.moduleKey)?.name.toUpperCase()) || 'GAME'}
        </span>
        <Link href={`/host/${params.eventId}`}>CONSOLE</Link>
      </div>
      <div className="body">
        {game && ui ? (
          <GameScreen sessionId={game.id} headers={{}} words={wordsFor(pack)}>
            <ui.Host />
          </GameScreen>
        ) : (
          <>
            <h1>No game running</h1>
            <p className="lede">Add one from the party&rsquo;s console.</p>
          </>
        )}
      </div>
    </div>
  );
}
