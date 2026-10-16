import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isHost } from '@/lib/host';
import EventForm from '../EventForm';

export const dynamic = 'force-dynamic';

export default function NewEventPage() {
  if (!isHost()) redirect('/host');

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>WARDEN&rsquo;S CONSOLE</span>
        <Link href="/host">BACK</Link>
      </div>

      <div className="body">
        <h1>New party</h1>
        <p className="lede">
          Everything here is per-party, so the next one is a new row rather than a code change.
          All of it can be changed later.
        </p>
        <EventForm />
      </div>
    </div>
  );
}
