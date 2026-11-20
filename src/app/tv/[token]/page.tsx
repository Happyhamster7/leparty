import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { eventForScreen } from '@/lib/screens';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import AutoRefresh from '@/components/AutoRefresh';
import { sessions } from '@/lib/sessions/server';
import { GAME_UI } from '@/modules/ui';
import { GameScreen } from '@/modules/sss/ui/common';
import { wordsFor } from '@/modules/sss/voice';
import QRCode from 'qrcode';
import { showingPoll } from '@/lib/polls/polls';
import { siteUrl } from '@/lib/supabase';
import { listClips } from '@/lib/clips/clips';
import ClipReel from '@/components/ClipReel';

export const dynamic = 'force-dynamic';

/**
 * The public display. Works with no game running: the party's title,
 * who has arrived, and the groups once they're drawn. A game module
 * takes over the main area when one is live.
 */
export default async function TvPage({ params }: { params: { token: string } }) {
  const ev = await eventForScreen('display', params.token);
  if (!ev) notFound();

  const supabase = db();
  const [{ data: blocks }, { data: arrived }] = await Promise.all([
    supabase.from('blocks').select('id, name, colour, in_play').eq('event_id', ev.id).order('name', { ascending: true }),
    supabase
      .from('participants')
      .select('block_id, people(display_name)')
      .eq('event_id', ev.id)
      .not('checked_in_at', 'is', null),
  ]);

  const pack = themePack(ev.theme_key);
  const game = await sessions.store.activeForEvent(ev.id);
  const ui = game ? GAME_UI[game.moduleKey] : null;
  const theme = pack.copy;

  const here = ((arrived ?? []) as unknown as { block_id: string | null; people: { display_name: string } | null }[])
    .filter((p) => p.people?.display_name)
    .map((p) => ({ blockId: p.block_id, name: p.people!.display_name }));

  const groups = ((blocks ?? []) as { id: string; name: string; colour: string; in_play: boolean }[])
    .map((b) => ({
      ...b,
      names: here
        .filter((p) => p.blockId === b.id)
        .map((p) => p.name)
        .sort((a, z) => a.localeCompare(z)),
    }))
    .filter((b) => b.names.length > 0);

  const teamName = (id: string | null) => ((blocks ?? []) as { id: string; name: string }[]).find((b) => b.id === id)?.name ?? '';
  const reel = (await listClips(ev.id)).filter((c) => c.url).map((c) => ({ id: c.id, url: c.url as string, team: teamName(c.blockId), caption: c.caption }));
  const poll = await showingPoll(ev.id);
  if (poll) {
    const name = (id: string | null) => ((blocks ?? []) as { id: string; name: string }[]).find((b) => b.id === id)?.name ?? '';
    const qr = poll.status === 'open' ? await QRCode.toString(`${siteUrl()}/vote/${poll.id}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : '';
    return (
      <>
        <ThemeStyle pack={pack} />
        <AutoRefresh seconds={4} />
        <div className="tv tv--game">
          <div className="tv__head">
            <h1>{ev.theme_title || ev.name}</h1>
            <p className="mono">COSTUME VOTE</p>
          </div>
          {poll.status === 'open' ? (
            <div className="tv-poll">
              <div className="tv-poll__qr" dangerouslySetInnerHTML={{ __html: qr }} />
              <div>
                <h2 className="g-tv__headline">Best and worst costume</h2>
                <p className="tv__wait">Scan the code and pick your three best and three worst. One vote per phone.</p>
              </div>
            </div>
          ) : (
            <div className="tv-poll tv-poll--results">
              {(['best', 'worst'] as const).map((k) => (
                <div key={k}>
                  <h2 className="g-tv__headline">{k === 'best' ? 'Best costume' : 'Worst costume'}</h2>
                  {(poll.results?.[k] ?? []).slice(0, 3).map((c, i) => (
                    <p key={c.id} className={i === 0 ? 'tv-poll__winner' : 'tv-poll__runner'}>
                      {c.name} <span className="mono">{c.votes}</span>
                      {name(c.groupId) ? <span className="small"> {name(c.groupId)}</span> : null}
                    </p>
                  ))}
                  {!(poll.results?.[k] ?? []).length ? <p className="tv__wait">No votes.</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  if (game && ui) {
    return (
      <>
        <ThemeStyle pack={pack} />
        <AutoRefresh seconds={15} />
        <div className="tv tv--game">
          <div className="tv__head">
            <h1>{ev.theme_title || ev.name}</h1>
            <p className="mono">{here.length} HERE</p>
          </div>
          <GameScreen sessionId={game.id} headers={{ 'x-screen-token': params.token }} words={wordsFor(pack)} everyMs={1000}>
            <ui.Display />
          </GameScreen>
          {reel.length ? <ClipReel clips={reel} /> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <ThemeStyle pack={pack} />
      <AutoRefresh seconds={5} />
      <div className="tv">
        <div className="tv__head">
          <h1>{ev.theme_title || ev.name}</h1>
          <p className="mono">{here.length} HERE</p>
        </div>

        {groups.length > 0 ? (
          <div className="tv__groups">
            {groups.map((g) => (
              <div className="tv__group" key={g.id} style={{ borderTopColor: g.colour }}>
                <h2>{g.name}</h2>
                {g.names.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="tv__wait">
            {theme.groupNounPlural} are drawn once everyone has arrived.
          </p>
        )}
        {reel.length ? <ClipReel clips={reel} /> : null}
      </div>
    </>
  );
}
