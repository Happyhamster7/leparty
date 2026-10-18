import Link from 'next/link';
import { loadProfile } from '@/lib/profile';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const person = await loadProfile();

  return (
    <div className="shell">
      <div className="topbar">
        <span>DEPT. OF CORRECTIONS</span>
        <span>INTAKE</span>
      </div>

      <div className="body">
        <h1>{person ? 'Your profile' : 'Who are you'}</h1>
        <p className="lede">
          {person
            ? 'Fix your name or drinking band, then head to the parties list.'
            : 'Asked once. Every party after this, we already have it.'}
        </p>

        <ProfileForm
          name={person?.display_name ?? ''}
          band={person?.capacity_band ?? null}
          editing={Boolean(person)}
        />

        {person ? (
          <div className="btn-row" style={{ marginTop: 14 }}>
            <Link className="btn btn--quiet btn--inline" href="/parties">
              SEE PARTIES
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
