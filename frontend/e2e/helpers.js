import { expect } from '@playwright/test';

export const PASSWORD = 'Correct-Horse-Battery-9';
export const uniq = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 1e4)}`;

export async function register(page, name) {
  const email = `${uniq(name.toLowerCase().replace(/\W/g, ''))}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('link', { name: '+ Report' })).toBeVisible();
  return email;
}

export async function report(page, type, { title, description, category, area, questions = [] }) {
  await page.goto(`/report/${type}`);
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Category').selectOption(category);
  await page.getByLabel('Description').fill(description);
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('.leaflet-container').click({ position: { x: 200, y: 160 } });
  await page.getByLabel(/Area name/).fill(area);
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click(); // photos are optional
  if (type === 'found') {
    for (const [i, q] of questions.entries()) {
      if (i > 0) await page.getByRole('button', { name: '+ Add question' }).click();
      await page.getByLabel(`Question ${i + 1}`).fill(q);
    }
    await page.getByRole('button', { name: /Continue/ }).click();
  }
  await page.getByRole('button', { name: 'Publish report' }).click();
  await expect(page).toHaveURL(/\/items\/[a-f0-9]{24}$/);
  return page.url().split('/').pop();
}
