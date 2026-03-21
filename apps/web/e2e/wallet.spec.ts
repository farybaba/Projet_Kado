import { test, expect } from '@playwright/test';

test.describe('Wallet bénéficiaire', () => {
  test('token invalide — redirige vers /app/login', async ({ page }) => {
    // Injecter un token bidon dans le localStorage avant la navigation
    await page.goto('/app/login'); // page vide pour pouvoir appeler evaluate
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'mock_token');
    });

    // Aller sur le wallet — le guard doit rejeter le token invalide et rediriger
    await page.goto('/app/wallet');

    await expect(page).toHaveURL(/\/app\/login/, { timeout: 10_000 });
  });

  test('sans token — redirige vers /app/login', async ({ page }) => {
    await page.goto('/app/wallet');
    await expect(page).toHaveURL(/\/app\/login/, { timeout: 10_000 });
  });

  test('wallet vide — affiche l\'état zéro bon', async ({ page }) => {
    // Intercepter l'appel API pour renvoyer un tableau vide
    await page.route('**/api/v1/vouchers/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Injecter un token (l'appel API est mocké donc le token n'est pas vérifié côté serveur)
    await page.goto('/app/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'e2e_mock_valid_token');
    });

    await page.goto('/app/wallet');

    // L'état vide doit être affiché — le wallet page affiche "Aucun bon disponible"
    // quand actifs.length === 0
    await expect(
      page.getByText(/Aucun bon disponible/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
