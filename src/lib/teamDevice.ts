import { cookies } from 'next/headers';

const COOKIE = 'leparty_device';

export function deviceCookieName(): string {
  return COOKIE;
}

/** This browser's device id, or null if it has never claimed a team phone. */
export function readDeviceId(): string | null {
  return cookies().get(COOKIE)?.value ?? null;
}

export function freshDeviceId(): string {
  const alphabet = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 24; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
