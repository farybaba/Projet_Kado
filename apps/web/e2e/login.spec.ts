import { test, expect } from '@playwright/test';

test.describe('Connexion bénéficiaire', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/login');
  });

  test('affiche le formulaire de saisie du numéro', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect(page.getByPlaceholder('77 000 00 00')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recevoir le code' })).toBeVisible();
  });

  test('passe à l\'étape OTP après saisie du numéro', async ({ page }) => {
    await page.getByPlaceholder('77 000 00 00').fill('771234567');
    await page.getByRole('button', { name: 'Recevoir le code' }).click();

    // Le titre de l'étape OTP doit apparaître
    await expect(page.getByRole('heading', { name: 'Code de vérification' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('OTP invalide — affiche l\'erreur et le lien Renvoyer', async ({ page }) => {
    // Étape 1 : saisie du numéro
    await page.getByPlaceholder('77 000 00 00').fill('771234567');
    await page.getByRole('button', { name: 'Recevoir le code' }).click();

    await expect(page.getByRole('heading', { name: 'Code de vérification' })).toBeVisible({
      timeout: 10_000,
    });

    // Étape 2 : saisie du code OTP invalide
    const otpInputs = page.getByRole('group', { name: 'Code à 6 chiffres' }).locator('input');
    const digits = '000000'.split('');
    for (let i = 0; i < digits.length; i++) {
      await otpInputs.nth(i).fill(digits[i]);
    }

    // Le formulaire se soumet automatiquement — attendre le message d'erreur
    await expect(
      page.getByRole('alert').filter({ hasText: /Code incorrect ou expiré/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('le bouton Renvoyer le code apparaît après erreur ou expiration du compte à rebours', async ({ page }) => {
    await page.getByPlaceholder('77 000 00 00').fill('771234567');
    await page.getByRole('button', { name: 'Recevoir le code' }).click();

    await expect(page.getByRole('heading', { name: 'Code de vérification' })).toBeVisible({
      timeout: 10_000,
    });

    // Le bouton "Renvoyer le code" peut être visible directement (en cas d'erreur)
    // ou après le compte à rebours. On attend au plus 65s (countdown = 60s).
    // Pour le test E2E on vérifie simplement sa présence dans le DOM.
    await expect(
      page.getByRole('button', { name: /Renvoyer le code/i }),
    ).toBeVisible({ timeout: 65_000 });
  });

  test('le bouton Retour repasse à l\'étape saisie du numéro', async ({ page }) => {
    await page.getByPlaceholder('77 000 00 00').fill('771234567');
    await page.getByRole('button', { name: 'Recevoir le code' }).click();

    await expect(page.getByRole('heading', { name: 'Code de vérification' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /Retour/i }).click();

    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect(page.getByPlaceholder('77 000 00 00')).toBeVisible();
  });
});
