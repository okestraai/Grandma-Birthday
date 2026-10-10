import { expect, test } from '@playwright/test';
import { unique } from './helpers';

test('home page shows the celebrant, the 70 and SEO metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Margaret');
  await expect(page).toHaveTitle(/Margaret/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(jsonLd.join(' ')).toContain('"Event"');
});

test('a guest can RSVP and open their digital invitation with a QR code', async ({ page }) => {
  const email = `e2e.${unique()}@example.com`;
  await page.goto('/rsvp');

  await page.getByLabel('Full name').first().fill('Playwright Guest');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('How do you know the family?').selectOption({ label: 'Friends' });
  await page.getByRole('button', { name: /continue/i }).click();

  await page.getByText('Joyfully accepts').click();
  await page.getByRole('button', { name: /continue/i }).click();

  await expect(page.getByRole('heading', { name: 'Your preferences' })).toBeVisible();
  await page.getByLabel(/thanksgiving service/i).selectOption('Yes');
  // The optional birthday message sits inside the RSVP form and is saved as a testimonial.
  await page.getByLabel('Your message').fill('Happy seventieth birthday! Thank you for every Sunday lunch.');
  await page.getByLabel('How you know the celebrant').fill('Family friend');
  await page.screenshot({ path: 'test-results/rsvp-preferences-step.png', fullPage: true });
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText('Happy seventieth birthday! Thank you for every Sunday lunch.')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm my attendance' }).click();
  await expect(page.getByText(/on the guest list/i)).toBeVisible();
  await expect(page.getByText(/birthday message has been received/i)).toBeVisible();

  await page.getByRole('link', { name: 'View Digital Invitation' }).click();
  await expect(page.getByText('Playwright Guest')).toBeVisible();
  await expect(page.getByRole('img', { name: /qr/i })).toBeVisible();
  await expect(page.getByText(/BP70-[A-Z0-9]{6}/).first()).toBeVisible();
});

test('a guest can leave a birthday message for review', async ({ page }) => {
  await page.goto('/testimonials');
  await page.getByLabel('Your name').fill('Playwright Friend');
  await page.getByLabel('Your message').fill('Happy seventieth birthday! Thank you for everything you have given us.');
  await page.locator('form button[type="submit"]').last().click();
  await expect(page.getByText(/review/i).first()).toBeVisible();
});
