'use client';

import { useState } from 'react';

export default function CopyAll({ lines }: { lines: string[] }) {
  const [done, setDone] = useState(false);

  async function copy() {
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt('Copy all links', text);
    }
  }

  return (
    <button className="btn btn--quiet btn--inline" type="button" onClick={copy}>
      {done ? 'COPIED ALL' : 'COPY EVERY LINK'}
    </button>
  );
}
