'use client';

import { useState } from 'react';

export default function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — select the text instead.
      window.prompt('Copy this link', url);
    }
  }

  return (
    <button className="copy-link" type="button" onClick={copy} title={url}>
      {copied ? 'COPIED' : label || 'COPY LINK'}
    </button>
  );
}
