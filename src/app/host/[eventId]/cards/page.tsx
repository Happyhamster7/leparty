import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { db, siteUrl } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import type { EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

type BlockRow = {
  id: string;
  name: string;
  colour: string;
  join_token: string;
  join_code: string;
  in_play: boolean;
  charge: string | null;
};

type MemberRow = {
  block_id: string | null;
  people: { display_name: string } | null;
};

export default async function CardsPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { all?: string; roster?: string };
}) {
  if (!isHost()) redirect('/host');

  const supabase = db();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.eventId)
    .maybeSingle();

  if (!event) notFound();
  const ev = event as EventRow;

  const [{ data: blocks }, { data: members }] = await Promise.all([
    supabase
      .from('blocks')
      .select('id, name, colour, join_token, join_code, in_play, charge')
      .eq('event_id', params.eventId)
      .order('name', { ascending: true }),
    supabase
      .from('participants')
      .select('block_id, people(display_name)')
      .eq('event_id', params.eventId)
      .not('block_id', 'is', null),
  ]);

  const all = (blocks ?? []) as BlockRow[];
  const showAll = searchParams.all === '1';
  const showRoster = searchParams.roster === '1';
  const anyInPlay = all.some((b) => b.in_play);
  const shown = showAll || !anyInPlay ? all : all.filter((b) => b.in_play);

  const roster = new Map<string, string[]>();
  for (const m of (members ?? []) as unknown as MemberRow[]) {
    if (!m.block_id) continue;
    const list = roster.get(m.block_id) ?? [];
    list.push(m.people?.display_name ?? 'Unknown');
    roster.set(m.block_id, list);
  }
  for (const list of roster.values()) list.sort((a, b) => a.localeCompare(b));

  const base = siteUrl();

  // Real scannable codes, rendered server-side as inline SVG so the
  // print view needs no network and no client JS.
  const qr = new Map<string, string>();
  for (const b of shown) {
    qr.set(
      b.id,
      await QRCode.toString(`${base}/b/${b.join_token}`, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
      })
    );
  }

  return (
    <div className="shell shell--wide">
      <div className="topbar no-print">
        <span>{(ev.theme_title || ev.name).toUpperCase()} &middot; BLOCK CARDS</span>
        <Link href={`/host/${params.eventId}`}>CONSOLE</Link>
      </div>

      <div className="body">
        <div className="no-print">
          <h1>Block cards</h1>
          <p className="lede">
            One per block, to sit on the table. Print two of each &mdash; cards get drinks spilled
            on them, and a spare means a lost card is never a problem.
          </p>

          <div className="btn-row" style={{ marginBottom: 14 }}>
            <Link
              className="btn btn--quiet btn--inline"
              href={`/host/${params.eventId}/cards?all=${showAll ? '0' : '1'}&roster=${
                showRoster ? '1' : '0'
              }`}
            >
              {showAll ? 'ONLY BLOCKS IN PLAY' : 'SHOW EVERY BLOCK'}
            </Link>
            <Link
              className="btn btn--quiet btn--inline"
              href={`/host/${params.eventId}/cards?all=${showAll ? '1' : '0'}&roster=${
                showRoster ? '0' : '1'
              }`}
            >
              {showRoster ? 'HIDE ROSTERS (REUSABLE)' : 'SHOW ROSTERS'}
            </Link>
          </div>

          <div className="notice">
            {showRoster
              ? 'With rosters printed, these have to be printed on the night, after the draw. Hide them and the cards can be printed in advance and reused at the next party.'
              : 'No rosters, so these can be printed before anyone replies and reused between parties. Blocks keep their codes.'}
          </div>

          <hr className="rule" />
        </div>

        <div className="print-sheet">
          {shown.map((b) => {
            const names = roster.get(b.id) ?? [];
            return (
              <div className="card" key={b.id}>
                <div className="card__head" style={{ background: b.colour }}>
                  <span className="nm">{b.name}</span>
                  <span className="sub">{(ev.theme_title || ev.name).toUpperCase()}</span>
                </div>

                <div className="card__body">
                  <p style={{ fontSize: 14, marginBottom: 16 }}>
                    Scan to open your block&rsquo;s console. Anyone in {b.name} can scan it &mdash;
                    pass the phone around, or have two of you on it.
                  </p>

                  <div
                    className="card__qr"
                    dangerouslySetInnerHTML={{ __html: qr.get(b.id) ?? '' }}
                  />

                  <div className="card__code">
                    <p className="where">Camera won&rsquo;t cooperate? Type this at</p>
                    <p className="url">{base.replace(/^https?:\/\//, '')}/join</p>
                    <p className="code">{b.join_code}</p>
                  </div>

                  {showRoster && names.length > 0 ? (
                    <>
                      <p className="eyebrow">Your block</p>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: '5px 16px',
                          marginBottom: 16,
                        }}
                      >
                        {names.map((n) => (
                          <span key={n} style={{ fontSize: 14 }}>
                            {n}
                          </span>
                        ))}
                        <span className="mono" style={{ fontSize: 12 }}>
                          + latecomers
                        </span>
                      </div>
                    </>
                  ) : null}

                  <div style={{ flex: 1 }} />

                  {b.charge ? (
                    <div className="box box--dark" style={{ marginBottom: 12 }}>
                      <p className="eyebrow">The charge</p>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--display)',
                          fontWeight: 500,
                          fontSize: 19,
                          lineHeight: 1.2,
                          textTransform: 'uppercase',
                        }}
                      >
                        {b.charge}
                      </p>
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span className="mono" style={{ fontSize: 10 }}>
                      SENTENCE: {ev.config?.starting_sentence ?? 25} YRS
                    </span>
                    <span className="mono" style={{ fontSize: 10 }}>
                      COMMISSARY: {ev.config?.starting_commissary ?? 200}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <div className="box box--quiet">
            <p style={{ margin: 0 }}>No blocks on this party yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
