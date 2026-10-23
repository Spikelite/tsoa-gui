import { expect, test } from "@playwright/test";

import { withIdleLinks } from "../src/skins/fof/links";
import { throughHub } from "../src/skins/fof/throughHub";
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
  // This skin draws power from a supply to the AC loads through the inverter/charger, and joins
  // every part to the rest, with an idle conduit where a link carries nothing.
  await expect(page.locator("[data-flow]")).toHaveCount(withIdleLinks(throughHub(system.flows), system).length);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the battery opens its own page inside Sci-Fi FOF's frame, and the page fits the screen", async ({ page }) => {
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(system)}\n\n`,
    }),
  );
  await page.goto("/?skin=sci-fi-fof");
  await page.getByRole("meter", { name: "State of charge" }).click();
  await expect(page).toHaveURL(/part=battery/);
  await expect(page.getByRole("list", { name: "Cells" }).getByRole("listitem")).toHaveCount(system.battery!.cells.length);
  await expect(page.getByRole("heading", { level: 1, name: "tsoa-gui" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.goBack();
  await expect(page.getByRole("meter", { name: "State of charge" })).toBeVisible();
});

test("a Sci-Fi FOF conduit going idle carries the change along it with its waves", async ({ page }) => {
  // Solar producing, then, when the page reconnects, not.
  const idle = { ...system, flows: system.flows.filter((flow) => flow.source !== "solar") };
  let answered = 0;
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: ${answered === 0 ? 1500 : 60000}\nevent: model\ndata: ${JSON.stringify(answered++ === 0 ? system : idle)}\n\n`,
    }),
  );
  await page.goto("/?skin=sci-fi-fof");
  const solar = page.locator("[data-flow='solar-dc_bus']");
  await expect(solar).not.toHaveClass(/fof-conduit-idle|fof-conduit-carrying/);
  await expect(solar).toHaveClass(/fof-conduit-carrying/, { timeout: 10_000 });

  // Its active stretches are a dash pattern rolling along it on the page's clock, as its waves do.
  const carried = await solar.locator(".fof-conduit-carried").evaluate((path) => ({
    dashes: getComputedStyle(path).strokeDasharray,
    started: path.getAnimations().map((animation) => animation.startTime),
  }));
  expect(carried.dashes).not.toBe("none");
  expect(carried.started).toEqual([0]);
  expect(await solar.locator(".fof-conduit-wave").count()).toBeGreaterThan(0);
});
