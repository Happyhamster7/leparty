import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { getTheme } from '@/lib/theme';
import type { EventRow } from '@/lib/types';
import CheckinGrid, { type GridPerson } from './CheckinGrid';
import DoorRegister from './DoorRegister';
import DoorPhotos, { type NeedsPhoto } from './DoorPhotos';
import { closeCheckIn } from '../nightActions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  rsvp: 'pending' | 'yes' | 'no';
  inmate_number: number | null;
  photo_path: string | null;
  checked_in_at: string | null;
  people: { display_name: string } | null;
};

export default async function CheckinPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.eventId)
    .maybeSingle();

  if (!event) notFound();
  const ev = event as EventRow;
  const theme = getTheme(ev.theme_key);

  const { data: rows } = await supabase
    .from('participants')
    .select('id, rsvp, inmate_number, photo_path, checked_in_at, people(display_name)')
    .eq('event_id', params.eventId)
    .order('created_at', { ascending: true });

  const list = (rows ?? []) as unknown as Row[];

  // One signed URL batch rather than a call per face.
  const paths = list.map((r) => r.photo_path).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage
      .from(MUGSHOT_BUCKET)
      .createSignedUrls(paths, 60 * 60 * 6);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  const people: GridPerson[] = list
    .filter((r) => r.rsvp !== 'no' || r.checked_in_at)
    .map((r) => ({
      participantId: r.id,
      name: r.people?.display_name ?? 'Unknown',
      inmateNumber: r.inmate_number,
      photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
      present: Boolean(r.checked_in_at),
      rsvp: r.rsvp,
    }));

  const needsPhoto: NeedsPhoto[] = list
    .filter((r) => r.checked_in_at && !r.photo_path)
    .map((r) => {
      const name = r.people?.display_name ?? 'Unknown';
      const surname = name.trim().split(/\s+/).slice(-1)[0] || '';
      return {
        participantId: r.id,
        name,
        plate: `${surname.toUpperCase()}, ${name.trim().charAt(0).toUpperCase()}. · ${
          r.inmate_number ?? '----'
        }`,
      };
    });

  const close = closeCheckIn.bind(null, params.eventId);
  const drawn = list.some((r) => r.rsvp === 'yes' && r.checked_in_at);

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>{(ev.theme_title || ev.name).toUpperCase()} &middot; {theme.checkinLabel.toUpperCase()}</span>
        <Link href={`/host/${params.eventId}`}>CONSOLE</Link>
      </div>

      <div className="body">
        <CheckinGrid eventId={params.eventId} people={people} />

        <div style={{ marginTop: 24 }}>
          <DoorRegister eventId={params.eventId} />
        </div>

        <hr className="rule" />

        <h2>Mugshots at the door</h2>
        <DoorPhotos eventId={params.eventId} people={needsPhoto} />

        <hr className="rule" />

        <div
          style={{
            display: 'flex',
            gap: 20,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <p className="small" style={{ flex: '1 1 260px', margin: 0 }}>
            Closing check-in draws the blocks from whoever is actually here. Latecomers after
            that drop into the lightest block rather than triggering a redraw.
          </p>
          <form action={close}>
            <button className="btn btn--inline" type="submit" disabled={!drawn}>
              Close check-in &amp; draw blocks
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
