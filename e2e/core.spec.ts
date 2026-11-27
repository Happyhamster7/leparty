import { expect, test } from '@playwright/test';
import { admin, device, makeParty, PHONE, signInAsHost, uniq } from './helpers';

test('a guest signs up, joins a party and reaches every page of the invite', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host, { blocks: 2, perBlock: 1 });

  const guest = await device(browser, PHONE);
  const name = `ZZTEST ${party.tag} Guest`;
  await guest.goto('/signup');
  await guest.fill('#display_name', name);
  await guest.locator('input[name=capacity_band][value="3"]').check({ force: true });
  await guest.click('button[type=submit]');
  await guest.waitForURL(/\/parties/);

  await guest.locator('li, div, article').filter({ hasText: party.title }).last().locator('button').first().click();
  await guest.waitForURL(/\/i\/[0-9a-f]+/);
  const token = guest.url().split('/i/')[1].split('/')[0];
  await expect(guest.getByRole('heading', { name: 'Mugshot' })).toBeVisible();

  for (const path of ['', '/going', '/booked', '/potluck', '/identity']) {
    const res = await guest.goto(`/i/${token}${path}`);
    expect(res!.status(), `/i/…${path}`).toBe(200);
    await expect(guest.locator('body')).not.toContainText('Application error');
  }

  // The guest joined this party and no other.
  const { data } = await admin().from('participants').select('event_id, rsvp, people!inner(display_name)').eq('people.display_name', name);
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ event_id: party.eventId, rsvp: 'yes' });
});

test('the door registers six people in a row and loses none; the draw puts everyone on a block', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const tag = uniq();
  await host.goto('/host/new');
  await host.fill('#name', `ZZTEST party ${tag}`);
  await host.fill('#theme_title', `ZZTEST ${tag}`);
  await host.fill('#block_count', '3');
  await host.click('button[type=submit]');
  await host.waitForURL(/\/host\/[0-9a-f-]{36}$/);
  const eventId = host.url().split('/').pop() as string;
  await expect(host.getByRole('link', { name: 'BLOCK CARDS' })).toBeVisible();

  await host.goto(`/host/${eventId}/checkin`);
  await host.getByRole('button', { name: /NOT ON THE LIST/i }).click();
  for (let i = 1; i <= 6; i++) {
    const name = `ZZTEST ${tag} Door ${i}`;
    await host.fill('input[name=display_name]', name);
    await host.locator('form:has(input[name=display_name]) button[type=submit]').click();
    await expect(host.getByText(`${name} added and checked in.`)).toBeVisible();
  }
  const db = admin();
  const here = await db.from('participants').select('id', { count: 'exact', head: true }).eq('event_id', eventId).not('checked_in_at', 'is', null);
  expect(here.count).toBe(6);

  await host.goto(`/host/${eventId}/draw`);
  await host.getByRole('button', { name: 'Confirm draw' }).click();
  await host.waitForURL(/\/cards/);
  await expect(host.getByRole('heading', { name: 'Block cards' })).toBeVisible();

  const { data: blocks } = await db.from('blocks').select('id, name, in_play').eq('event_id', eventId).order('name');
  const { data: placed } = await db.from('participants').select('block_id').eq('event_id', eventId);
  expect(blocks!.map((b) => b.name)).toEqual(['Block A', 'Block B', 'Block C']);
  for (const b of blocks!) {
    expect(b.in_play).toBe(true);
    expect(placed!.filter((p) => p.block_id === b.id)).toHaveLength(2);
  }
});

test('the TV and the bar each open with their own link, and neither opens the other or the host console', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await host.goto(`/host/${party.eventId}`);
  await expect(host.getByRole('button', { name: 'COPY TV LINK' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'COPY BAR LINK' })).toBeVisible();

  const screen = await device(browser);
  expect((await screen.goto(`/tv/${party.displayToken}`))!.status()).toBe(200);
  await expect(screen.getByText('9 HERE')).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Block A' })).toBeVisible();
  await expect(screen.getByText(party.people['Block B'][0].name)).toBeVisible();

  expect((await screen.goto(`/tv/${party.barToken}`))!.status()).toBe(404);
  expect((await screen.goto(`/bar/${party.displayToken}`))!.status()).toBe(404);
  expect((await screen.goto(`/bar/${party.barToken}`))!.status()).toBe(200);
  await expect(screen.getByRole('heading', { name: 'Nothing to pour' })).toBeVisible();

  await screen.goto(`/host/${party.eventId}`);
  await expect(screen.getByText('COPY TV LINK')).toHaveCount(0);
});

test('scanning a block card claims the block; a second phone takes it over', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  const [a] = party.blocks;
  const claimed = async () => (await admin().from('blocks').select('team_device_id').eq('id', a.id).single()).data!.team_device_id as string | null;

  const first = await device(browser, PHONE);
  await first.goto(`/b/${a.join_token}`);
  await expect(first.getByRole('heading', { name: 'Block A' })).toBeVisible();
  await expect.poll(claimed).not.toBeNull();
  const firstId = await claimed();

  // The roster is there, folded away until it's wanted.
  const roster = first.locator('details', { hasText: 'Your block (3)' });
  await expect(roster).toBeVisible();
  expect(await roster.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
  await roster.locator('summary').click();
  await expect(roster.getByText(party.people['Block A'][0].name)).toBeVisible();

  const second = await device(browser, PHONE);
  await second.goto(`/b/${a.join_token}`);
  await expect.poll(claimed).not.toBe(firstId);
});

test('switching a party from Prison to Plain changes its words and colours everywhere', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  const accent = (page: typeof host) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--rust').trim());

  await host.goto(`/host/${party.eventId}`);
  await expect(host.getByText('WARDEN’S CONSOLE')).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Cell blocks' })).toBeVisible();
  expect(await accent(host)).toBe('#a3521f');

  await host.goto(`/host/${party.eventId}/edit`);
  await host.selectOption('#theme_key', 'plain');
  await host.locator('form:has(#theme_key) button[type=submit]').click();
  await expect(host.getByText('Saved.')).toBeVisible();

  await host.goto(`/host/${party.eventId}`);
  await expect(host.getByText('HOST CONSOLE')).toBeVisible();
  await expect(host.getByRole('link', { name: 'TEAM CARDS' })).toBeVisible();
  await expect(host.locator('body')).not.toContainText(/warden|cell block|mugshot/i);
  expect(await accent(host)).toBe('#1d4ed8');

  const phone = await device(browser, PHONE);
  await phone.goto(`/b/${party.blocks[0].join_token}`);
  await expect(phone.getByText('Your team (3)')).toBeVisible();
});
