import { expect, type Page } from '@playwright/test';

/** Demo accounts created by the seed (SEED_DEMO=true). Test data for local development only. */
export const DEMO = {
  admin: 'admin@demo.local',
  staff: 'staff@demo.local',
  password: 'Celebrate70!Demo',
};

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

export const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
