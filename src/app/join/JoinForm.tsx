'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { joinByCode, type JoinState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Enter the block'}
    </button>
  );
}

export default function JoinForm() {
  const [state, formAction] = useFormState<JoinState, FormData>(joinByCode, {});

  return (
    <form action={formAction}>
      <label className="field" htmlFor="code">
        Code on your block&rsquo;s card
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="K7M2QX"
        maxLength={8}
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 28,
          letterSpacing: '0.2em',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
        required
      />
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <Submit />
    </form>
  );
}
