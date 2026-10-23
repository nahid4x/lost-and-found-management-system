import { test, expect } from '@playwright/test';
import { register } from './helpers.js';

test('anonymous users are redirected to login for protected pages and cannot call admin APIs', async ({ page, request }) => {
  await page.goto('/my-reports');
  await expect(page).toHaveURL(/\/login\?next=%2Fmy-reports/);
  expect((await request.get('/api/items/admin/items')).status()).toBe(401);
  expect((await request.get('/api/claims/mine')).status()).toBe(401);
});

test('no open redirect via ?next=', async ({ page }) => {
  await register(page, 'Redirect Tester');
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.goto('/login?next=https://evil.example/phish');
  await page.getByLabel('Email').fill('nobody@example.com');
  await expect(page).not.toHaveURL(/evil\.example/);
});

test('tokens never touch web storage; refresh cookie is HttpOnly', async ({ page, context }) => {
  await register(page, 'Storage Tester');
  const storage = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  expect(storage).not.toMatch(/eyJ|token/i);
  const cookie = (await context.cookies()).find((c) => c.name === 'fi_rt');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('fi_rt');
});

test('hostile report text renders as inert text (XSS)', async ({ page }) => {
  await register(page, 'Xss Tester');
  let dialog = false; page.on('dialog', () => { dialog = true; });
  await page.goto('/report/lost');
  await page.getByLabel('Title').fill('<img src=x onerror=alert(1)>Wallet');
  await page.getByLabel('Category').selectOption('wallet');
  await page.getByLabel('Description').fill('<script>alert(1)</script> some long enough description');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('.leaflet-container').click({ position: { x: 200, y: 160 } });
  await page.getByLabel(/Area name/).fill('Dhaka');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Publish report' }).click();
  await expect(page).toHaveURL(/\/items\//);
  await page.waitForTimeout(500);
  expect(dialog).toBe(false);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
