'use client';

import { useFormStatus } from 'react-dom';

export default function JoinButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Filing…' : "I'm going"}
    </button>
  );
}
