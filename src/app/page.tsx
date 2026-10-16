import Link from 'next/link';

export default function Home() {
  return (
    <div className="shell">
      <div className="topbar">
        <span>DEPT. OF CORRECTIONS</span>
        <span>LEPARTY</span>
      </div>
      <div className="body">
        <h1 className="huge">LeParty</h1>
        <hr className="rule" />
        <p className="lede">
          Signup and intake for themed parties. Guests arrive here by invite link; there is
          nothing to see without one.
        </p>
        <Link className="btn" href="/host">
          Warden&rsquo;s console
        </Link>
      </div>
    </div>
  );
}
