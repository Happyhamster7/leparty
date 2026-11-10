import { sitePack } from '@/themes';

export default function NotFound() {
  const theme = sitePack().copy;
  return (
    <div className="shell">
      <div className="topbar">
        <span>{theme.deptLabel.toUpperCase()}</span>
        <span>NOT FOUND</span>
      </div>
      <div className="body">
        <h1>Nothing here</h1>
        <p className="lede">
          This link doesn&rsquo;t match anything. Check it against the one you were sent, or ask{' '}
          {theme.hostRef} for a fresh one.
        </p>
      </div>
    </div>
  );
}
