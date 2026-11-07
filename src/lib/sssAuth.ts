import { timingSafeEqual } from 'crypto';

/**
 * The Shifty Shen's Slammer game app reads checked-in guests and blocks
 * from here (server to server) so it can run the night on LeParty's
 * draw. It sends `Authorization: Bearer <SSS_ROSTER_SECRET>`; the same
 * value is set on both Vercel projects. No secret configured means the
 * endpoints are off.
 */
export function sssAuthorised(req: Request): boolean {
  const secret = process.env.SSS_ROSTER_SECRET;
  if (!secret) return false;
  const sent = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
