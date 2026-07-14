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

test('a real server trust page renders', async ({ page }) => {
  const resp = await page.goto('/server/ac-inference-sh-mcp');
  expect(resp?.status()).toBeLessThan(400);
  // the slug appears somewhere on its own page
  await expect(page.locator('body')).toContainText(/ac-inference-sh-mcp|inference/i);
});

test('unknown server slug is a clean 404, not a crash', async ({ page }) => {
  const resp = await page.goto('/server/this-slug-does-not-exist-xyz');
  // Next renders the not-found UI; must not be a 500 / error boundary
  expect(resp?.status()).not.toBe(500);
  await expect(page.locator('body')).not.toContainText(/Application error/i);
});
