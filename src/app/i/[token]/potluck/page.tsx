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
        <span>STEP 3 OF 3</span>
      </div>

      <div className="body">
        <h1>Mess hall duty</h1>
        <p className="lede">Everyone brings one thing. Here&rsquo;s what&rsquo;s covered so far.</p>

        <div className="box box--quiet">
          <p className="eyebrow eyebrow--quiet">Menu right now</p>
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
          <details className="disclosure" style={{ marginTop: 10, marginBottom: 20 }}>
            <summary className="btn btn--quiet btn--inline">
              See what others are bringing <span className="arrow">&#9662;</span>
            </summary>

            <div className="box box--quiet" style={{ marginTop: 10 }}>
              <div className="roster roster--head" aria-hidden="true">
                <span>Name</span>
                <span>Category</span>
                <span>Bringing</span>
              </div>
              {items.map((it, i) => (
                <div className="roster" key={i}>
                  <span className="roster__name">{it.name}</span>
                  <span className="roster__category">{it.categoryLabel || '—'}</span>
                  <span className="roster__item">{it.item}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <PotluckForm
          token={params.token}
          tally={tally}
          item={ctx.participant.potluck_item || ''}
          category={ctx.participant.potluck_category || ''}
          dietary={ctx.participant.dietary_notes || ''}
        />

        <div className="btn-row" style={{ marginTop: 14 }}>
          <Link className="btn btn--quiet btn--inline" href={`/i/${params.token}/mugshot`}>
            BACK
          </Link>
        </div>
      </div>
    </div>
  );
}
