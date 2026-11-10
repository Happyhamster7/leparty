import { sitePack } from '@/themes';
import JoinForm from './JoinForm';

export const dynamic = 'force-dynamic';

export default function JoinPage() {
  // A typed code isn't tied to a party until it's looked up, so this
  // page wears the site theme, not a party's.
  const theme = sitePack().copy;
  const group = theme.groupNoun.toLowerCase();
  return (
    <div className="shell">
      <div className="topbar">
        <span>{theme.deptLabel.toUpperCase()}</span>
        <span>{theme.groupNoun.toUpperCase()} ENTRY</span>
      </div>

      <div className="body">
        <h1>Enter your code</h1>
        <p className="lede">
          Six characters, printed on your {group}&rsquo;s card under the QR square.
        </p>
        <JoinForm group={group} />
        <p className="small" style={{ marginTop: 18 }}>
          Anyone in the {group} can use it. If the card has gone missing, {theme.hostRef} can show
          you the code again or issue a new one.
        </p>
      </div>
    </div>
  );
}
