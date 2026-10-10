import { expect, signUp, test } from '../fixtures.ts';

// Acceptance checks for docs/antigravity/REVIEW-02 (UI must-fix items that a browser can verify).

test('Hồ sơ hiện UID 8 số, không bao giờ hiện ID nội bộ (REVIEW-02 #1)', async ({ page }) => {
  const acc = await signUp(page);
  await page.goto('/settings');
  await expect(page.locator('body')).toContainText(acc.uid);
  await expect(page.locator('body')).not.toContainText(acc.id);
});

test('/wallet chuyển sang /assets (REVIEW-02 #4)', async ({ page }) => {
  await signUp(page);
  await page.goto('/wallet');
  await expect(page).toHaveURL(/\/assets$/);
});
