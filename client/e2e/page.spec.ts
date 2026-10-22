import { expect, test } from "@playwright/test";

test("the page loads and fits the screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "tsoa-gui" })).toBeVisible();

  // A page that scrolls sideways has not fitted the screen it is on.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
