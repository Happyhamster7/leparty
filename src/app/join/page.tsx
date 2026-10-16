import JoinForm from './JoinForm';

export const dynamic = 'force-dynamic';

export default function JoinPage() {
  return (
    <div className="shell">
      <div className="topbar">
        <span>DEPT. OF CORRECTIONS</span>
        <span>BLOCK ENTRY</span>
      </div>

      <div className="body">
        <h1>Enter your code</h1>
        <p className="lede">
          Six characters, printed on your block&rsquo;s card under the QR square.
        </p>
        <JoinForm />
        <p className="small" style={{ marginTop: 18 }}>
          Anyone in the block can use it. If the card has gone missing, the Warden can show you
          the code again or issue a new one.
        </p>
      </div>
    </div>
  );
}
