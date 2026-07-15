import { test, expect } from '@playwright/test';

// The product-walkthrough guides are only self-maintaining if their LIVE EMBEDS
// actually render the real product components (a screenshot-free design fails
// silently if an embed breaks). These checks assert behaviour, not copy, so a
// content refresh never reds the suite: real components mounted, the host-picker
// switches, the funnel is ordered install-first, and the Next CTA chains.

const ERR = /Application error|Runtime Error|Unhandled|Build Error|Server Error/i;

test('guides index groups walkthroughs and orders install-first (funnel, not A–Z)', async ({ page }) => {
  const resp = await page.goto('/guides');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.getByText('Product walkthroughs')).toBeVisible();

  // Install must sit ABOVE the later walkthroughs — proves the `order` sort, not
  // alphabetical (which would bury the flagship activation guide behind "evaluate"
  // and "read-your-gate-activity").
  const install = page.locator('a[href="/guides/install-the-gate-first-hold"]').first();
  const gateActivity = page.locator('a[href="/guides/read-your-gate-activity"]').first();
  await expect(install).toBeVisible();
  await expect(gateActivity).toBeVisible();
  const iBox = await install.boundingBox();
  const gBox = await gateActivity.boundingBox();
  expect(iBox!.y).toBeLessThan(gBox!.y);
});

test('install walkthrough renders its real embeds (install cmd, wired hosts, live demo)', async ({ page }) => {
  const resp = await page.goto('/guides/install-the-gate-first-hold');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(ERR);

  // install-command embed = the real CopyField with the single-sourced curl command
  await expect(page.locator('code', { hasText: 'install.sh' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /copy/i }).first()).toBeVisible();

  // supported-hosts embed = GATE_WIRING_HOSTS chips (stable product vocabulary)
  await expect(page.getByText('Claude Code', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Windsurf', { exact: true }).first()).toBeVisible();

  // drift-gate-demo embed = the REAL interactive homepage component (its posture
  // buttons prove the component mounted, not a placeholder)
  await expect(page.getByRole('button', { name: 'Guard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Strict' })).toBeVisible();

  // Next-CTA chains the funnel to the evaluate guide
  await expect(page.locator('a[href="/guides/evaluate-before-install"]')).toBeVisible();
});

test('evaluate walkthrough: host-picker switches the shown command on click', async ({ page }) => {
  const resp = await page.goto('/guides/evaluate-before-install');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toContainText(ERR);

  // ScanTool embed mounted (its paste box)
  await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();

  // Default host (Claude Code) shows the CLI add command…
  await expect(page.getByText('claude mcp add', { exact: false })).toBeVisible();

  // …click Cursor and the shown command becomes the config JSON block.
  // The picker is a group of aria-pressed toggle buttons (not a tablist).
  const cursorBtn = page.getByRole('button', { name: 'Cursor' });
  await expect(cursorBtn).toBeVisible();
  await cursorBtn.click();
  await expect(cursorBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('"mcpServers"', { exact: false })).toBeVisible();
  await expect(page.getByText('claude mcp add', { exact: false })).toHaveCount(0);
});

test('api-key walkthrough renders the login-command embed (single-sourced SDK cmd)', async ({ page }) => {
  const resp = await page.goto('/guides/api-key-cli-login');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toContainText(ERR);
  // login-command embed = a real CopyField with the npm SDK login one-liner
  await expect(page.locator('code', { hasText: '@mcp-index/sdk login' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /copy/i }).first()).toBeVisible();
  // a fallback ("[embed: unknown key ...]") must never render
  await expect(page.locator('body')).not.toContainText(/embed: unknown key/i);
});

test('gate-activity walkthrough renders and deep-links to receipts', async ({ page }) => {
  const resp = await page.goto('/guides/read-your-gate-activity');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(ERR);
  await expect(page.locator('a[href="/receipts"]').first()).toBeVisible();
});
