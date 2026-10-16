import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db, MUGSHOT_BUCKET, siteUrl } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { formatHeldOn, type EventRow } from '@/lib/types';
import GuestForm from './GuestForm';
import GuestPhoto from './GuestPhoto';
import CopyLink from '../../CopyLink';
import { removeGuest, rotateInviteToken, deleteGuestPhoto } from '../../../actions';

export const dynamic = 'force-dynamic';

type Participant = {
  id: string;
  person_id: string;
  invite_token: string;
  rsvp: string;
  potluck_item: string | null;
  potluck_category: string | null;
  dietary_notes: string | null;
  photo_path: string | null;
  inmate_number: number | null;
  checked_in_at: string | null;
  signup_completed_at: string | null;
  block_id: string | null;
  people: { display_name: string; capacity_band: number | null } | null;
};

export default async function GuestPage({
  params,
}: {
  params: { eventId: string; participantId: string };
}) {
  if (!isHost()) redirect('/host');

  const supabase = db();

  const [{ data: participant }, { data: event }] = await Promise.all([
    supabase
      .from('participants')
      .select(
        'id, person_id, invite_token, rsvp, potluck_item, potluck_category, dietary_notes, photo_path, inmate_number, checked_in_at, signup_completed_at, block_id, people(display_name, capacity_band)'
      )
      .eq('id', params.participantId)
      .eq('event_id', params.eventId)
      .maybeSingle(),
    supabase.from('events').select('*').eq('id', params.eventId).maybeSingle(),
  ]);

  if (!participant || !event) notFound();
  const p = participant as unknown as Participant;
  const ev = event as EventRow;

  let photoUrl: string | null = null;
  if (p.photo_path) {
    const { data } = await supabase.storage
      .from(MUGSHOT_BUCKET)
      .createSignedUrl(p.photo_path, 60 * 30);
    photoUrl = data?.signedUrl ?? null;
  }

  let blockName: string | null = null;
  if (p.block_id) {
    const { data: block } = await supabase
      .from('blocks')
      .select('name')
      .eq('id', p.block_id)
      .maybeSingle();
    blockName = block?.name ?? null;
  }

  // How many parties this person has been to, which is the signal that
  // tells two same-named people apart.
  const { count: parties } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', p.person_id);

  const name = p.people?.display_name ?? 'Unknown';
  const surname = name.trim().split(/\s+/).slice(-1)[0] || '';
  const plate = `${surname.toUpperCase()}, ${name.trim().charAt(0).toUpperCase()}. · ${
    p.inmate_number ?? '----'
  }`;

  const remove = removeGuest.bind(null, params.eventId, params.participantId);
  const rotate = rotateInviteToken.bind(null, params.eventId, params.participantId);
  const dropPhoto = deleteGuestPhoto.bind(null, params.eventId, params.participantId);

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>{(ev.theme_title || ev.name).toUpperCase()}</span>
        <Link href={`/host/${params.eventId}`}>GUEST LIST</Link>
      </div>

      <div className="body">
        <p className="eyebrow">Inmate {p.inmate_number ?? '----'}</p>
        <h1>{name}</h1>
        <p className="lede">
          {[
            formatHeldOn(ev.held_on, ev.starts_at_label),
            blockName ? `in ${blockName}` : 'no block yet',
            p.checked_in_at ? 'checked in' : 'not arrived',
            p.signup_completed_at ? 'signup done' : 'signup unfinished',
            `${parties ?? 1} ${parties === 1 ? 'party' : 'parties'} on file`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="grid-2" style={{ gap: '0 32px' }}>
          <div>
            <GuestForm
              eventId={params.eventId}
              participantId={params.participantId}
              name={name}
              band={p.people?.capacity_band ?? null}
              rsvp={p.rsvp}
              item={p.potluck_item ?? ''}
              category={p.potluck_category ?? ''}
              dietary={p.dietary_notes ?? ''}
            />
          </div>

          <div>
            <h2>Mugshot</h2>
            <GuestPhoto
              eventId={params.eventId}
              participantId={params.participantId}
              plate={plate}
              existingUrl={photoUrl}
              compact
            />
            {p.photo_path ? (
              <form action={dropPhoto} style={{ marginTop: 10 }}>
                <button className="btn btn--quiet btn--inline" type="submit">
                  DELETE MUGSHOT
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <hr className="rule" />

        <h2>Invite link</h2>
        <p className="mono" style={{ wordBreak: 'break-all', marginBottom: 10 }}>
          {siteUrl()}/i/{p.invite_token}
        </p>
        <div className="btn-row">
          <CopyLink url={`${siteUrl()}/i/${p.invite_token}`} label="COPY LINK" />
        </div>
        <p className="small" style={{ margin: '14px 0 10px' }}>
          Rotating issues a new link and kills the old one &mdash; for when a link went to the
          wrong person. They keep everything they&rsquo;ve already filled in.
        </p>
        <form action={rotate}>
          <button className="btn btn--quiet btn--inline" type="submit">
            ROTATE LINK
          </button>
        </form>

        <hr className="rule" />

        <h2>Remove</h2>
        <p className="small" style={{ marginBottom: 14 }}>
          Takes them off this party only; their person record and past parties stay. Their invite
          link stops working.
        </p>
        <form action={remove}>
          <button className="btn btn--quiet btn--inline" type="submit">
            REMOVE FROM THIS PARTY
          </button>
        </form>
      </div>
    </div>
  );
}
