import { cookies } from 'next/headers';

const COOKIE = 'leparty_host';

export function hostPasscode(): string {
  return process.env.HOST_PASSCODE || 'warden';
}

export function isHost(): boolean {
  return cookies().get(COOKIE)?.value === hostPasscode();
}

export function hostCookieName(): string {
  return COOKIE;
}

/**
 * Six readable characters. No O/0/I/1 — these get read aloud and typed
 * in bad light by people holding a drink.
 */
export function joinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const BLOCK_COLOURS = [
  '#1D4ED8',
  '#9C3A17',
  '#146B4A',
  '#6B2A86',
  '#A3123A',
  '#1F6F7A',
  '#7A5C00',
  '#3C3489',
];

export const BLOCK_NAMES = [
  'Block A',
  'Block B',
  'Block C',
  'Block D',
  'Block E',
  'Block F',
  'Block G',
  'Block H',
];
