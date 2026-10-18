import Link from 'next/link';
import { loadProfile } from '@/lib/profile';
import { getTheme } from '@/lib/theme';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const person = await loadProfile();
  const theme = getTheme(null);

  return (
    <div className="shell">
      <div className="topbar">
        <span>{theme.deptLabel.toUpperCase()}</span>
        <span>{theme.intakeLabel.toUpperCase()}</span>
      </div>

      <div className="body">
        <h1>{person ? 'Your profile' : 'Who are you'}</h1>
        <p className="lede">
          {person
            ? 'Fix your name or drinking band, then head to the parties list.'
            : 'Been to a party here before? Type your name exactly as you did last time and we’ll find your profile instead of making a new one.'}
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
