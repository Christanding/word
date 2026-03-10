import { test, expect } from "@playwright/test";

test.describe("Sample E2E Test", () => {
  test("should load home page", async ({ page }) => {
    await page.goto("/");
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });

  test("should load login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText("Vocab Study");
  });
});
