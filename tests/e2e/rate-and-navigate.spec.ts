import { test, expect } from '@playwright/test';

test('list opens without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('Search')).toBeVisible();
});

test('mobile filter bar stays compact until filters are requested', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const showFilters = page.getByRole('button', { name: 'Show filters' });
  await expect(showFilters).toBeVisible();
  await expect(page.getByRole('button', { name: 'All statuses' })).toBeHidden();

  await showFilters.click();
  await expect(page.getByRole('button', { name: 'Hide filters' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All statuses' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Triage/ })).toBeVisible();

  await page.getByRole('button', { name: 'Hide filters' }).click();
  await expect(page.getByRole('button', { name: 'All statuses' })).toBeHidden();
});
