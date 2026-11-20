import type { Opening, TriviaQuestion } from './types';

export const toInt = (v: unknown, fallback = 0): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

export const toBool = (v: unknown): boolean => v === true || v === 'true' || v === 'on';

export const cleanText = (v: unknown, max = 120): string =>
  String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Multi-line rules: keep line breaks, tidy each line. */
export const cleanRules = (v: unknown): string =>
  String(v ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1200);

/** A line that couldn't be read, and which one (1-based). */
export class ParseError extends Error {
  constructor(public line: number, public letters = '') {
    super(`line ${line}`);
  }
}

/**
 * Trivia, one question per line: "Question | answer | answer | … | right one".
 * Two to four answers; the last field is the right one, as a letter, a
 * number or the answer itself.
 */
export function parseTrivia(text: unknown): TriviaQuestion[] {
  const out: TriviaQuestion[] = [];
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split('|').map((x) => cleanText(x, 160)).filter(Boolean);
      if (parts.length < 4) throw new ParseError(i + 1);
      const [q, ...rest] = parts;
      const key = rest.pop() as string;
      const options = rest.slice(0, 4);
      const answer = /^[A-Da-d]$/.test(key)
        ? key.toUpperCase().charCodeAt(0) - 65
        : /^[1-4]$/.test(key)
          ? Number(key) - 1
          : options.findIndex((o) => o.toLowerCase() === key.toLowerCase());
      if (!(answer >= 0 && answer < options.length)) throw new ParseError(i + 1, `A–${String.fromCharCode(64 + options.length)}`);
      out.push({ q, options, answer });
    });
  return out;
}

/** Openings, one per line: "Label | right answer | other accepted spelling | …". */
export function parseOpenings(text: unknown): Opening[] {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [label, ...answers] = line.split('|').map((x) => cleanText(x, 120)).filter(Boolean);
      if (!answers.length) throw new ParseError(i + 1);
      return { label, answers };
    });
}

const squash = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');

function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Typed answers forgive case, punctuation, spaces, a leading "the" and a typo or two on longer names. */
export function guessMatches(guess: string, answers: string[]): boolean {
  const g = squash(guess);
  if (!g) return false;
  return answers.some((ans) => {
    const a = squash(ans);
    if (!a) return false;
    if (a === g) return true;
    const slack = a.length >= 12 ? 2 : a.length >= 6 ? 1 : 0;
    return slack > 0 && Math.abs(a.length - g.length) <= slack && editDistance(a, g) <= slack;
  });
}
