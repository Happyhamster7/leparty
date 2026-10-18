'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { login, type HostState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Enter'}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState<HostState, FormData>(login, {});

  return (
    <form action={formAction}>
      <label className="field" htmlFor="passcode">
        Passcode
      </label>
      <input id="passcode" name="passcode" type="password" autoComplete="current-password" required />
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <Submit />
    </form>
  );
}
