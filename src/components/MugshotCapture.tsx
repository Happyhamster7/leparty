'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toJpegBlob, fileToJpegBlob } from '@/lib/image';

export type UploadResult = { error?: string; ok?: boolean };

/**
 * The camera, shared by guest signup and the door. The caller supplies
 * the upload and decides what happens afterwards, so the same
 * component serves "book me in" and "take Sam's photo at the desk".
 */
export default function MugshotCapture({
  plate,
  existingUrl,
  upload,
  onDone,
  compact = false,
}: {
  plate: string;
  existingUrl: string | null;
  upload: (fd: FormData) => Promise<UploadResult>;
  onDone?: () => void;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [live, setLive] = useState(false);
  const [preview, setPreview] = useState<string | null>(existingUrl);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [saved, setSaved] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    setSaved(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraDenied(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
      setPreview(null);
      setBlob(null);
    } catch {
      setCameraDenied(true);
      setError('Couldn’t open the camera. Use “choose a photo” instead.');
    }
  }, []);

  const shoot = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const jpeg = await toJpegBlob(videoRef.current);
      stop();
      setBlob(jpeg);
      setPreview(URL.createObjectURL(jpeg));
    } catch {
      setError('That didn’t capture. Try again.');
    }
  }, [stop]);

  const onPick = useCallback(
    async (file: File) => {
      setError(null);
      setSaved(false);
      try {
        const jpeg = await fileToJpegBlob(file);
        setBlob(jpeg);
        setPreview(URL.createObjectURL(jpeg));
        stop();
      } catch {
        setError('Couldn’t read that image. Try another.');
      }
    },
    [stop]
  );

  const send = useCallback(async () => {
    if (!blob) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('photo', new File([blob], 'mugshot.jpg', { type: 'image/jpeg' }));
    const result = await upload(fd);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setBlob(null);
    setSaved(true);
    onDone?.();
  }, [blob, upload, onDone]);

  return (
    <>
      <div className="camera" style={compact ? { maxWidth: 260, margin: '0 auto 16px' } : undefined}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ display: live ? 'block' : 'none' }}
        />

        {!live && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Mugshot" />
        ) : null}

        {!live && !preview ? <div className="hint">FACE IN THE BOX</div> : null}

        <div className="chart" aria-hidden="true">
          <span>6&prime;2&Prime;</span>
          <span>5&prime;10&Prime;</span>
          <span>5&prime;6&Prime;</span>
          <span>5&prime;2&Prime;</span>
        </div>

        <div className="plate">{plate}</div>
      </div>

      <div className="shutter-row">
        {live ? (
          <>
            <button className="btn btn--quiet btn--inline" type="button" onClick={stop}>
              CANCEL
            </button>
            <button className="shutter" type="button" aria-label="Take photo" onClick={shoot} />
            <span style={{ width: 86 }} aria-hidden="true" />
          </>
        ) : (
          <>
            <button
              className="btn btn--quiet btn--inline"
              type="button"
              onClick={start}
              disabled={busy}
            >
              {preview ? 'RETAKE' : 'OPEN CAMERA'}
            </button>
            <label className="btn btn--quiet btn--inline" style={{ cursor: 'pointer' }}>
              CHOOSE A PHOTO
              <input
                type="file"
                accept="image/*"
                capture="user"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPick(f);
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {saved ? (
        <p className="small" style={{ color: '#0f5438', marginTop: -8 }}>
          Mugshot filed.
        </p>
      ) : null}
      {cameraDenied && !error ? (
        <p className="small" style={{ marginTop: -8 }}>
          No camera access here &mdash; &ldquo;choose a photo&rdquo; opens the camera app instead.
        </p>
      ) : null}

      {blob ? (
        <button className="btn" type="button" onClick={send} disabled={busy}>
          {busy ? 'Filing…' : 'Save mugshot'}
        </button>
      ) : null}
    </>
  );
}
