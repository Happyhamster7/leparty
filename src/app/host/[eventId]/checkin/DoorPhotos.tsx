'use client';

import { useState } from 'react';
import GuestPhoto from '../guest/[participantId]/GuestPhoto';
import { initials } from '@/lib/types';

export type NeedsPhoto = {
  participantId: string;
  name: string;
  plate: string;
};

/**
 * Who's here without a mugshot. Surfacing the list is the point: at a
 * door you want to know who to grab, not to hunt through a grid.
 */
export default function DoorPhotos({
  eventId,
  people,
}: {
  eventId: string;
  people: NeedsPhoto[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (people.length === 0) {
    return (
      <p className="small" style={{ margin: 0 }}>
        Everyone who&rsquo;s arrived has a mugshot.
      </p>
    );
  }

  const active = people.find((p) => p.participantId === open);

  return (
    <>
      <p className="small" style={{ marginTop: 0 }}>
        {people.length} {people.length === 1 ? 'person' : 'people'} here without one. Tap a name
        to take it on this device.
      </p>

      <div className="face-grid" style={{ marginBottom: 18 }}>
        {people.map((p) => (
          <button
            key={p.participantId}
            type="button"
            className={open === p.participantId ? 'face face--in' : 'face'}
            onClick={() => setOpen(open === p.participantId ? null : p.participantId)}
            aria-pressed={open === p.participantId}
          >
            <span className="face__avatar">{initials(p.name)}</span>
            <span className="face__name">{p.name}</span>
            <span className="face__num">
              {open === p.participantId ? 'CLOSE' : 'NO PHOTO'}
            </span>
          </button>
        ))}
      </div>

      {active ? (
        <div className="box">
          <p className="eyebrow">{active.name}</p>
          <GuestPhoto
            eventId={eventId}
            participantId={active.participantId}
            plate={active.plate}
            existingUrl={null}
            compact
          />
        </div>
      ) : null}
    </>
  );
}
