import { test, expect } from '@playwright/test';

test('list opens without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('Suchen')).toBeVisible();
});
