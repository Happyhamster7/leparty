import Link from 'next/link';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { formatHeldOn } from '@/lib/types';
import LoginForm from './LoginForm';
import { logout } from './actions';

export const dynamic = 'force-dynamic';

export default async function HostHome() {
  if (!isHost()) {
    return (
      <div className="shell">
        <div className="topbar">
          <span>WARDEN&rsquo;S CONSOLE</span>
          <span>LOCKED</span>
        </div>
        <div className="body">
          <h1>Staff only</h1>
          <p className="lede">The passcode is whatever you set as HOST_PASSCODE.</p>
          <LoginForm />
        </div>
      </div>
    );
  }

  const { data: events } = await db()
    .from('events')
    .select('id, name, theme_title, held_on, starts_at_label, status')
    .order('created_at', { ascending: false });

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>WARDEN&rsquo;S CONSOLE</span>
        <form action={logout}>
          <button
            type="submit"
            style={{
              background: 'none',
              border: 0,
              color: 'var(--paper)',
              font: 'inherit',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            SIGN OUT
          </button>
        </form>
      </div>

      <div className="body">
        <h1>Parties</h1>
        <p className="lede">Each one keeps its own guests, blocks and potluck. People carry over.</p>

        <Link className="btn btn--inline" href="/host/new" style={{ marginBottom: 28 }}>
          New party
        </Link>

        {events && events.length > 0 ? (
          <div className="scroller">
            <table className="list">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>When</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.name}</strong>
                      {e.theme_title ? (
                        <div className="small">{e.theme_title}</div>
                      ) : null}
                    </td>
                    <td className="tight">{formatHeldOn(e.held_on, e.starts_at_label) || '—'}</td>
                    <td className="tight">
                      <span className="pill">{e.status}</span>
                    </td>
                    <td className="tight">
                      <Link href={`/host/${e.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="box box--quiet">
            <p style={{ margin: 0 }}>
              No parties yet. Create one, add your guest list, and send everyone their link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
