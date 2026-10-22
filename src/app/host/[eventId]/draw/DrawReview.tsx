'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  proposeDraw,
  buildFromExisting,
  blockTotal,
  spread,
  type Drawee,
  type ProposedBlock,
} from '@/lib/draw';
import { confirmDraw } from '../nightActions';

export default function DrawReview({
  eventId,
  people,
  blocks,
}: {
  eventId: string;
  people: Drawee[];
  blocks: { id: string; name: string; colour: string }[];
}) {
  // If everyone already has a block (the draw already happened), show
  // that real state instead of a fresh proposal — otherwise opening
  // this page to check on one latecomer would discard everyone else's
  // settled assignment.
  const [proposed, setProposed] = useState<ProposedBlock[]>(() => {
    const alreadyDrawn = people.length > 0 && people.every((p) => p.blockId);
    return alreadyDrawn ? buildFromExisting(people, blocks) : proposeDraw(people, blocks);
  });
  const [pending, startTransition] = useTransition();
  const [touched, setTouched] = useState(false);

  const totals = useMemo(() => proposed.map(blockTotal), [proposed]);
  const used = proposed.filter((b) => b.members.length > 0);
  const usedTotals = used.map(blockTotal);
  const heaviest = usedTotals.length ? Math.max(...usedTotals) : 0;
  const lightest = usedTotals.length ? Math.min(...usedTotals) : 0;
  const gap = spread(proposed);
  const maxTotal = Math.max(1, ...totals);

  function move(participantId: string, toBlockId: string) {
    setTouched(true);
    setProposed((current) => {
      let moving: Drawee | null = null;
      const stripped = current.map((b) => {
        const found = b.members.find((m) => m.participantId === participantId);
        if (found) moving = found;
        return { ...b, members: b.members.filter((m) => m.participantId !== participantId) };
      });
      if (!moving) return current;
      return stripped.map((b) =>
        b.blockId === toBlockId
          ? {
              ...b,
              members: [...b.members, moving as Drawee].sort((x, y) =>
                x.name.localeCompare(y.name)
              ),
            }
          : b
      );
    });
  }

  function reshuffle() {
    setTouched(false);
    setProposed(proposeDraw(people, blocks, { randomize: true }));
  }

  function commit() {
    const assignment: Record<string, string[]> = {};
    for (const b of proposed) assignment[b.blockId] = b.members.map((m) => m.participantId);
    startTransition(async () => {
      await confirmDraw(eventId, JSON.stringify(assignment));
    });
  }

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <p className="label">Here</p>
          <p className="value">{people.length}</p>
        </div>
        <div className="stat">
          <p className="label">Blocks used</p>
          <p className="value">{used.length}</p>
        </div>
        <div className="stat">
          <p className="label">Heaviest</p>
          <p className="value">{heaviest}</p>
        </div>
        <div className="stat">
          <p className="label">Lightest</p>
          <p className="value">{lightest}</p>
        </div>
        <div className="stat" style={{ borderColor: gap > 2 ? 'var(--rust)' : undefined }}>
          <p className="label">Spread</p>
          <p className="value" style={{ color: gap > 2 ? 'var(--rust)' : undefined }}>
            {gap}
          </p>
        </div>
      </div>

      <p className="small" style={{ marginBottom: 20 }}>
        {gap <= 1
          ? 'Evenly matched. Move people if you know something the numbers don’t — who came together, who should be kept apart.'
          : gap <= 2
            ? 'Close enough that nobody will notice. Adjust freely.'
            : 'Worth a look: one block is carrying noticeably more than another. Reshuffle, or swap a high number for a low one.'}
      </p>

      <div className="draw-grid">
        {proposed.map((b) => {
          const total = blockTotal(b);
          const isHeavy = b.members.length > 0 && total === heaviest && gap > 1;
          const isLight = b.members.length > 0 && total === lightest && gap > 1;
          return (
            <div
              className="block-card"
              key={b.blockId}
              style={{ borderColor: isHeavy || isLight ? 'var(--ink)' : undefined }}
            >
              <div className="block-card__head" style={{ background: b.colour }}>
                <span className="nm">{b.name}</span>
                <span className="tot">
                  {total} CAP · {b.members.length}
                  {isHeavy ? ' ▲' : isLight ? ' ▼' : ''}
                </span>
              </div>

              <div
                aria-hidden="true"
                style={{ height: 4, background: 'var(--line-soft)' }}
              >
                <div
                  style={{
                    height: 4,
                    width: `${Math.round((total / maxTotal) * 100)}%`,
                    background: isHeavy ? 'var(--rust)' : 'var(--muted)',
                  }}
                />
              </div>

              {b.members.length === 0 ? (
                <div className="block-card__empty">NOT USED TONIGHT</div>
              ) : (
                <div className="block-card__body">
                  {b.members.map((m) => (
                    <div className="member" key={m.participantId}>
                      <span className="cap">{m.capacity}</span>
                      <span className="nm" title={m.name}>
                        {m.name}
                      </span>
                      <select
                        aria-label={`Move ${m.name} to another block`}
                        value={b.blockId}
                        onChange={(e) => move(m.participantId, e.target.value)}
                      >
                        {proposed.map((target) => (
                          <option key={target.blockId} value={target.blockId}>
                            {target.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="btn-row">
        <button className="btn btn--inline" type="button" onClick={commit} disabled={pending}>
          {pending ? 'Committing…' : 'Confirm draw'}
        </button>
        <button
          className="btn btn--quiet btn--inline"
          type="button"
          onClick={reshuffle}
          disabled={pending}
        >
          {touched ? 'DISCARD CHANGES & RESHUFFLE' : 'RESHUFFLE'}
        </button>
      </div>

      <p className="small" style={{ marginTop: 14 }}>
        Nothing is written until you confirm. Confirming assigns blocks, snapshots everyone&rsquo;s
        capacity, marks the used blocks in play and takes you to the printable cards.
      </p>
    </>
  );
}
