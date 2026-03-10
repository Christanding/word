import { test, expect } from "@playwright/test";

test.describe("Auth Flow", () => {
  test("should redirect to login from root", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should show login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText("Vocab Study");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByText("Default credentials (dev only):")).toHaveCount(0);
  });

  test("should login with correct credentials", async ({ page }) => {
    await page.goto("/login");
    
    // Fill login form
    await page.fill('input[type="email"]', "admin@example.com");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    
    // Should redirect to app
    await page.waitForURL(/.*app/);
    await expect(page).toHaveURL(/.*app/);
  });

  test("should show error with wrong credentials", async ({ page }) => {
    await page.goto("/login");
    
    // Fill wrong credentials
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    
    // Should show error
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/.*login/);
  });

  test("should allow open registration and redirect into app", async ({ page }) => {
    const uniqueEmail = `reader-${Date.now()}@example.com`;

    await page.goto("/register");
    await expect(page.locator("h1")).toHaveText("Create Account");
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[name="password"]', "ReaderPass@2026");
    await page.fill('input[name="confirmPassword"]', "ReaderPass@2026");
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*app/);
    await expect(page).toHaveURL(/.*app/);
  });

  test("should protect /app route", async ({ page }) => {
    // Try to access /app directly without login
    await page.goto("/app");
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });
});
