import { test, expect } from '@playwright/test';

// The ownership challenge token is a bearer credential for claiming a listing. It must not
// sit in the rendered DOM as plain text, because everything that reads rendered text -
// session recorders, screen shares, support tooling, browser extensions, pasted screenshots -
// would capture it. TokenField withholds it until the owner clicks reveal.
//
// This drives the REAL wizard (components/OwnerVerifyWizard.tsx) with the challenge API
// stubbed, so it proves the rendered output rather than the intent.

const FAKE_KEY = 'mcpk_e2eFakeKeyNotARealCredential';
const FAKE_TOKEN = 'e2e-challenge-token-0d5c1f9a4b7e2c86';
const ROTATED_TOKEN = 'e2e-rotated-token-71b3e0a9c4d6f285';

async function gotoStepTwo(page: import('@playwright/test').Page) {
  await page.route('**/api/owner/challenge', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: FAKE_TOKEN,
        well_known_path: '/.well-known/mcpindex-challenge',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }),
    }),
  );

  // Seed the session key the same way a completed login would, so the wizard mounts past step 0.
  await page.addInitScript(
    ([k, v]) => sessionStorage.setItem(k, v),
    ['mcpindex_owner_wizard_key', FAKE_KEY] as const,
  );

  await page.goto('/claim');
  // A restored session key does not by itself advance the wizard - step 0 still renders and
  // waits for an explicit Continue.
  await page.getByRole('button', { name: 'Continue →' }).click();
  // Step 1 defaults to the registry SEARCH ui; the plain server_id input only exists behind
  // the manual fallback, so drive that rather than assuming the field is on screen.
  await page.getByRole('button', { name: 'enter the registry id manually' }).click();
  await page.getByPlaceholder('io.github.').first().fill('io.github.e2e/test-server');
  await page.getByRole('button', { name: 'Request challenge' }).click();
  await expect(page.getByText('challenge token')).toBeVisible();
}

// Assert against serialized markup, not textContent. `toContainText` reads text nodes only,
// so a refactor adding title={value} / aria-label={value} / <input value> would leak the token
// and this spec would still pass green - the exact failure it exists to catch. page.content()
// also covers <head> and the Flight payload.
async function expectAbsentFromMarkup(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => (await page.content()).includes(FAKE_TOKEN), {
      message: 'token must not appear anywhere in the serialized page',
    })
    .toBe(false);
}

async function expectPresentInMarkup(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.content()).includes(FAKE_TOKEN)).toBe(true);
}

test('challenge token is not in the DOM until revealed', async ({ page }) => {
  await gotoStepTwo(page);

  // The security assertion: the credential is absent from the rendered page.
  await expectAbsentFromMarkup(page);
  await expect(page.getByText('•'.repeat(32))).toBeVisible();

  // And it is genuinely reachable when the owner asks for it.
  await page.getByRole('button', { name: 'Reveal token' }).click();
  await expectPresentInMarkup(page);

  // Hiding puts it back out of the DOM.
  await page.getByRole('button', { name: 'Hide token' }).click();
  await expectAbsentFromMarkup(page);
});

test('rotating the token drops a prior reveal', async ({ page }) => {
  // The realistic exposure: reveal, the 15-minute TTL lapses mid-screen-share, the owner
  // clicks "new challenge" - and the freshly issued credential must not render in the clear.
  // Step is already 2, so nothing unmounts unless TokenField is keyed on the token.
  await gotoStepTwo(page);
  await page.getByRole('button', { name: 'Reveal token' }).click();
  await expectPresentInMarkup(page);

  await page.unroute('**/api/owner/challenge');
  await page.route('**/api/owner/challenge', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: ROTATED_TOKEN,
        well_known_path: '/.well-known/mcpindex-challenge',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }),
    }),
  );
  await page.getByRole('button', { name: 'new challenge' }).click();

  await expect(page.getByText('•'.repeat(32))).toBeVisible();
  await expect
    .poll(async () => (await page.content()).includes(ROTATED_TOKEN), {
      message: 'a rotated token must not inherit the previous reveal',
    })
    .toBe(false);
});

test('the well-known URL stays visible - it is public, not a secret', async ({ page }) => {
  await gotoStepTwo(page);
  // Masking this too would be cargo-culting: the path is a fixed public constant, documented
  // in prose on this same page. Only the token is withheld.
  await expect(page.locator('body')).toContainText('/.well-known/mcpindex-challenge');
});
