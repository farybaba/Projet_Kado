import { Page } from '@playwright/test';

export async function mockBeneficiaryAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('access_token', 'e2e_test_token');
  });
}
