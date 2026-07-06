import { expect, test } from "@playwright/test";

test("desktop smoke test", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Tradeify Payout & Risk Utility Calculator/i })).toBeVisible();
  await expect(page.getByText(/Eligibility Results/i)).toBeVisible();
  await page.getByLabel(/Current balance/i).fill("53400");
  await expect(page.getByText(/Safe max request/i)).toBeVisible();
});

test("mobile smoke test", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Theme/i })).toBeVisible();
  await page.getByRole("button", { name: /Lightning \/ First Payout/i }).click();
  await expect(page.getByText(/Current payout #/i)).toBeVisible();
});
