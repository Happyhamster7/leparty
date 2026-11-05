'use client';

import { useState } from 'react';
import { beginClipUpload, confirmClipUploaded, markClipFailed } from './actions';

type Status = 'idle' | 'uploading' | 'done' | 'error';

/**
 * Films the team drinking and uploads straight to Supabase Storage
 * with a signed URL — never through a Vercel function, which can't
 * accept bodies this large (docs/halloween-game-design.md, "Direct
 * upload"). Progress and Retry per that same section.
 */
export default function VideoUpload({
  roundId,
  blockId,
  token,
}: {
  roundId: string;
  blockId: string;
  token: string;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  async function start(file: File) {
    setLastFile(file);
    setStatus('uploading');
    setProgress(0);
    setError(null);

    const result = await beginClipUpload(roundId, blockId, token, {}, new FormData());
    if (result.error || !result.uploadUrl || !result.clipId) {
      setError(result.error ?? 'Could not start the upload.');
      setStatus('error');
      return;
    }

    const clipId = result.clipId;
    const uploadUrl = result.uploadUrl;

    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        await confirmClipUploaded(clipId, token);
        setStatus('done');
      } else {
        await markClipFailed(clipId, token);
        setError('Upload failed. Try again.');
        setStatus('error');
      }
    };
    xhr.onerror = async () => {
      await markClipFailed(clipId, token);
      setError('Upload failed. Try again.');
      setStatus('error');
    };
    xhr.send(form);
  }

  if (status === 'done') {
    return <div className="notice">Video uploaded &mdash; nice work.</div>;
  }

  return (
    <div className="box box--quiet">
      <p className="eyebrow">Film the team drinking</p>
      <input
        type="file"
        accept="video/*"
        capture
        disabled={status === 'uploading'}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) start(file);
        }}
      />

      {status === 'uploading' ? (
        <p className="small" style={{ margin: '8px 0 0' }}>
          Uploading… {progress}%
        </p>
      ) : null}

      {status === 'error' ? (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => lastFile && start(lastFile)}
          >
            Retry
          </button>
        </>
      ) : null}
    </div>
  );
}
