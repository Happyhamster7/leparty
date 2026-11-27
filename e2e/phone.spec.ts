import { devices, expect, test } from '@playwright/test';
import { device, makeParty, payPrizes, signInAsHost, startGame, startRound } from './helpers';

/**
 * Nothing may be wider than the screen. A page that is makes a phone
 * zoom the whole thing out, which is how the game first looked on a
 * real phone. Wide tables are allowed to scroll inside a .scroller.
 */
test('every screen fits the narrowest phone, in both themes', async ({ browser }) => {
  const host = await device(browser);
  await signInAsHost(host);

  for (const theme of ['jail', 'plain']) {
    const party = await makeParty(host, { blocks: 8, perBlock: 2, theme });
    await startGame(host, party);
    await startRound(host, 'Flip cup');
    await host.getByRole('button', { name: /enter results/ }).click();
    await payPrizes(host, ['1', '2', '3', '4', '5', '6', '7', '8']);

    const small = devices['iPhone SE'];
    const hostPhone = await device(browser, small);
    await hostPhone.context().addCookies(await host.context().cookies());
    const guestPhone = await device(browser, small);
    const pages: [string, typeof hostPhone, string][] = [
      ['team phone', guestPhone, `/b/${party.blocks[0].join_token}`],
      ['bar', guestPhone, `/bar/${party.barToken}`],
      ['TV', guestPhone, `/tv/${party.displayToken}`],
      ['signup', guestPhone, '/signup'],
      ['host game console', hostPhone, `/host/${party.eventId}/game`],
      ['host party page', hostPhone, `/host/${party.eventId}`],
      ['host check-in', hostPhone, `/host/${party.eventId}/checkin`],
    ];
    for (const [name, page, path] of pages) {
      await page.goto(path);
      if (name === 'team phone') {
        // Open the widest thing a phone shows: the shop with a drink selected and eight teams to send to.
        await page.locator('.g-item', { hasText: 'Spirit' }).first().click();
        await expect(page.locator('.g-buy')).toBeVisible();
      } else {
        await page.waitForLoadState('networkidle');
      }
      const m = await page.evaluate(() => {
        const w = window.innerWidth;
        const past = [...document.querySelectorAll('body *')].filter((el) => {
          if (el.closest('.scroller')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > w + 1 || r.left < -1);
        });
        return { screen: w, page: document.documentElement.scrollWidth, past: past.slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`) };
      });
      expect(m.page, `${theme}: ${name} is wider than the screen`).toBeLessThanOrEqual(m.screen + 1);
      expect(m.past, `${theme}: ${name} has elements past the edge`).toEqual([]);
    }
  }
});
