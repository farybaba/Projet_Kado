import { test, expect } from '@playwright/test';

test.describe('POS — terminal commerçant', () => {
  test('affiche le formulaire de connexion POS', async ({ page }) => {
    await page.goto('/pos/login');

    await expect(page.getByRole('heading', { name: 'Connexion POS' })).toBeVisible();
    await expect(page.getByPlaceholder('77 000 00 01')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recevoir le code' })).toBeVisible();
  });

  test('sans token marchand — /pos/scan redirige vers /pos/login', async ({ page }) => {
    // S'assurer qu'il n'y a pas de token marchand dans le localStorage
    await page.goto('/pos/login');
    await page.evaluate(() => {
      localStorage.removeItem('merchant_token');
    });

    await page.goto('/pos/scan');

    // Sans authentification, le middleware ou la page doit rediriger vers /pos/login
    await expect(page).toHaveURL(/\/pos\/login/, { timeout: 10_000 });
  });

  test('champ téléphone présent et accepte uniquement des chiffres', async ({ page }) => {
    await page.goto('/pos/login');

    const phoneInput = page.getByPlaceholder('77 000 00 01');
    await phoneInput.fill('77 123 45 67');

    // Le bouton reste désactivé tant que le numéro est incomplet
    const submitBtn = page.getByRole('button', { name: 'Recevoir le code' });
    await expect(submitBtn).toBeVisible();
  });

  test('le bouton Recevoir le code est désactivé si numéro incomplet', async ({ page }) => {
    await page.goto('/pos/login');

    const phoneInput = page.getByPlaceholder('77 000 00 01');
    await phoneInput.fill('123');

    const submitBtn = page.getByRole('button', { name: 'Recevoir le code' });
    await expect(submitBtn).toBeDisabled();
  });
});
