// Full journey with two real browser contexts: finder + owner, including live chat.
import { test, expect } from '@playwright/test';
import { register, report } from './helpers.js';

test('lost -> found -> match -> claim -> approve -> chat -> returned', async ({ browser }) => {
  const finder = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  const owner = await (await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['geolocation'] })).newPage();
  await register(finder, 'Faria Finder');
  await register(owner, 'Omar Owner');

  const foundId = await report(finder, 'found', { title: 'Black Samsung phone', description: 'Black Samsung phone with a cracked screen and red case found near the library.', category: 'electronics', area: 'Ashulia, Dhaka', questions: ['What is the lock-screen wallpaper?'] });
  const lostId = await report(owner, 'lost', { title: 'Lost black Samsung phone', description: 'Black Samsung phone with a cracked screen and red case, lost around the library.', category: 'electronics', area: 'Ashulia, Dhaka' });

  // AI match appears for the owner with an explainable score
  await owner.goto(`/items/${lostId}`);
  await expect(owner.getByText('AI match suggestions')).toBeVisible();
  await expect(owner.getByRole('img', { name: /percent match/ })).toBeVisible({ timeout: 15_000 });
  await owner.getByRole('button', { name: 'Why?' }).first().click();
  await expect(owner.getByText(/Description similarity/)).toBeVisible();

  // exact location is NOT visible before approval
  await owner.goto(`/items/${foundId}`);
  await expect(owner.getByText('Exact location & handover')).toHaveCount(0);
  await owner.getByRole('button', { name: /This is mine/ }).click();
  await owner.getByLabel('What is the lock-screen wallpaper?').fill('A blue mountain');
  await owner.getByRole('button', { name: 'Submit claim' }).click();
  await expect(owner).toHaveURL(/\/claims$/);

  // finder reviews and approves
  await finder.goto('/claims');
  await expect(finder.getByText('A blue mountain')).toBeVisible({ timeout: 15_000 });
  await finder.getByRole('button', { name: /Approve/ }).first().click();
  await finder.getByRole('button', { name: 'Approve', exact: true }).click();

  // private info unlocked for the owner; chat opens live
  await owner.goto(`/items/${foundId}`);
  await expect(owner.getByText('Exact location & handover')).toBeVisible({ timeout: 15_000 });
  await owner.goto('/messages');
  await finder.goto('/messages');
  await owner.getByLabel('Message').fill('Hi! Thank you so much for finding it.');
  await owner.getByRole('button', { name: 'Send' }).click();
  await expect(finder.getByText('Thank you so much for finding it.')).toBeVisible({ timeout: 5_000 });

  // handover + return
  await owner.goto('/claims');
  await owner.getByRole('button', { name: 'Mark as returned' }).click();
  await owner.goto(`/items/${foundId}`);
  await expect(owner.getByText('closed', { exact: true }).first()).toBeVisible();
});
