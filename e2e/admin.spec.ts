import { expect, test, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import { DEMO, signIn, unique } from './helpers';

/** Creates a confirmed guest through the public API and returns their invitation code. */
async function newConfirmedGuest(request: APIRequestContext): Promise<{ code: string; name: string }> {
  const form = await (await request.get('/api/rsvp/form')).json();
  const answers = Object.fromEntries(
    form.questions.filter((q: { required: boolean }) => q.required).map((q: { id: string; options: string[] }) => [q.id, q.options[0] ?? 'Yes']),
  );
  const name = `Door Guest ${unique()}`;
  const res = await request.post('/api/rsvp', {
    data: { fullName: name, email: `door.${unique()}@example.com`, response: 'ATTENDING', companions: [], answers },
  });
  expect(res.status()).toBe(201);
  return { code: (await res.json()).invitationCode, name };
}

test('admin signs in with Enter and sees the dashboard', async ({ page }) => {
  await signIn(page, DEMO.admin);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Total Invitations')).toBeVisible();
});

test('wrong password shows an error and stays on the login page', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(DEMO.admin);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/do not match/i);
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('check-in staff can check a guest in once by invitation code', async ({ page, request }) => {
  const guest = await newConfirmedGuest(request);
  await signIn(page, DEMO.staff);
  await expect(page).toHaveURL(/\/admin\/check-in/);

  await page.getByRole('tab', { name: 'Enter code' }).click();
  await page.getByLabel('Invitation code').fill(guest.code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('heading', { name: 'Valid Invitation' })).toBeVisible();
  await expect(page.getByText(guest.name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^check in/i }).click();
  await expect(page.getByRole('heading', { name: /check-in complete/i })).toBeVisible();

  await page.getByRole('button', { name: /scan next guest/i }).click();
  await page.getByRole('tab', { name: 'Enter code' }).click();
  await page.getByLabel('Invitation code').fill(guest.code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('heading', { name: 'Already Checked In' })).toBeVisible();
});

test('staff cannot open admin pages', async ({ page }) => {
  await signIn(page, DEMO.staff);
  await page.goto('/admin/guests');
  await expect(page).toHaveURL(/\/admin\/check-in/);
});

test('a guest photo uploaded from the QR page appears in the moderation queue', async ({ page, browser }) => {
  const admin = await browser.newPage();
  await signIn(admin, DEMO.admin);
  const settings = await (await admin.request.get('/api/admin/settings')).json();

  const tag = `E2E uploader ${unique()}`;
  const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#0B3D35' } }).png().toBuffer();
  await page.goto(`/memories/upload/${settings.uploadToken}`);
  await expect(page.getByText('Capture the Celebration')).toBeVisible();
  // "Choose from my photos" puts the file into My shots on the phone; nothing is sent yet.
  await page.getByTestId('picker-input').setInputFiles({ name: 'party.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('list', { name: 'My shots' })).toBeVisible();
  const select = page.getByRole('checkbox', { name: 'Select photo 1' });
  if (!(await select.isChecked())) await select.check();
  await page.getByLabel('Your name').fill(tag);
  await page.getByRole('button', { name: /Share selected \(1\)/ }).click();
  await expect(page.getByText(/Thank you for helping us capture this beautiful celebration/)).toBeVisible();

  await admin.goto('/admin/guest-photos');
  await expect(admin.getByRole('checkbox', { name: `Select photo from ${tag}` })).toBeVisible();
});
