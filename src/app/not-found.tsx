export default function NotFound() {
  return (
    <div className="shell">
      <div className="topbar">
        <span>DEPT. OF CORRECTIONS</span>
        <span>NO RECORD</span>
      </div>
      <div className="body">
        <h1>No such file</h1>
        <p className="lede">
          This link doesn&rsquo;t match any record. Check it against the one you were sent, or
          ask the Warden for a fresh one.
        </p>
      </div>
    </div>
  );
}
