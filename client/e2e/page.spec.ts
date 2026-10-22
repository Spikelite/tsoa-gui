import { expect, test } from "@playwright/test";

import { system } from "../src/test/system";

test("the page draws the system and fits the screen", async ({ page }) => {
  // The preview server has no API, so the event stream is answered here with
  // one model, as the server would open it.
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(system)}\n\n`,
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "tsoa-gui" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Battery" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Shore power" })).toBeVisible();
  await expect(page.locator("[data-flow]")).toHaveCount(system.flows.length);

  // A page that scrolls sideways has not fitted the screen it is on.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the Sci-Fi FOF skin draws the system and fits the screen", async ({ page }) => {
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(system)}\n\n`,
    }),
  );
  await page.goto("/?skin=sci-fi-fof");
  await expect(page.getByRole("meter", { name: "State of charge" })).toBeVisible();
  await expect(page.getByRole("region", { name: "AC loads" })).toBeVisible();
  await expect(page.locator("[data-flow]")).toHaveCount(system.flows.length);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
