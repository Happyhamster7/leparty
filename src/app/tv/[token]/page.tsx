import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { eventForScreen } from '@/lib/screens';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import AutoRefresh from '@/components/AutoRefresh';

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
      </div>
    </>
  );
}
