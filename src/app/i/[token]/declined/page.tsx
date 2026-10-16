import { notFound } from 'next/navigation';
import { loadInvite } from '@/lib/invite';
import { setRsvp } from '../actions';

export const dynamic = 'force-dynamic';

export default async function DeclinedPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  const sayYes = setRsvp.bind(null, params.token, 'yes');

  return (
    <div className="shell">
      <div className="topbar">
        <span>INTAKE</span>
        <span>RELEASED WITHOUT CHARGE</span>
      </div>

      <div className="body">
        <div className="stamp stamp--grey">Excused</div>
        <h1>Noted</h1>
        <p className="lede">
          You&rsquo;re off the list, so nobody will be holding a drink for you. We&rsquo;ll
          catch you at the next one.
        </p>
        <form action={sayYes}>
          <button className="btn btn--ghost" type="submit">
            Changed my mind
          </button>
        </form>
        <p className="small" style={{ marginTop: 16 }}>
          This link keeps working until the night, so you can switch back any time before the
          blocks are drawn.
        </p>
      </div>
    </div>
  );
}
