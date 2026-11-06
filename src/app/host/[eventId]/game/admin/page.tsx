import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import AdjustForm from './AdjustForm';
import AssignForm from './AssignForm';
import { reissueCode } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Host-only admin tools for a running night: manual balance
 * adjustments, assigning a drink straight into the queue, and
 * reissuing a leaked team QR code (docs/halloween-game-design.md
 * section 5 and section 2's "Team phones").
 */
export default async function AdminPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();
  const { data: event } = await supabase.from('events').select('id').eq('id', params.eventId).maybeSingle();
  if (!event) notFound();

  const [{ data: blockRows }, { data: drinkTypeRows }] = await Promise.all([
    supabase
      .from('blocks')
      .select('id, name, join_code, bonus_points_per_drink')
      .eq('event_id', params.eventId)
      .eq('in_play', true)
      .order('name', { ascending: true }),
    supabase.from('drink_types').select('id, name').eq('event_id', params.eventId),
  ]);

  const blocks = (blockRows ?? []) as { id: string; name: string; join_code: string; bonus_points_per_drink: number }[];
  const drinkTypes = (drinkTypeRows ?? []) as { id: string; name: string }[];

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>ADMIN</span>
        <Link href={`/host/${params.eventId}/game`}>BACK TO GAME CONTROL</Link>
      </div>

      <div className="body">
        <h1>Admin tools</h1>

        <h2>Adjust a balance</h2>
        <AdjustForm eventId={params.eventId} blocks={blocks} />

        <h2>Assign a drink</h2>
        <AssignForm eventId={params.eventId} blocks={blocks} drinkTypes={drinkTypes} />

        <h2>Team codes</h2>
        <div className="box box--quiet">
          {blocks.map((b) => (
            <div className="meter-row" key={b.id}>
              <span className="name">
                {b.name} — <span className="mono">{b.join_code}</span>
                {b.bonus_points_per_drink > 0 ? (
                  <span className="count small"> · +{b.bonus_points_per_drink}/drink</span>
                ) : null}
              </span>
              <form action={reissueCode.bind(null, params.eventId, b.id)}>
                <button className="btn btn--quiet btn--inline" type="submit">
                  New code
                </button>
              </form>
            </div>
          ))}
        </div>
        <p className="small">
          Reissuing a code signs out that team&rsquo;s phone and prints a new QR/code to hand out —
          the old one stops working immediately.
        </p>
      </div>
    </div>
  );
}
