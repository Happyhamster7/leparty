import { expect, test } from '@playwright/test';
import { admin, closeShop, device, makeParty, payPrizes, PHONE, seats, serveEveryone, session, signInAsHost, startGame, startRound } from './helpers';

test('the costume vote: one vote per phone, changeable, and a running game is told the result', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const { phones, tv } = await seats(browser, party);
  await startRound(host, 'Flip cup');
  await host.getByRole('button', { name: /enter results/ }).click();
  await payPrizes(host, ['1', '2', '3']);

  const best = party.people['Block A'][0];
  const worst = party.people['Block B'][0];
  const other = party.people['Block C'][0];

  const desk = await device(browser);
  await desk.context().addCookies(await host.context().cookies());
  await desk.goto(`/host/${party.eventId}`);
  await desk.getByRole('button', { name: 'OPEN THE COSTUME VOTE' }).click();
  await expect(desk.getByText('Voting is open')).toBeVisible();
  const { data: poll } = await admin().from('polls').select('id').eq('event_id', party.eventId).single();
  await expect(tv.locator('.tv-poll__qr svg')).toBeVisible({ timeout: 20_000 });

  const tap = async (page: typeof host, name: string, times = 1) => {
    for (let i = 0; i < times; i++) await page.locator('.g-person', { hasText: name }).click();
  };
  const voters = [];
  for (let i = 0; i < 4; i++) {
    const p = await device(browser, PHONE);
    await p.goto(`/vote/${poll!.id}`);
    await tap(p, best.name); // once: best
    await tap(p, i < 3 ? worst.name : other.name, 2); // twice: worst
    await p.getByRole('button', { name: 'Cast my vote' }).click();
    await expect(p.getByText('Your vote is in.')).toBeVisible();
    voters.push(p);
  }
  // The fourth changes their mind: a third tap clears, then the same worst as everyone.
  await tap(voters[3], other.name);
  await tap(voters[3], worst.name, 2);
  await voters[3].getByRole('button', { name: /Cast my vote|Vote saved/ }).click();
  await expect(voters[3].getByText('Your vote is in.')).toBeVisible();
  const ballots = await admin().from('poll_votes').select('voter_id', { count: 'exact', head: true }).eq('poll_id', poll!.id);
  expect(ballots.count).toBe(4);

  await voters[0].reload();
  await expect(voters[0].locator('.g-person.v-best')).toHaveCount(1);
  await expect(voters[0].locator('.g-person.v-worst')).toHaveCount(1);

  await desk.reload();
  await expect(desk.getByText('4 voted so far')).toBeVisible();
  await desk.getByRole('button', { name: /Close voting and show the results/ }).click();
  await expect(desk.getByText('Voting is closed')).toBeVisible();
  await expect(tv.locator('.tv-poll__winner').first()).toContainText(best.name, { timeout: 20_000 });
  await voters[1].reload();
  await expect(voters[1].getByRole('heading', { name: 'Voting has closed' })).toBeVisible();

  const s = await session(party);
  const { data: told } = await admin().from('game_actions').select('type, args').eq('session_id', s.id).like('client_action_id', 'poll-%').order('version');
  expect(told!.map((a) => [a.type, a.args.teamId])).toEqual([
    ['adjustPoints', party.blocks[0].id],
    ['assignDrinks', party.blocks[1].id],
  ]);
  await expect(phones['Block B'].getByText(/1× 🥃 Spirit from\s*the Warden/)).toBeVisible();

  await desk.getByRole('button', { name: 'Take it off the TV' }).click();
  await expect(tv.locator('.tv-poll')).toHaveCount(0, { timeout: 20_000 });
});

test('the shelf: a price change reaches the phones and an item taken off disappears', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const { phones } = await seats(browser, party);
  await startRound(host, 'Flip cup');
  await host.getByRole('button', { name: /enter results/ }).click();
  await payPrizes(host, ['1', '2', '3']);
  const phone = phones['Block A'];
  await expect(phone.locator('.g-item', { hasText: 'Wine' })).toContainText('$25');

  await host.locator('summary', { hasText: 'Set up the night' }).click();
  await host.getByLabel('Price of Wine').fill('5');
  await host.locator('tr', { hasText: 'Wine' }).getByRole('button', { name: 'SAVE' }).click();
  await expect(phone.locator('.g-item', { hasText: 'Wine' })).toContainText('$5');
  await host.getByLabel('Soju Bottle on the shelf').uncheck();
  await host.locator('tr', { hasText: 'Soju Bottle' }).getByRole('button', { name: 'SAVE' }).click();
  await expect(phone.locator('.g-item', { hasText: 'Soju Bottle' })).toHaveCount(0);
});

test('the other four phone games each play through to proposed placings', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const { phones, bar, tv } = await seats(browser, party);
  const [pA, pB, pC] = [phones['Block A'], phones['Block B'], phones['Block C']];
  const finish = async () => {
    await host.getByRole('button', { name: /Finish and place the teams/ }).click();
    await expect(host.getByText('The app has filled these in')).toBeVisible();
    return host.locator('form:has-text("Where did each") select').evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value));
  };
  const settle = async () => {
    await payPrizes(host);
    await closeShop(host);
    await serveEveryone(host, bar);
  };
  const edit = async (game: RegExp, fill: () => Promise<void>) => {
    const setup = host.locator('details', { hasText: 'Set up the night' });
    if (!(await setup.evaluate((d: HTMLDetailsElement) => d.open))) await setup.locator('summary').first().click();
    await host.locator('tr', { hasText: game }).getByRole('button', { name: 'EDIT' }).click();
    await fill();
    await host.getByRole('button', { name: 'Save game' }).click();
    await expect(host.getByRole('button', { name: 'Save game' })).toHaveCount(0);
  };

  await test.step('Two-Thirds of the Average: closest to the target wins', async () => {
    await startRound(host, 'Two-Thirds');
    for (const [name, n] of Object.entries({ 'Block A': '30', 'Block B': '60', 'Block C': '90' })) {
      await phones[name].fill('#pl-n', n);
      await phones[name].getByRole('button', { name: 'Lock it in' }).click();
    }
    await expect(tv.getByText(/Two-thirds of it is\s*40/)).toBeVisible();
    expect(await finish()).toEqual(['1', '2', '3']);
    await settle();
  });

  await test.step('Prisoner’s Dilemma: a turn resolves when every team has picked', async () => {
    await startRound(host, 'Prisoner');
    await host.getByRole('button', { name: 'First turn' }).click();
    for (const p of [pA, pB, pC]) await p.getByRole('button', { name: 'Snitch' }).click();
    await expect(tv.getByText('snitched').first()).toBeVisible();
    await finish();
    await settle();
  });

  await test.step('Name the opening: a wrong guess gives nothing away, a near miss counts', async () => {
    await edit(/^Anime opening guessing/, () => host.fill('#ge-o', 'Opening 1 | Attack on Titan | Shingeki no Kyojin | AoT'));
    await startRound(host, 'Anime');
    await host.getByRole('button', { name: 'First opening' }).click();
    await pA.fill('#pl-a', 'Naruto');
    await pA.getByRole('button', { name: 'Guess' }).click();
    await expect(pA.getByText('Not that one. Try again.')).toBeVisible();
    await expect(pA.locator('body')).not.toContainText('Attack on Titan');
    await pB.fill('#pl-a', 'attack on titen');
    await pB.getByRole('button', { name: 'Guess' }).click();
    await expect(tv.getByText(/got it: Attack on Titan/)).toBeVisible();
    expect((await finish())[1]).toBe('1');
    await settle();
  });

  await test.step('Truth or lie: the host says which it was', async () => {
    await edit(/^Is Jason lying/, async () => {
      await host.selectOption('#ge-kind', 'lying');
      await host.fill('#ge-s', '1');
    });
    await startRound(host, 'Is Jason');
    await host.getByRole('button', { name: 'First story' }).click();
    await pA.getByRole('button', { name: 'Truth', exact: true }).click();
    await pB.getByRole('button', { name: 'Lie', exact: true }).click();
    await pC.getByRole('button', { name: 'Lie', exact: true }).click();
    await expect(host.getByText('✓ voted')).toHaveCount(3); // every vote has landed before the host rules
    await host.getByRole('button', { name: 'It was a lie' }).click();
    await expect(tv.getByRole('heading', { name: 'It was a lie.' })).toBeVisible();
    expect((await finish())[0]).toBe('3');
  });
});
