'use client';

import { useRouter } from 'next/navigation';
import MugshotCapture from '@/components/MugshotCapture';
import { saveGuestPhoto } from '../../../actions';

export default function GuestPhoto({
  eventId,
  participantId,
  plate,
  existingUrl,
  compact = false,
}: {
  eventId: string;
  participantId: string;
  plate: string;
  existingUrl: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const upload = saveGuestPhoto.bind(null, eventId, participantId);

  return (
    <MugshotCapture
      plate={plate}
      existingUrl={existingUrl}
      upload={upload}
      compact={compact}
      onDone={() => router.refresh()}
    />
  );
}
