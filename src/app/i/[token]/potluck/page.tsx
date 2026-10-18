import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadInvite } from '@/lib/invite';
import { getTheme } from '@/lib/theme';
import { potluckTally, potluckItems } from '@/lib/potluck';
import PotluckForm from './PotluckForm';

export const dynamic = 'force-dynamic';

export default async function PotluckPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();
  const theme = getTheme(ctx.event.theme_key);

  const [tally, items] = await Promise.all([
    potluckTally(ctx.event.id),
    potluckItems(ctx.event.id),
  ]);
  const maxBar = Math.max(1, ...tally.map((t) => t.count));

  return (
    <div className="shell">
      <div className="topbar">
        <span>{theme.intakeLabel.toUpperCase()}</span>
        <span>STEP 2 OF 3</span>
      </div>

      <div className="body">
        <h1>Mess hall duty</h1>
        <p className="lede">Everyone brings one thing. Here&rsquo;s what&rsquo;s covered so far.</p>

        <div className="box box--quiet">
          <p className="eyebrow eyebrow--quiet">Coming so far</p>
          {tally.map((t) => (
            <div className="meter-row" key={t.key}>
              <span className="name">{t.label}</span>
              <span className="count">{t.count}</span>
              <span className="meter">
                <span style={{ width: `${Math.round((t.count / maxBar) * 56)}px` }} />
              </span>
            </div>
          ))}
        </div>

        {items.length > 0 ? (
          <div className="box box--quiet">
            <p className="eyebrow eyebrow--quiet">What&rsquo;s coming</p>
            {items.map((it, i) => (
              <div className="meter-row" key={i}>
                <span className="name">
                  {it.item}
                  {it.categoryLabel ? (
                    <span className="small"> &middot; {it.categoryLabel}</span>
                  ) : null}
                </span>
                <span className="count">{it.name}</span>
              </div>
            ))}
          </div>
        ) : null}

        <PotluckForm
          token={params.token}
          tally={tally}
          item={ctx.participant.potluck_item || ''}
          category={ctx.participant.potluck_category || ''}
          dietary={ctx.participant.dietary_notes || ''}
        />

        <div className="btn-row" style={{ marginTop: 14 }}>
          <Link className="btn btn--quiet btn--inline" href={`/i/${params.token}/identity`}>
            BACK
          </Link>
        </div>
      </div>
    </div>
  );
}
