'use client';

import { useEffect, useRef, useState } from 'react';

export type ReelClip = { id: string; url: string; team: string; caption: string | null };

/**
 * Plays a party's newest clips on a loop, muted, one at a time.
 *
 * The page re-renders every few seconds with fresh signed links. A new
 * link for the same clip would restart its video, so the first link
 * seen for each clip is the one that's kept.
 */
export default function ClipReel({ clips, seconds = 12 }: { clips: ReelClip[]; seconds?: number }) {
  const first = useRef(new Map<string, string>());
  for (const c of clips) if (!first.current.has(c.id)) first.current.set(c.id, c.url);
  const [i, setI] = useState(0);
  const newest = clips[0]?.id;

  // A new clip jumps the queue.
  useEffect(() => setI(0), [newest]);
  useEffect(() => {
    if (clips.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % clips.length), seconds * 1000);
    return () => clearInterval(t);
  }, [clips.length, seconds]);

  const clip = clips[i % Math.max(1, clips.length)];
  if (!clip) return null;
  return (
    <div className="reel">
      <video key={clip.id} src={first.current.get(clip.id)} autoPlay muted loop playsInline />
      <p className="reel__by">
        <strong>{clip.team}</strong>
        {clip.caption ? ` — ${clip.caption}` : ''}
      </p>
    </div>
  );
}
