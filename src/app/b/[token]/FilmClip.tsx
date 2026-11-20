'use client';

import { useRef, useState } from 'react';
import { finishClip, startClip } from './clipActions';

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Film a short clip for the TV. The phone's own camera does the
 * recording; the video then goes straight to storage with a signed
 * link, never through this app's server.
 */
export default function FilmClip({ token }: { token: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [state, setState] = useState<{ step: 'idle' | 'sending' | 'done' | 'error'; pct?: number; error?: string }>({ step: 'idle' });

  async function send(file: File) {
    if (file.size > MAX_BYTES) return setState({ step: 'error', error: 'That video is too big (50 MB at most). Keep it short.' });
    setState({ step: 'sending', pct: 0 });
    const begun = await startClip(token, file.type, file.size);
    if (!begun.ok) return setState({ step: 'error', error: begun.error });

    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', begun.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => e.lengthComputable && setState({ step: 'sending', pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok || !(await finishClip(token, begun.clipId, caption))) return setState({ step: 'error', error: 'The upload didn’t make it. Try again.' });
    setCaption('');
    setState({ step: 'done' });
  }

  return (
    <div className="box box--quiet">
      <p className="eyebrow">Film it for the TV</p>
      <label className="field" htmlFor="clip-caption">
        Caption <span className="opt">(optional)</span>
      </label>
      <input id="clip-caption" type="text" maxLength={80} value={caption} onChange={(e) => setCaption(e.target.value)} />
      <input
        ref={input}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) send(file);
        }}
      />
      <button className="btn btn--quiet" type="button" disabled={state.step === 'sending'} onClick={() => input.current?.click()} style={{ marginTop: 12 }}>
        {state.step === 'sending' ? `Sending… ${state.pct ?? 0}%` : state.step === 'done' ? 'Film another' : 'Film a clip'}
      </button>
      {state.step === 'done' ? <p className="small" style={{ marginBottom: 0 }}>Sent. It’s on the TV.</p> : null}
      {state.step === 'error' ? <p className="error" role="alert">{state.error}</p> : null}
    </div>
  );
}
