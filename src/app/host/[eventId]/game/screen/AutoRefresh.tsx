'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Nobody's sitting at the TV to press reload. Every other view in the
 * app is driven by someone acting on it (a host pressing a button, a
 * team submitting a form), which naturally refetches — this is the
 * first view with nobody there, so it polls itself. The design doc
 * says "about once a second" for live sync generally; 5 seconds here
 * is a deliberate reduction for a screen nobody's directly operating.
 */
export default function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
