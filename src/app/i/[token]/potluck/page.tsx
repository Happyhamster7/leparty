import { notFound } from 'next/navigation';
import { loadInvite } from '@/lib/invite';
import { potluckTally } from '@/lib/potluck';
import PotluckForm from './PotluckForm';

export const dynamic = 'force-dynamic';

export default async function PotluckPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  const tally = await potluckTally(ctx.event.id);
  const maxBar = Math.max(1, ...tally.map((t) => t.count));

  return (
    <div className="shell">
      <div className="topbar">
        <span>INTAKE</span>
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

        <PotluckForm
          token={params.token}
          tally={tally}
          item={ctx.participant.potluck_item || ''}
          category={ctx.participant.potluck_category || ''}
          dietary={ctx.participant.dietary_notes || ''}
        />
      </div>
    </div>
  );
}
