import { expect, test, type Page } from "@playwright/test";

import { withIdleLinks } from "../src/skins/fof/links";
import { throughHub } from "../src/skins/fof/throughHub";
import { system } from "../src/test/system";

/**
 * A stream that stays open, sending each model after the delay beside it. An
 * answered route ends the stream, which the page rightly shows as offline.
 */
async function heldStream(page: Page, ...models: [unknown, number][]) {
  await page.addInitScript((sent) => {
    class HeldOpen extends EventTarget {
      constructor() {
        super();
        for (const [data, delay] of sent) {
          setTimeout(() => this.dispatchEvent(new MessageEvent("model", { data })), delay);
        }
      }
      close() {}
    }
    Object.assign(window, { EventSource: HeldOpen });
  }, models.map(([model, delay]): [string, number] => [JSON.stringify(model), delay]));
}

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
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await page.setViewportSize({ width: 1280, height: 800 });
  // Solar producing, then not.
  const idle = { ...system, flows: system.flows.filter((flow) => flow.source !== "solar") };
  await heldStream(page, [system, 0], [idle, 1500]);
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

test("Sci-Fi FOF's conduits take lanes of their own on a screen where they would run together", async ({ page }) => {
  const withGenerator = { ...system, generator: { status: "normal", ac_input: 2, running: false, power_w: 0, run_time_s: null } };
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(withGenerator)}\n\n`,
    }),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/?skin=sci-fi-fof");
  const conduit = page.locator("[data-flow='generator-inverter_charger'] .fof-conduit-body");
  await expect(conduit).toBeAttached();

  // Measured along their center lines, against the widest a conduit ever gets, whatever each carries now.
  await expect.poll(() => page.evaluate(() => {
    const along = (flow: string) => {
      const path = document.querySelector<SVGPathElement>(`[data-flow='${flow}'] .fof-conduit-body`)!;
      return Array.from({ length: path.getTotalLength() / 2 }, (_, step) => path.getPointAtLength(step * 2));
    };
    const others = along("solar-dc_bus");
    const apart = along("generator-inverter_charger").reduce(
      (least, { x, y }) => Math.min(least, ...others.map((point) => Math.hypot(point.x - x, point.y - y))), Infinity);
    return apart / parseFloat(getComputedStyle(document.querySelector(".fof-diagram")!).fontSize);
  })).toBeGreaterThan(1.8);
});

test("Sci-Fi FOF writes labels and words in capitals and leaves units as they are", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const model = { ...system, battery: {
    ...system.battery!, voltage_v: null, time_left: { toward: "full", seconds: 5760, settled: true },
  } };
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(model)}\n\n`,
    }),
  );
  await page.goto("/?skin=sci-fi-fof");
  const row = (part: string, label: string) => page.locator(`[data-part='${part}'] .fof-row`, { hasText: label });
  // Only innerText shows what the stylesheet does to the case.
  const shown = { useInnerText: true };
  await expect(row("grid", "Frequency").locator("dt")).toHaveText("FREQUENCY", shown);
  await expect(row("grid", "Frequency").locator("dd")).toHaveText("50.01 Hz", shown);
  await expect(row("battery", "Time to full").locator("dd")).toHaveText("1 h 36 min", shown);
  await expect(row("battery", "Voltage").locator("dd")).toHaveText("UNKNOWN", shown);
  await expect(row("inverter_charger", "Mode").locator("dd")).toHaveText("ON", shown);

  await page.goto("/?skin=sci-fi-fof&part=battery");
  await expect(row("battery", "Spread").locator("dd")).toHaveText("20 mV", shown);
});

test("Sci-Fi FOF brings its own font from tsoa-gui, and no other skin loads it", async ({ page }) => {
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(system)}\n\n`,
    }),
  );
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") {
      fonts.push(request.url());
    }
  });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Battery" })).toBeVisible();
  expect(fonts).toEqual([]);

  await page.goto("/?skin=sci-fi-fof");
  await expect.poll(() => page.evaluate(() =>
    [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family))).toEqual(["Antonio"]);
  expect(fonts).toHaveLength(1);
  expect(new URL(fonts[0]!).origin).toBe(new URL(page.url()).origin);
});

test("Sci-Fi FOF colors a name by what the part is, and a status only when it needs attention", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(system)}\n\n`,
    }),
  );
  await page.goto("/?skin=sci-fi-fof");
  const background = (selector: string) => page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor);
  const sand = "rgb(217, 185, 138)";
  expect(await background("[data-part='grid'] .fof-label-block")).toBe(sand);
  expect(await background("[data-part='solar'] .fof-label-block")).toBe(sand);
  expect(await background("[data-part='battery'] .fof-label-block")).toBe("rgb(143, 168, 232)");
  expect(await background("[data-part='ac_loads'] .fof-label-block")).toBe("rgb(121, 184, 176)");
  // The inverter/charger needs attention in the fixture, which takes a cap of its own.
  expect(await background("[data-part='inverter_charger'] .fof-label-block")).toBe("rgb(196, 167, 231)");
  expect(await background("[data-part='inverter_charger'] .fof-label-block .fof-status-words")).toBe("rgb(240, 136, 62)");
  await expect(page.locator("[data-part='grid'] .fof-label-block .fof-status-words")).toHaveCount(0);
});

test("Sci-Fi FOF keeps each reading beside the hub on one line, clear of the next part", async ({ page }) => {
  await heldStream(page, [{ ...system, inverter_charger: { ...system.inverter_charger!, ac_inputs: 2 } }, 0]);
  for (const [width, height] of [[1093, 614], [1280, 800], [1366, 768], [1600, 900], [1707, 960], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?skin=sci-fi-fof");
    await expect(page.locator(".fof-hub-readings")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>(".fof-hub-readings .fof-row")];
      const readings = document.querySelector(".fof-hub-readings")!.getBoundingClientRect();
      const name = document.querySelector("[data-part='ac_loads'] .fof-label-block")!.getBoundingClientRect();
      return {
        words: rows.some((row) => row.textContent!.includes("Input in use")),
        wrapped: rows.filter((row) => row.offsetHeight > 1.5 * parseFloat(getComputedStyle(row).lineHeight)).map((row) => row.textContent),
        clear: readings.bottom < name.top || readings.right < name.left,
      };
    });
    expect(measured.words, `${width} x ${height}`).toBe(true);
    expect(measured.wrapped, `${width} x ${height}`).toEqual([]);
    expect(measured.clear, `${width} x ${height}`).toBe(true);
  }
});

test("Sci-Fi FOF's frame holds the whole overview on screens of any size, with its menu inside the screen", async ({ page }) => {
  await page.route("**/api/system/events", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `retry: 60000\nevent: model\ndata: ${JSON.stringify(system)}\n\n`,
    }),
  );
  for (const [width, height] of [[800, 480], [1024, 600], [1280, 800], [1366, 768], [1920, 1080], [2560, 1080], [3840, 2160]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?skin=sci-fi-fof");
    await expect(page.getByRole("navigation", { name: "Parts" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const well = document.querySelector(".fof-well")!;
      return {
        page: document.documentElement.scrollHeight - window.innerHeight,
        across: document.documentElement.scrollWidth - window.innerWidth,
        well: well.scrollHeight - well.clientHeight,
      };
    }), { message: `${width} x ${height}` }).toEqual({ page: 0, across: 0, well: 0 });
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Skin: Sci-Fi FOF" }).click();
  const list = await page.getByRole("listbox", { name: "Skin" }).boundingBox();
  expect(list!.y).toBeGreaterThanOrEqual(0);
  expect(list!.y + list!.height).toBeLessThanOrEqual(768);
});

test("Sci-Fi FOF stops and dims what its frame holds while the readings are not live", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await heldStream(page, [system, 0], [{ ...system, live: false }, 1000]);
  await page.goto("/?skin=sci-fi-fof");
  const well = page.locator(".fof-well");
  await expect(page.locator(".fof-conduit").first()).toBeAttached();
  expect(await well.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);

  await expect(page.getByRole("alert")).toContainText("Stale");
  expect(await well.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await well.evaluate((element) => getComputedStyle(element).filter)).not.toBe("none");
});

test("Sci-Fi FOF comes up in its own frame before the first readings, and the minimal skin keeps its page", async ({ page }) => {
  await heldStream(page);
  await page.goto("/?skin=sci-fi-fof");
  await expect(page.locator(".fof-boot-message")).toContainText("Waiting for the first readings.");
  await expect(page.locator(".fof-boot .fof-elbow-top")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "tsoa-gui" })).toHaveCount(1);
  const background = await page.locator(".skin-sci-fi-fof").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe("rgb(0, 0, 0)");

  await page.goto("/");
  await expect(page.getByText("Waiting for the first readings.")).toBeVisible();
  await expect(page.locator(".fof-boot")).toHaveCount(0);
});

test("Sci-Fi FOF's limit screen fits inside the frame, with keys a finger can hit", async ({ page }) => {
  await heldStream(page, [system, 0]);
  await page.route("**/api/session", (route) => route.fulfill({
    json: { account: { name: "owner", role: "admin" }, setup_needed: false, csrf: "token" },
  }));
  await page.route("**/api/controls", (route) => route.fulfill({
    json: [{ name: "input-1-current-limit", value: 16, adjustable: true, low: 0, high: 100, ceiling: 30 }],
  }));
  for (const [width, height] of [[800, 480], [1024, 600], [1024, 768], [1366, 768], [1920, 1080], [3840, 2160]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?skin=sci-fi-fof&part=inverter_charger");
    // A small panel shows one section at a time.
    if (height! < 610) {
      await page.getByRole("button", { name: "Controls", exact: true }).click();
    }
    const key = page.locator(".fof-deck-control").first();
    // Measured by layout, since the page is still zooming in.
    expect(await key.evaluate((element) => (element as HTMLElement).offsetHeight), `${width} x ${height}`)
      .toBeGreaterThanOrEqual(44);
    await key.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Breaker sizes" })).toBeVisible();
    const measured = await page.evaluate(() => {
      const well = document.querySelector(".fof-well")!;
      const keys = [...document.querySelectorAll(".fof-limit button")].map((key) => key.getBoundingClientRect());
      const figures = [...document.querySelectorAll(".fof-limit-readout b")].map((figure) => figure.getBoundingClientRect());
      return {
        over: well.scrollHeight - well.clientHeight,
        smallest: Math.min(...keys.flatMap((key) => [key.width, key.height])),
        reach: Math.max(...figures.map((figure) => figure.right)) - document.querySelector(".fof-limit-main")!.getBoundingClientRect().right,
      };
    });
    expect(measured.over, `${width} x ${height}`).toBe(0);
    expect(measured.reach, `${width} x ${height}`).toBeLessThanOrEqual(0);
    expect(measured.smallest, `${width} x ${height}`).toBeGreaterThanOrEqual(44);
  }
});

test("Sci-Fi FOF's pill on a reading that can be changed stands taller than its row, which keeps its height", async ({ page }) => {
  await heldStream(page, [system, 0]);
  await page.route("**/api/session", (route) => route.fulfill({
    json: { account: { name: "owner", role: "admin" }, setup_needed: false, csrf: "token" },
  }));
  await page.route("**/api/controls", (route) => route.fulfill({
    json: [{ name: "input-1-current-limit", value: 16, adjustable: true, low: 0, high: 100, ceiling: 30 }],
  }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?skin=sci-fi-fof&part=inverter_charger");
  const pill = page.locator(".fof-row .control-value").first();
  await expect(pill).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const measured = await pill.evaluate((element) => {
    const row = element.closest<HTMLElement>(".fof-row")!;
    return {
      pill: (element as HTMLElement).offsetHeight,
      row: row.offsetHeight,
      plain: (row.previousElementSibling as HTMLElement).offsetHeight,
    };
  });
  expect(measured.pill).toBeGreaterThan(measured.row);
  expect(measured.row).toBe(measured.plain);
});

test("Sci-Fi FOF's part pages fit inside the frame with every reading known", async ({ page }) => {
  await heldStream(page, [system, 0]);
  for (const [width, height] of [[1093, 614], [1366, 768], [1707, 960], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const part of ["battery", "inverter_charger", "ac_loads", "dc_loads", "grid", "solar"]) {
      await page.goto(`/?skin=sci-fi-fof&part=${part}`);
      await expect(page.locator(".fof-deck-groups")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const over = await page.locator(".fof-well").evaluate((well) => well.scrollHeight - well.clientHeight);
      expect(over, `${part} at ${width} x ${height}`).toBe(0);
      if (part === "inverter_charger") {
        const reach = await page.evaluate(() => document.querySelector(".fof-deck-leds")!.getBoundingClientRect().right
          - document.querySelector(".fof-deck-groups")!.getBoundingClientRect().left);
        expect(reach, `the lights at ${width} x ${height}`).toBeLessThanOrEqual(0);
      } else if (part === "battery") {
        const clear = await page.evaluate(() => document.querySelector(".fof-deck-checks")!.getBoundingClientRect().top
          - Math.max(...[...document.querySelectorAll(".fof-deck-groups > *")].map((section) => section.getBoundingClientRect().bottom)));
        expect(clear, `the checks at ${width} x ${height}`).toBeGreaterThan(0);
      }
    }
  }
});

test("Sci-Fi FOF keeps a page of few sections to a width a row can be read across", async ({ page }) => {
  await heldStream(page, [system, 0]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?skin=sci-fi-fof&part=dc_loads");
  await expect(page.locator(".fof-deck-groups")).toBeVisible();
  const rowInEm = await page.locator(".fof-deck-group .fof-row").first().evaluate((row) =>
    (row as HTMLElement).offsetWidth / parseFloat(getComputedStyle(row.closest(".fof")!).fontSize));
  expect(rowInEm).toBeLessThan(20);
});

test("Sci-Fi FOF's top bar keeps a unit's case, and sets a word in capitals", async ({ page }) => {
  // With no alarm, which would take the bar's place.
  await heldStream(page, [{
    ...system,
    inverter_charger: { ...system.inverter_charger!, status: "normal", alarms: [] },
    battery: { ...system.battery!, time_left: { toward: "full", seconds: 7200, settled: false } },
  }, 0]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const case_ = async (label: RegExp) => page.locator(".fof-vital", { hasText: label }).locator("b")
    .evaluate((figure) => getComputedStyle(figure).textTransform);

  await page.goto("/?skin=sci-fi-fof&part=battery");
  await expect(page.locator(".fof-vital", { hasText: /Time to/ })).toBeVisible();
  expect(await case_(/Time to/)).toBe("none");

  await page.goto("/?skin=sci-fi-fof&part=inverter_charger");
  await expect(page.locator(".fof-vital", { hasText: "State" })).toBeVisible();
  expect(await case_(/State/)).toBe("uppercase");
});

test("Sci-Fi FOF says so on the page of a part that is not reporting", async ({ page }) => {
  await heldStream(page, [{ ...system, solar: { ...system.solar!, status: "offline" } }, 0]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?skin=sci-fi-fof&part=solar");
  await expect(page.locator(".fof-deck-head").getByText("Not reporting")).toBeVisible();
  // Measured by layout, since the page is still zooming in; hidden, the head is a pixel wide.
  expect(await page.locator(".fof-deck-head").evaluate((head) => (head as HTMLElement).offsetWidth)).toBeGreaterThan(100);
});

test("Sci-Fi FOF drops the cells' glow on every small panel, and keeps it on a larger screen", async ({ page }) => {
  await heldStream(page, [system, 0]);
  for (const [width, height, glow] of [[800, 480, false], [960, 540, false], [1024, 600, false], [800, 700, false], [1093, 614, true], [1920, 1080, true]]) {
    await page.setViewportSize({ width: width as number, height: height as number });
    await page.goto("/?skin=sci-fi-fof");
    const shadow = await page.locator(".fof-cell-lit").first().evaluate((cell) => getComputedStyle(cell).boxShadow);
    expect(shadow !== "none", `${width} x ${height}`).toBe(glow);
  }
});

test("Sci-Fi FOF changes shape on a small panel, so that nothing scrolls and every target takes a finger", async ({ page }) => {
  await heldStream(page, [system, 0]);
  await page.route("**/api/session", (route) => route.fulfill({
    json: { account: { name: "owner", role: "admin" }, setup_needed: false, csrf: "token" },
  }));
  await page.route("**/api/controls", (route) => route.fulfill({
    json: [{ name: "input-1-current-limit", value: 16, adjustable: true, low: 0, high: 100, ceiling: 30 }],
  }));
  const measure = () => page.evaluate(() => {
    const well = document.querySelector(".fof-well")!;
    // A part on the diagram opens from anywhere on it, so its name is not the
    // target, and a value in a row reaches past what it draws.
    const targets = [...document.querySelectorAll<HTMLElement>(".fof-side a, .fof-side button, .fof-elbow-top, .fof-deck-control")];
    // The bottom bar's keys reach past what they draw, so what counts is what a finger lands on.
    const reach = (key: HTMLElement) => {
      const { left, width, bottom } = key.getBoundingClientRect();
      let height = 0;
      while (key.contains(document.elementFromPoint(left + width / 2, bottom - height - 0.5))) {
        height += 1;
      }
      return height;
    };
    const keys = [...document.querySelectorAll<HTMLElement>(".fof-account-segment, .fof-select-button")];
    return {
      over: well.scrollHeight - well.clientHeight,
      across: well.scrollWidth - well.clientWidth,
      small: [...targets.filter((target) => target.offsetHeight < 44), ...keys.filter((key) => reach(key) < 44)]
        .map((target) => target.textContent),
    };
  });
  for (const [width, height] of [[800, 480], [960, 540], [1024, 600], [863, 360], [667, 375]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?skin=sci-fi-fof");
    await expect(page.locator(".fof-diagram")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await measure(), `the overview at ${width} x ${height}`).toEqual({ over: 0, across: 0, small: [] });

    await page.locator(".fof-select-button").click();
    const options = page.getByRole("option");
    await expect(options.last()).toHaveCSS("opacity", "1");
    const hits = await options.evaluateAll((all) => all.map((option) => {
      const { left, width: across, top, bottom } = option.getBoundingClientRect();
      const lands = (y: number) => option.contains(document.elementFromPoint(left + across / 2, y));
      return { height: Math.round(bottom - top), whole: lands(top + 1) && lands(bottom - 1) };
    }));
    for (const hit of hits) {
      expect(hit.height, `an option at ${width} x ${height}`).toBeGreaterThanOrEqual(44);
      expect(hit.whole, `an option at ${width} x ${height}`).toBe(true);
    }
    await page.keyboard.press("Escape");

    for (const part of ["battery", "inverter_charger", "ac_loads", "dc_loads", "grid", "solar"]) {
      await page.goto(`/?skin=sci-fi-fof&part=${part}`);
      const sections = page.getByRole("navigation", { name: "Sections" }).getByRole("button");
      await expect(sections.first()).toBeVisible();
      for (const section of await sections.all()) {
        await section.click();
        await expect(section).toHaveAttribute("aria-pressed", "true");
        expect(await measure(), `${await section.textContent()} of ${part} at ${width} x ${height}`)
          .toEqual({ over: 0, across: 0, small: [] });
      }
    }
  }
});

test("Sci-Fi FOF lists the parts on a phone held upright, each opening a page that fits", async ({ page }) => {
  await heldStream(page, [system, 0]);
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto("/?skin=sci-fi-fof");
  const rows = page.getByRole("navigation", { name: "Parts" }).getByRole("link");
  await expect(rows).toHaveCount(6);
  await expect(page.locator(".fof-diagram")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);

  const measured = await page.evaluate(() => {
    const well = document.querySelector(".fof-well")!;
    // The key reaches past what it draws, so what counts is what a finger lands on.
    const key = document.querySelector<HTMLElement>(".fof-select-button")!;
    const { left, width, bottom } = key.getBoundingClientRect();
    let reach = 0;
    while (key.contains(document.elementFromPoint(left + width / 2, bottom - reach - 0.5))) {
      reach += 1;
    }
    return {
      over: well.scrollHeight - well.clientHeight,
      across: well.scrollWidth - well.clientWidth,
      shortest: Math.min(...[...document.querySelectorAll<HTMLElement>(".fof-list > a, .fof-elbow-top")].map((target) => target.offsetHeight)),
      reach,
    };
  });
  expect(measured.over).toBe(0);
  expect(measured.across).toBe(0);
  expect(measured.shortest).toBeGreaterThanOrEqual(44);
  expect(measured.reach).toBeGreaterThanOrEqual(44);

  // Solar is producing in the fixture, and the DC loads are not known to be drawing anything.
  await expect(rows.filter({ hasText: "Solar" }).locator(".fof-list-flowing")).toHaveCount(1);
  await expect(rows.filter({ hasText: "DC loads" }).locator(".fof-list-flowing")).toHaveCount(0);
  await expect(rows.filter({ hasText: "DC loads" })).toContainText("12V cabin lighting 6.3 W");

  for (const name of ["Shore power", "Solar", "Inverter", "Battery", "AC loads", "DC loads"]) {
    await rows.filter({ hasText: name }).click();
    await expect(page.locator(".fof-deck")).toBeVisible();
    const across = await page.locator(".fof-well").evaluate((well) => well.scrollWidth - well.clientWidth);
    expect(across, name).toBe(0);
    await page.getByRole("button", { name: "Overview" }).click();
    await expect(rows).toHaveCount(6);
  }
});

test("Sci-Fi FOF draws each share of an AC panel's power to scale, with whole words or none", async ({ page }) => {
  const circuit = system.ac_loads!.circuits[0]!;
  await heldStream(page, [{
    ...system,
    ac_loads: {
      ...system.ac_loads!,
      power_w: 2000,
      circuits: [
        { ...circuit, name: "Kitchen", power_w: 1200 },
        { ...circuit, name: "Workshop", power_w: 300 },
        { ...circuit, name: "Pump room", power_w: 5 },
      ],
    },
  }, 0]);
  for (const [width, height] of [[1920, 1080], [1366, 768], [412, 839]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?skin=sci-fi-fof&part=ac_loads");
    await expect(page.locator(".fof-deck-share")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // Measured by layout, since the page is still zooming in.
    const shares = await page.locator(".fof-deck-share > li").evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      const scale = box.width / (item as HTMLElement).offsetWidth;
      return {
        width: (item as HTMLElement).offsetWidth,
        words: [...item.children].map((word) => {
          const drawn = word.getBoundingClientRect();
          const shown = drawn.top < box.bottom - 1;
          return { shown, whole: !shown || (drawn.left >= box.left - scale && drawn.right <= box.right + scale) };
        }),
      };
    }));
    expect(shares.map(({ words }) => words.every(({ whole }) => whole)), `${width} x ${height}`).toEqual([true, true, true, true]);
    expect(shares[0]!.words.every(({ shown }) => shown), `the largest at ${width} x ${height}`).toBe(true);
    expect(shares[2]!.words.some(({ shown }) => shown), `the smallest at ${width} x ${height}`).toBe(false);
    // 1200 W against 300 W, and 495 W not metered: the 5 W share is held to a visible sliver.
    expect(shares[0]!.width / shares[1]!.width, `${width} x ${height}`).toBeCloseTo(4, 0);
    expect(shares[0]!.width, `${width} x ${height}`).toBeGreaterThan(shares[3]!.width);
    expect(shares[3]!.width, `${width} x ${height}`).toBeGreaterThan(shares[1]!.width);
    expect(shares[2]!.width, `${width} x ${height}`).toBeGreaterThan(0);
  }
});
