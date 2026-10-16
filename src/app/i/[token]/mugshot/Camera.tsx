'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import MugshotCapture from '@/components/MugshotCapture';
import { savePhoto, finishSignup } from '../actions';

export default function Camera({
  token,
  plate,
  existingUrl,
}: {
  token: string;
  plate: string;
  existingUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const upload = useCallback((fd: FormData) => savePhoto(token, fd), [token]);

  const skip = useCallback(async () => {
    setBusy(true);
    await finishSignup(token);
  }, [token]);

  return (
    <>
      <MugshotCapture
        plate={plate}
        existingUrl={existingUrl}
        upload={upload}
        onDone={() => router.push(`/i/${token}/booked`)}
      />

      <div className="box box--quiet">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-2)' }}>
          Skipping is fine &mdash; you&rsquo;ll get initials and your block colour instead, and
          you can have one taken at the door.
        </p>
      </div>

      <button className="btn btn--ghost" type="button" onClick={skip} disabled={busy}>
        {busy ? 'Filing…' : existingUrl ? 'Keep this photo & book me in' : 'Skip & book me in'}
      </button>
    </>
  );
}
