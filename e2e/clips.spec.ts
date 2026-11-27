import path from 'node:path';
import { expect, test } from '@playwright/test';
import { admin, closeShop, device, makeParty, payPrizes, PHONE, seats, sendDrinks, signInAsHost, startGame, startRound } from './helpers';

test('a team films while it is drinking; the clip reaches private storage, plays on the TV, and a host can take it off', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const { phones, bar, tv } = await seats(browser, party);
  const phone = phones['Block B'];

  await startRound(host, 'Flip cup');
  await host.getByRole('button', { name: /enter results/ }).click();
  await payPrizes(host, ['1', '2', '3']);
  await expect(phone.getByRole('button', { name: 'Film a clip' })).toHaveCount(0); // not drinking yet
  await sendDrinks(phones['Block A'], 'Spirit', 'Block B');
  await closeShop(host);
  await bar.getByRole('button', { name: 'Call Block B up' }).click();

  await phone.fill('#clip-caption', 'down in one');
  await phone.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'clip.webm'));
  await expect(phone.getByText('Sent. It’s on the TV.')).toBeVisible({ timeout: 40_000 });

  const { data: clips } = await admin().from('clips').select('status, caption, content_type, storage_path, block_id').eq('event_id', party.eventId);
  expect(clips).toHaveLength(1);
  expect(clips![0]).toMatchObject({ status: 'live', caption: 'down in one', content_type: 'video/webm', block_id: party.blocks[1].id });
  const file = await admin().storage.from('clips').download(clips![0].storage_path);
  expect(file.data!.size).toBeGreaterThan(1000);

  await expect(tv.locator('.reel video')).toBeVisible({ timeout: 30_000 });
  await expect(tv.getByText('Block B — down in one')).toBeVisible();
  await expect.poll(() => tv.locator('.reel video').evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0 && v.muted), { timeout: 30_000 }).toBe(true);

  // Only the phone that holds the card can post for the team.
  const other = await device(browser, PHONE);
  await other.goto(`/b/${party.blocks[1].join_token}`);
  await expect(other.getByRole('button', { name: 'Film a clip' })).toBeVisible();
  await expect(phone.getByText(/no longer signed in/)).toBeVisible();
  await expect(phone.getByRole('button', { name: /Film/ })).toHaveCount(0);

  const desk = await device(browser);
  await desk.context().addCookies(await host.context().cookies());
  await desk.goto(`/host/${party.eventId}`);
  await desk.getByRole('button', { name: 'TAKE OFF THE TV' }).click();
  await expect(desk.getByText('(off the TV)')).toBeVisible();
  await expect(tv.locator('.reel')).toHaveCount(0, { timeout: 30_000 });
  expect((await admin().storage.from('clips').download(clips![0].storage_path)).data!.size).toBeGreaterThan(1000); // the file is kept
});
