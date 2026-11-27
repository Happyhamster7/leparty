import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const PASSCODE = process.env.HOST_PASSCODE || 'e2e-passcode';

/**
 * These tests create parties and people. They refuse to run against
 * anything but a database on this machine, so they can never fill the
 * real one with pretend guests. E2E_ALLOW_REMOTE=1 overrides that for a
 * deliberate one-off; every row they make is named ZZTEST either way.
 */
export function guard() {
  if (!URL || !KEY) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the test database. See e2e/README.md.');
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/.test(URL);
  if (!local && process.env.E2E_ALLOW_REMOTE !== '1') {
    throw new Error(`Refusing to run end-to-end tests against ${URL}: it isn’t a local database. See e2e/README.md.`);
  }
}

let client: SupabaseClient | null = null;
/** Direct database access for setting a scene up and checking what was saved. Never used by the app under test. */
export function admin(): SupabaseClient {
  guard();
  return (client ||= createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export const uniq = () => Math.random().toString(36).slice(2, 8);

/** A fresh browser, as one device. */
export async function device(browser: Browser, opts: BrowserContextOptions = { viewport: { width: 1200, height: 1000 } }): Promise<Page> {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: !!process.env.E2E_PROXY, ...opts });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
}

export const PHONE: BrowserContextOptions = { viewport: { width: 400, height: 820 } };

export async function signInAsHost(page: Page) {
  await page.goto('/host');
  await page.fill('#passcode', PASSCODE);
  await page.click('button[type=submit]');
  await expect(page.getByRole('link', { name: 'New party' })).toBeVisible();
}

export type Party = {
  eventId: string;
  tag: string;
  title: string;
  displayToken: string;
  barToken: string;
  blocks: { id: string; name: string; join_token: string }[];
  /** Names of everyone checked in, by block name. */
  people: Record<string, { id: string; name: string }[]>;
};

/**
 * A party ready to play: created through the app (so its blocks are the
 * app's own), then filled with checked-in people already on blocks,
 * written straight to the database to save a minute of clicking. The
 * door and the draw have their own test.
 */
export async function makeParty(host: Page, { blocks = 3, perBlock = 3, theme = 'jail' }: { blocks?: number; perBlock?: number; theme?: string } = {}): Promise<Party> {
  const tag = uniq();
  const title = `ZZTEST ${tag}`;
  await host.goto('/host/new');
  await host.fill('#name', `ZZTEST party ${tag}`);
  await host.fill('#theme_title', title);
  await host.selectOption('#theme_key', theme);
  await host.fill('#block_count', String(blocks));
  await host.click('button[type=submit]');
  await host.waitForURL(/\/host\/[0-9a-f-]{36}$/);
  const eventId = host.url().split('/').pop() as string;

  const db = admin();
  const { data: ev } = await db.from('events').select('display_token, bar_token').eq('id', eventId).single();
  const { data: rows } = await db.from('blocks').select('id, name, join_token').eq('event_id', eventId).order('name');
  const people: Party['people'] = {};
  let n = 0;
  for (const b of rows!) {
    people[b.name] = [];
    for (let i = 0; i < perBlock; i++) {
      const name = `ZZTEST ${tag} P${++n}`;
      const { data: person } = await db.from('people').insert({ display_name: name, capacity_band: 3 }).select('id').single();
      const { data: part } = await db
        .from('participants')
        .insert({ event_id: eventId, person_id: person!.id, rsvp: 'yes', checked_in_at: new Date().toISOString(), block_id: b.id })
        .select('id')
        .single();
      people[b.name].push({ id: part!.id, name });
    }
  }
  await db.from('blocks').update({ in_play: true }).eq('event_id', eventId);
  return { eventId, tag, title, displayToken: ev!.display_token, barToken: ev!.bar_token, blocks: rows!, people };
}

/** Adds Shifty Shen's Slammer to the party and opens the host's game console. */
export async function startGame(host: Page, party: Party) {
  await host.goto(`/host/${party.eventId}`);
  await host.getByRole('button', { name: /ADD SHIFTY SHEN/ }).click();
  await host.getByRole('link', { name: 'Run the game' }).click();
  await host.waitForURL(/\/game$/);
  await expect(host.getByText(/Round 1 of \d+: which game/)).toBeVisible();
}

/** Every seat's screen, each in its own browser: three team phones, the bar and the TV. */
export async function seats(browser: Browser, party: Party) {
  const phones: Record<string, Page> = {};
  for (const b of party.blocks) {
    phones[b.name] = await device(browser, PHONE);
    await phones[b.name].goto(`/b/${b.join_token}`);
  }
  const bar = await device(browser, { viewport: { width: 1000, height: 760 } });
  await bar.goto(`/bar/${party.barToken}`);
  const tv = await device(browser, { viewport: { width: 1600, height: 900 } });
  await tv.goto(`/tv/${party.displayToken}`);
  return { phones, bar, tv };
}

/** Picks a game by the start of its name and starts the round. */
export async function startRound(host: Page, game: string) {
  const options = await host.locator('#g-next option').allInnerTexts();
  const label = options.find((t) => t.startsWith(game));
  if (!label) throw new Error(`No game starting "${game}" in: ${options.join(' | ')}`);
  await host.selectOption('#g-next', { label });
  await host.getByRole('button', { name: 'Start the round' }).click();
}

/** Host: enter placings in block order and pay the prizes, which opens the shop. */
export async function payPrizes(host: Page, places?: string[]) {
  await expect(host.getByText('Where did each')).toBeVisible();
  if (places) for (const [i, v] of places.entries()) await host.locator('form:has-text("Where did each") select').nth(i).selectOption(v);
  await host.getByRole('button', { name: /Pay the prizes/ }).click();
}

export const closeShop = (host: Page) => host.getByRole('button', { name: /and start drinks/ }).click();

/** Bar: serve whoever is in line, each finishing in time, until the round is over. */
export async function serveEveryone(host: Page, bar: Page) {
  const nextRound = host.getByText(/Round \d+ of \d+: which game/);
  for (let i = 0; i < 40; i++) {
    if (await nextRound.isVisible()) return;
    const call = bar.getByRole('button', { name: /^Call .* up$/ });
    if (await call.isVisible()) {
      await call.click();
      await bar.getByRole('button', { name: 'Done in time' }).click();
    } else {
      await bar.waitForTimeout(700);
    }
  }
  await expect(nextRound).toBeVisible();
}

/** A team phone sends drinks through the shop and waits until the app confirms it. */
export async function sendDrinks(phone: Page, item: string, to: string, qty = 1) {
  await phone.locator('.g-item', { hasText: item }).first().click();
  await phone.locator('.g-buy .g-person', { hasText: to }).click();
  for (let i = 1; i < qty; i++) await phone.getByRole('button', { name: 'One more' }).click();
  await phone.getByRole('button', { name: `Send ${qty}`, exact: true }).click();
  await expect(phone.getByText(`Sent ${qty}× ${item} to ${to}.`)).toBeVisible();
}

/**
 * Calls the game's API from inside a page, exactly as that page's own
 * screen would: same cookies, same origin. (Playwright's separate
 * request client won't send a Secure cookie over plain http, which is
 * what a production build on 127.0.0.1 sets.)
 */
export async function api(page: Page, path: string, opts: { headers?: Record<string, string>; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  return page.evaluate(
    async ({ path, headers, body }) => {
      const res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, headers: opts.headers ?? {}, body: opts.body },
  );
}

/** The cash and points tiles at the top of a team's phone. */
export const cash = (phone: Page) => phone.locator('.stat', { hasText: 'Cash' });
export const points = (phone: Page) => phone.locator('.stat', { hasText: 'Points' });

/** The session row for a party's running game. */
export async function session(party: Party) {
  const { data } = await admin().from('game_sessions').select('id, version, state').eq('event_id', party.eventId).eq('status', 'active').single();
  return data as { id: string; version: number; state: Record<string, unknown> };
}
