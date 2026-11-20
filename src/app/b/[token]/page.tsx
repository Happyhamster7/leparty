import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import ClaimOnLoad from './ClaimOnLoad';

export const dynamic = 'force-dynamic';

/**
 * The team phone. Confirms the scan worked and claims this device for
 * the group. A game module adds its own panel here once one is running;
 * with no game it's the group's roster and nothing else.
 */
export default async function BlockPage({ params }: { params: { token: string } }) {
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('id, name, colour, join_code, charge, event_id')
    .eq('join_token', params.token)
    .maybeSingle();

  if (!block) notFound();

  const [{ data: event }, { data: members }] = await Promise.all([
    supabase.from('events').select('name, theme_key, theme_title').eq('id', block.event_id).maybeSingle(),
    supabase.from('participants').select('id, people(display_name)').eq('block_id', block.id),
  ]);

  const pack = themePack(event?.theme_key);
  const theme = pack.copy;

  const names = ((members ?? []) as unknown as { people: { display_name: string } | null }[])
    .map((m) => m.people?.display_name ?? 'Unknown')
    .sort((a, b) => a.localeCompare(b));

  return (
    <>
      <ThemeStyle pack={pack} />
      <ClaimOnLoad token={params.token} />
      <div className="shell">
        <div className="topbar" style={{ background: block.colour }}>
          <span>{(event?.theme_title || event?.name || 'LeParty').toUpperCase()}</span>
          <span>{block.join_code}</span>
        </div>

        <div className="body">
          <h1 className="huge">{block.name}</h1>
          <hr className="rule" />

          {block.charge ? (
            <>
              <p className="eyebrow">{theme.groupFlavourLabel}</p>
              <p style={{ fontFamily: 'var(--display)', fontSize: 22, textTransform: 'uppercase' }}>
                {block.charge}
              </p>
            </>
          ) : null}

          {names.length > 0 ? (
            <>
              <p className="eyebrow">Your {theme.groupNoun.toLowerCase()}</p>
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
              Nobody is in this {theme.groupNoun.toLowerCase()} yet. They&rsquo;re drawn once check-in
              closes.
            </div>
          )}

          <div className="box box--dark">
            <p className="eyebrow">Hold tight</p>
            <p style={{ margin: 0, fontSize: 14 }}>
              You&rsquo;re in. Anything {theme.hostRef} starts tonight shows up on this page.
            </p>
          </div>

          <p className="small">
            Keep this page open. Anyone else in {block.name} can scan the same card, and the latest
            phone to scan it takes over.
          </p>
        </div>
      </div>
    </>
  );
}
