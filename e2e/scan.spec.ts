import { test, expect } from '@playwright/test';

// The two interactive "act on a server" surfaces render and are usable.

test('scan page renders the scan tool', async ({ page }) => {
  const resp = await page.goto('/scan');
  expect(resp?.status()).toBeLessThan(400);
  // a textarea/input to paste a config + a control to run it
  await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();
});

test('screen demo page renders', async ({ page }) => {
  const resp = await page.goto('/screen');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toContainText(/Application error/i);
});

test('badge embed endpoint serves an SVG for a real server', async ({ request }) => {
  const resp = await request.get('/api/v1/badge/ac-inference-sh-mcp');
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toContain('image/svg+xml');
  expect(await resp.text()).toMatch(/^<svg/);
});
