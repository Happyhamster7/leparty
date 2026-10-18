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

  const keep = useCallback(async () => {
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

      {existingUrl ? (
        <button className="btn btn--ghost" type="button" onClick={keep} disabled={busy}>
          {busy ? 'Filing…' : 'Keep this photo & book me in'}
        </button>
      ) : (
        <div className="box box--quiet">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-2)' }}>
            A mugshot is required &mdash; use the camera or choose a photo above to finish
            signing up.
          </p>
        </div>
      )}
    </>
  );
}
