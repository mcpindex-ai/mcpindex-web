import { test, expect } from '@playwright/test';

// The core discovery user flow: land → search → open a real server's trust page.
// Resilient assertions (title / heading / URL / no error boundary), NOT exact copy, so a content
// refresh never reds the suite.

test('home page loads without an error boundary', async ({ page }) => {
  const resp = await page.goto('/');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/mcpindex/i);
  await expect(page.locator('body')).not.toContainText(/Application error|unhandledRejection/i);
});

test('search returns results for a real query', async ({ page }) => {
  await page.goto('/search?q=github');
  // the search page renders result links to /server/<slug>
  await expect(page.locator('a[href^="/server/"]').first()).toBeVisible();
});

test('search → open a real result renders its trust page (no hardcoded slug)', async ({ page }) => {
  // derive a live slug from search results instead of hardcoding one that a data refresh could drop
  await page.goto('/search?q=github');
  const first = page.locator('a[href^="/server/"]').first();
  await expect(first).toBeVisible();
  const href = await first.getAttribute('href');
  const resp = await page.goto(href!);
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toContainText(/Application error/i);
});

test('unknown server slug is a clean 404, not a crash', async ({ page }) => {
  const resp = await page.goto('/server/this-slug-does-not-exist-xyz');
  // the route calls notFound() → a real HTTP 404, not a soft-404 or a 500 crash
  expect(resp?.status()).toBe(404);
  await expect(page.locator('body')).not.toContainText(/Application error/i);
});
