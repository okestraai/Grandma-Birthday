import { expect, test } from '@playwright/test';

test('the home page fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: /menu/i }).click();
  await expect(page.getByRole('link', { name: /rsvp/i }).first()).toBeVisible();
});
