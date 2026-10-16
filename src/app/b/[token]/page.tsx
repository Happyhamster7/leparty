import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * The block console. Phase 1 confirms the scan worked and shows the
 * block its identity; the game itself (yard time, lights out, roll
 * call, serving) lands here in phase 2.
 */
export default async function BlockPage({ params }: { params: { token: string } }) {
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('id, name, colour, join_code, in_play, charge, event_id')
    .eq('join_token', params.token)
    .maybeSingle();

  if (!block) notFound();

  const [{ data: event }, { data: members }] = await Promise.all([
    supabase
      .from('events')
      .select('name, theme_title, config')
      .eq('id', block.event_id)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('people(display_name)')
      .eq('block_id', block.id),
  ]);

  const names = ((members ?? []) as unknown as { people: { display_name: string } | null }[])
    .map((m) => m.people?.display_name ?? 'Unknown')
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="shell">
      <div className="topbar" style={{ background: block.colour }}>
        <span>{(event?.theme_title || event?.name || 'LEPARTY').toUpperCase()}</span>
        <span>{block.join_code}</span>
      </div>

      <div className="body">
        <h1 className="huge">{block.name}</h1>
        <hr className="rule" />

        {block.charge ? (
          <>
            <p className="eyebrow">The charge</p>
            <p style={{ fontFamily: 'var(--display)', fontSize: 22, textTransform: 'uppercase' }}>
              {block.charge}
            </p>
          </>
        ) : null}

        <div className="stat-row">
          <div className="stat">
            <p className="label">Sentence</p>
            <p className="value">{event?.config?.starting_sentence ?? 25}</p>
          </div>
          <div className="stat">
            <p className="label">Commissary</p>
            <p className="value">{event?.config?.starting_commissary ?? 200}</p>
          </div>
        </div>

        {names.length > 0 ? (
          <>
            <p className="eyebrow">Your block</p>
            <div className="box box--quiet">
              {names.map((n) => (
                <div key={n} style={{ fontSize: 15, padding: '3px 0' }}>
                  {n}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="notice">
            This block has nobody in it yet. The Warden draws the blocks once check-in closes.
          </div>
        )}

        <div className="box box--dark">
          <p className="eyebrow">Hold tight</p>
          <p style={{ margin: 0, fontSize: 14 }}>
            You&rsquo;re in. The games, the commissary and lights out arrive here when the Warden
            starts the first Day.
          </p>
        </div>

        <p className="small">
          Keep this page open &mdash; it remembers you. Anyone else in {block.name} can scan the
          same card.
        </p>
      </div>
    </div>
  );
}
