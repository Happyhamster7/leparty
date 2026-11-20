import Link from 'next/link';
import { sitePack } from '@/themes';

export default function Home() {
  const theme = sitePack().copy;
  return (
    <div className="shell">
      <div className="topbar">
        <span>{theme.deptLabel.toUpperCase()}</span>
        <span>WELCOME</span>
      </div>
      <div className="body">
        <h1 className="huge">LeParty</h1>
        <hr className="rule" />
        <p className="lede">
          Signup, check-in, teams and games for themed parties. Guests arrive here by invite
          link; there is nothing to see without one.
        </p>
        <Link className="btn" href="/host">
          {theme.hostConsoleLabel}
        </Link>
      </div>
    </div>
  );
}
