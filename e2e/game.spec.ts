import { expect, test } from '@playwright/test';
import { admin, api, cash, closeShop, device, makeParty, payPrizes, PHONE, points, seats, sendDrinks, serveEveryone, session, signInAsHost, startGame, startRound } from './helpers';

test('a night through every seat: picks, results, the shop, the bar, phone games and rulings', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const { phones, bar, tv } = await seats(browser, party);
  const [pA, pB, pC] = [phones['Block A'], phones['Block B'], phones['Block C']];

  await test.step('every seat connects', async () => {
    await expect(cash(pA)).toContainText('$32');
    await expect(bar.getByRole('heading', { name: 'Nothing to pour' })).toBeVisible();
    await expect(tv.getByText('The game starts soon')).toBeVisible();
    await tv.getByRole('button', { name: 'TURN SOUND ON' }).click();
    await expect(tv.locator('.g-sound')).toHaveCount(0);
  });

  await test.step('a picked-player round: picks stay secret until the last one', async () => {
    await startRound(host, 'Basketball');
    await expect(pA.getByText('Pick 1 to play Basketball')).toBeVisible();
    await expect(pA.getByText('Send drinks')).toHaveCount(0); // the shop is shut during a game
    await expect(tv.getByText(/picking 1 to play/)).toBeVisible();
    for (const p of [pA, pB]) {
      await p.locator('.g-person:not([disabled])').first().click();
      await p.getByRole('button', { name: 'Lock in' }).click();
    }
    await expect(pA.getByText('Locked in')).toBeVisible();
    await expect(tv.locator('.g-tv__main')).not.toContainText(party.tag); // no names on the TV yet
    await pC.locator('.g-person:not([disabled])').first().click();
    await pC.getByRole('button', { name: 'Lock in' }).click();
    await expect(tv.locator('.g-tv__main')).toContainText(party.tag);
    await expect(pA.getByText('Playing Basketball')).toBeVisible();
  });

  await test.step('results pay prizes and open the shop', async () => {
    await host.getByRole('button', { name: /enter results/ }).click();
    await payPrizes(host, ['1', '2', '3']);
    await expect(cash(pA)).toContainText('$67');
    await expect(pA.getByText('Send drinks')).toBeVisible();
    await expect(tv.locator('.g-reveal')).toContainText('+$35');
  });

  await test.step('the shop: a send, and an anonymous one', async () => {
    await sendDrinks(pA, 'Spirit', 'Block B', 2);
    await expect(cash(pA)).toContainText('$37');
    await expect(pB.getByText(/Coming your way:\s*2× 🥃 Spirit from\s*Block A/)).toBeVisible();
    await pC.locator('.g-item', { hasText: 'Burner Phone' }).click();
    await pC.getByRole('button', { name: /Buy for \$45/ }).click();
    await expect(pC.getByText('Bought Burner Phone.')).toBeVisible();
    await sendDrinks(pC, 'Soju Shot', 'Block B', 1);
    await expect(pB.getByText(/Soju Shot from\s*Anonymous/)).toBeVisible();
    await expect(tv.getByText('Anonymous sent 🍶 Soju Shot to Block B.')).toBeVisible();
  });

  await test.step('the bar: fewest first, what to pour, the real sender, the clock', async () => {
    await closeShop(host);
    await expect(bar.getByText('Next in line')).toBeVisible();
    await expect(bar.getByText('2× 🥃 Spirit')).toBeVisible();
    await expect(pB.getByText(/3 coming your way\..*next at the bar/)).toBeVisible();
    await expect(pA.getByText('Safe this round')).toBeVisible();

    await bar.getByRole('button', { name: 'Call Block B up' }).click();
    await bar.getByLabel(/Show who sent/).check();
    await expect(bar.getByText('Block C (anonymous to the room)')).toBeVisible();

    // Filming is for the team that is drinking, and nobody else.
    await expect(pB.getByRole('button', { name: 'Film a clip' })).toBeVisible();
    await expect(pA.getByRole('button', { name: 'Film a clip' })).toHaveCount(0);

    await bar.getByRole('button', { name: 'Start the clock' }).click();
    await expect(pB.getByText('You’re up: 3 to drink.')).toBeVisible();
    await expect(tv.locator('.g-reveal li.up .g-clock')).toBeVisible();
    await bar.getByRole('button', { name: 'Done in time' }).click();
    await expect(cash(pB)).toContainText('$65'); // 61 + the first step of drink income
    await expect(host.getByText(/Round 2 of \d+: which game/)).toBeVisible();
    await expect(points(pA)).toContainText('6');
    await expect(points(pC)).toContainText('1');
  });

  await test.step('Cold War on the phones: the app scores it and proposes the placings', async () => {
    await startRound(host, 'Cold War');
    for (const [name, n] of Object.entries({ 'Block A': '9', 'Block B': '2', 'Block C': '5' })) {
      await phones[name].fill('#pl-n', n);
      await phones[name].getByRole('button', { name: 'Lock it in' }).click();
    }
    await expect(tv.locator('.g-reveal li', { hasText: 'Block B' })).toContainText('drinks 11');
    await host.getByRole('button', { name: /Finish and place the teams/ }).click();
    await expect(host.getByText('The app has filled these in')).toBeVisible();
    const proposed = await host.locator('form:has-text("Where did each") select').evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value));
    expect(proposed).toEqual(['1', '3', '2']);
    await payPrizes(host);
    await closeShop(host);
    await bar.getByRole('button', { name: 'Call Block C up' }).click(); // 5 before 11
    await bar.getByRole('button', { name: 'Done in time' }).click();
    await bar.getByRole('button', { name: 'Call Block B up' }).click();
    await bar.getByRole('button', { name: /COULDN.T FINISH/ }).click();
    await expect(host.getByText(/Round 3 of \d+: which game/)).toBeVisible();
  });

  await test.step('Trivia: the host types the questions, the answer stays hidden until everyone is in', async () => {
    await host.locator('summary', { hasText: 'Set up the night' }).click();
    await host.locator('tr', { hasText: /^Trivia/ }).getByRole('button', { name: 'EDIT' }).click();
    await host.fill('#ge-q', 'What colour is the sky? | Blue | Green | Red | A\nHow many legs has a spider? | Six | Eight | B');
    await host.getByRole('button', { name: 'Save game' }).click();
    await expect(host.getByText('2 questions')).toBeVisible();
    await startRound(host, 'Trivia');
    await host.getByRole('button', { name: 'First question' }).click();
    await expect(tv.getByRole('heading', { name: 'What colour is the sky?' })).toBeVisible();
    await expect(tv.locator('.g-options li.right')).toHaveCount(0);
    await pA.getByRole('button', { name: /A\. Blue/ }).click();
    await pB.getByRole('button', { name: /B\. Green/ }).click();
    await pC.getByRole('button', { name: /A\. Blue/ }).click();
    await expect(tv.locator('.g-options li.right')).toHaveCount(1);
    await host.getByRole('button', { name: 'Next question' }).click();
    await pA.getByRole('button', { name: /B\. Eight/ }).click();
    await pB.getByRole('button', { name: /B\. Eight/ }).click();
    await pC.getByRole('button', { name: /A\. Six/ }).click();
    await expect(host.locator('.g-scores', { hasText: 'Block A' }).first()).toContainText(/Block A\s*2/);
    await host.getByRole('button', { name: /Finish and place the teams/ }).click();
    await expect(host.getByText('The app has filled these in')).toBeVisible();
    expect(await host.locator('form:has-text("Where did each") select').first().inputValue()).toBe('1');
    await payPrizes(host);
  });

  await test.step('rulings: a fine can’t go below zero, and a refusal is said in the party’s words', async () => {
    await host.locator('summary', { hasText: 'Rulings' }).click();
    await host.selectOption('#r-team', party.blocks[0].id);
    await host.fill('#r-amount', '-9999');
    await host.fill('#r-reason', 'cheating at trivia');
    await host.locator('form:has(#r-team) button[type=submit]').click();
    await expect(cash(pA)).toContainText('$0');
    await pA.locator('.g-item', { hasText: 'Wine' }).click();
    await pA.locator('.g-buy .g-person', { hasText: 'Block C' }).click();
    await pA.getByRole('button', { name: 'Send 1', exact: true }).click();
    await expect(pA.getByText('Not enough cash. Block A has $0, this costs $25.')).toBeVisible();
  });

  await test.step('a second phone takes the team over, and the first is told', async () => {
    const other = await device(browser, PHONE);
    await other.goto(`/b/${party.blocks[0].join_token}`);
    await expect(cash(other)).toContainText('$0');
    await expect(pA.getByText(/no longer signed in/)).toBeVisible();
  });

  await test.step('the log has exactly one row per change', async () => {
    const s = await session(party);
    const { count } = await admin().from('game_actions').select('id', { count: 'exact', head: true }).eq('session_id', s.id);
    expect(count).toBe(s.version);
  });
});

test('the API refuses the wrong seat, and a double tap or a burst of writes lands exactly once each', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const [A, B, C] = party.blocks;
  const s = await session(party);
  const state = `/api/sessions/${s.id}/state`;
  const action = `/api/sessions/${s.id}/action`;

  const phone = await device(browser, PHONE);
  await phone.goto(`/b/${A.join_token}`);
  await expect(cash(phone)).toContainText('$32');
  const anyone = await device(browser);
  await anyone.goto('/signup');
  const team = { 'x-team-token': A.join_token };
  const tv = { 'x-screen-token': party.displayToken };
  const barSeat = { 'x-screen-token': party.barToken };

  await test.step('each seat gets its own view, and no seat gets another’s', async () => {
    expect((await api(anyone, state)).status).toBe(401);
    expect((await api(anyone, state, { headers: tv })).body).toMatchObject({ ok: true, role: 'display' });
    expect((await api(anyone, state, { headers: barSeat })).body).toMatchObject({ ok: true, role: 'bar' });
    expect((await api(anyone, action, { headers: tv, body: { type: 'startRound' } })).status).toBe(403);
    expect((await api(anyone, action, { headers: barSeat, body: { type: 'startRound' } })).body).toMatchObject({ ok: false, code: 'action.forbidden' });
    expect((await api(phone, state, { headers: team })).body).toMatchObject({ ok: true, role: 'team' });
    expect((await api(phone, state, { headers: { 'x-team-token': B.join_token } })).status).toBe(401);
    expect((await api(host, state)).body).toMatchObject({ ok: true, role: 'host' });
    // A host's browser presenting a team's card is not the host, and not that team either: it never scanned the card.
    expect((await api(host, state, { headers: team })).status).toBe(401);
  });

  const games = (await api(host, state)).body.view.games as { id: string; name: string }[];
  await api(host, action, { body: { type: 'startRound', args: { gameId: games.find((g) => g.name === 'Flip cup')!.id } } });
  await api(host, action, { body: { type: 'toResults' } });
  await api(host, action, { body: { type: 'enterResults', args: { placings: { [A.id]: 1, [B.id]: 2, [C.id]: 3 } } } });

  await test.step('the same tap twice at the same moment charges once', async () => {
    const tap = { id: `double-${party.tag}`, type: 'buy', args: { itemId: 'spirit', targetTeamId: B.id, qty: 2 } };
    const [one, two] = await Promise.all([api(phone, action, { headers: team, body: tap }), api(phone, action, { headers: team, body: tap })]);
    expect([one.body.ok, two.body.ok]).toEqual([true, true]);
    expect([one.body.duplicate, two.body.duplicate].sort()).toEqual([false, true]);
  });

  await test.step('ten writes at once all land', async () => {
    const before = (await session(party)).version;
    const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => api(host, action, { body: { id: `burst-${party.tag}-${i}`, type: 'adjustMoney', args: { teamId: C.id, amount: 1 } } })));
    expect(burst.every((r) => r.body.ok)).toBe(true);
    expect((await session(party)).version).toBe(before + 10);
  });

  const view = (await api(host, state)).body.view as { teams: { id: string; money: number }[] };
  expect(view.teams.find((t) => t.id === A.id)!.money).toBe(32 + 35 - 30);
  expect(view.teams.find((t) => t.id === C.id)!.money).toBe(32 + 24 + 10);
});

test('the full bar queue is served out by the helper, ending the round', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);
  const party = await makeParty(host);
  await startGame(host, party);
  const { phones, bar } = await seats(browser, party);
  await startRound(host, 'Flip cup');
  await host.getByRole('button', { name: /enter results/ }).click();
  await payPrizes(host, ['1', '2', '3']);
  await sendDrinks(phones['Block A'], 'Soju Shot', 'Block B');
  await sendDrinks(phones['Block B'], 'Soju Shot', 'Block C');
  await closeShop(host);
  await serveEveryone(host, bar);
  await expect(host.getByText(/Round 2 of \d+: which game/)).toBeVisible();
});
