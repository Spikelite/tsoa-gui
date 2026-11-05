import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { fakeServer } from "../test/fakeServer";
import { fakeStore } from "../test/fakeStore";
import { system } from "../test/system";
import type { ControlState } from "./api";
import { highest } from "./controls";

const session = (role: string | null) => ({
  account: role === null ? null : { name: role === "admin" ? "owner" : "crew", role },
  setup_needed: false,
  csrf: role === null ? null : "token",
});
const limit = (change: Partial<ControlState> = {}): ControlState => ({
  name: "input-1-current-limit", value: 16, adjustable: true, low: 0, high: 100, ceiling: null, ...change,
});

async function inverterPage(skin: string) {
  localStorage.setItem("tsoa-gui.skin", skin);
  window.history.replaceState(null, "", "/?part=inverter_charger");
  const { store, emit } = fakeStore();
  render(<App store={store} />);
  await act(async () => {
    emit("model", system);
  });
}

const open = async () => {
  // The first is in the Controls group; the Input group's current limit is one too.
  const [first] = await screen.findAllByRole("button", { description: /^Change the .* limit$/ });
  fireEvent.click(first as HTMLElement);
  return screen.getByRole("group", { name: /limit$/ });
};
const presets = (panel: HTMLElement) =>
  within(within(panel).getByRole("group", { name: "Breaker sizes" })).getAllByRole("button").map((b) => b.textContent);

describe.each(["minimal", "sci-fi-fof"])("the input limit control in %s", (skin) => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("is a plain reading to someone signed out, who never asks for the controls", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session(null) } });
    await inverterPage(skin);
    expect(screen.queryByRole("button", { description: /^Change the/ })).toBeNull();
    expect(sent.some((request) => request.path === "/api/controls")).toBe(false);
  });

  it("is a plain reading to a viewer", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session("viewer") } });
    await inverterPage(skin);
    expect(screen.queryByRole("button", { description: /^Change the/ })).toBeNull();
    expect(sent.some((request) => request.path === "/api/controls")).toBe(false);
  });
});

describe("the input limit panel in the minimal skin", () => {
  const skin = "minimal";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("lets an operator only lower the limit until an admin sets the breaker size", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] } });
    await inverterPage(skin);
    const panel = await open();
    expect(presets(panel)).toEqual(["10 A", "15 A"]);
    expect(within(panel).getByText(/can only be lowered/)).toBeInTheDocument();
    expect(within(panel).queryByLabelText("Breaker size")).toBeNull();
  });

  it("offers an operator the presets up to the breaker size", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit({ ceiling: 32 })] } });
    await inverterPage(skin);
    expect(presets(await open())).toEqual(["10 A", "15 A", "20 A", "25 A", "30 A"]);
  });

  it("fills in a preset without sending it, so that nothing reaches the device until Set", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit()] } });
    await inverterPage(skin);
    const panel = await open();
    fireEvent.click(within(panel).getByRole("button", { name: "10 A" }));
    expect(within(panel).getByLabelText("Amps")).toHaveValue(10);
    expect(within(panel).getByRole("button", { name: "10 A" })).toHaveAttribute("aria-pressed", "true");
    expect(sent.some((request) => request.method === "POST")).toBe(false);
  });

  it("shows a change as pending, then as the device reported it", async () => {
    let answer: (value: Response) => void = () => {};
    const sent = fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit()] } });
    const fetched = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
      init?.method === "POST" ? (sent.push({ method: "POST", path: input, body: JSON.parse(String(init.body)),
        csrf: "token" }), new Promise<Response>((resolve) => { answer = resolve; })) : fetched(input, init));
    await inverterPage(skin);
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText("Amps"), { target: { value: "3" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Set" }));
    expect(within(panel).getByRole("status")).toHaveTextContent("Setting 3.0 A.");
    expect(within(panel).getByRole("button", { name: "Set" })).toBeDisabled();
    expect(sent.find((request) => request.method === "POST"))
      .toMatchObject({ path: "/api/controls/input-1-current-limit", body: { value: 3 } });
    await act(async () => {
      answer(new Response(JSON.stringify({ outcome: "confirmed", new: 3, reported: 4.2 })));
    });
    expect(within(panel).getByRole("status")).toHaveTextContent("The device set 4.2 A rather than 3.0 A.");
  });

  it("sends a value typed to a tenth exactly as typed", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit()] },
      "POST /api/controls/input-1-current-limit": { body: { outcome: "confirmed", new: 15.1, reported: 15.1 } } });
    await inverterPage(skin);
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText("Amps"), { target: { value: "15.1" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Set" }));
    expect(await within(panel).findByText("Set to 15.1 A.")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "POST")?.body).toEqual({ value: 15.1 });
  });

  it("says when the device has not confirmed a change", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] },
      "POST /api/controls/input-1-current-limit": { body: { outcome: "unconfirmed", new: 10, reported: 16 } } });
    await inverterPage(skin);
    const panel = await open();
    fireEvent.click(within(panel).getByRole("button", { name: "10 A" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Set" }));
    expect(await within(panel).findByText("Sent 10.0 A. The device has not confirmed it yet.")).toBeInTheDocument();
  });

  it("says why a change was refused", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] },
      "POST /api/controls/input-1-current-limit": { status: 409,
        body: { detail: "The device does not allow this setting to be changed now." } } });
    await inverterPage(skin);
    const panel = await open();
    fireEvent.click(within(panel).getByRole("button", { name: "15 A" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Set" }));
    expect(await within(panel).findByText("The device does not allow this setting to be changed now."))
      .toBeInTheDocument();
  });

  it("offers no change while the device does not allow one", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit({ adjustable: false })] } });
    await inverterPage(skin);
    const panel = await open();
    expect(within(panel).getByText(/does not allow this to be changed now/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Set" })).toBeNull();
  });

  it("lets an admin set the breaker size", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session("admin") }, "GET /api/controls": { body: [limit()] },
      "PUT /api/controls/input-1-current-limit/ceiling": { body: limit({ ceiling: 30 }) } });
    await inverterPage(skin);
    const panel = await open();
    expect(presets(panel)).toHaveLength(9);
    fireEvent.change(within(panel).getByLabelText("Breaker size"), { target: { value: "30" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save" }));
    expect(await within(panel).findByText("Breaker size 30.0 A.")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "PUT")).toMatchObject({ method: "PUT", body: { value: 30 }, csrf: "token" });
  });
});

describe("the input limit screen in Sci-Fi FOF", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  const screenOpen = async () => {
    await inverterPage("sci-fi-fof");
    const [first] = await screen.findAllByRole("button", { description: /^Change the .* limit$/ });
    fireEvent.click(first as HTMLElement);
    return screen.findByRole("group", { name: "Breaker sizes" });
  };
  const button = (name: string | RegExp) => screen.getByRole("button", { name });
  const note = () => screen.getAllByRole("status").find((element) => element.classList.contains("fof-limit-note"))!;

  it("takes over the frame, and hands it back from Cancel or Escape", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] } });
    await screenOpen();
    expect(screen.queryByRole("navigation", { name: "Parts" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Shore power limit" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Front panel lights" })).toBeNull();

    fireEvent.click(button("Cancel"));
    expect(await screen.findByRole("navigation", { name: "Parts" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("part")).toBe("inverter_charger");

    const [first] = screen.getAllByRole("button", { description: /^Change the .* limit$/ });
    fireEvent.click(first as HTMLElement);
    fireEvent.keyDown(document.querySelector(".fof-limit")!, { key: "Escape" });
    expect(await screen.findByRole("navigation", { name: "Parts" })).toBeInTheDocument();
    // Escape left the screen, not the page under it.
    expect(new URLSearchParams(window.location.search).get("part")).toBe("inverter_charger");
  });

  it("sends nothing until Set, then shows the change as pending and as the device reported it", async () => {
    let answer: (value: Response) => void = () => {};
    const sent = fakeServer({ "GET /api/session": { body: session("admin") },
      "GET /api/controls": { body: [limit({ ceiling: 30 })] } });
    const fetched = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
      init?.method === "POST" ? (sent.push({ method: "POST", path: input, body: JSON.parse(String(init.body)),
        csrf: "token" }), new Promise<Response>((resolve) => { answer = resolve; })) : fetched(input, init));
    await screenOpen();
    expect(button("No change")).toBeDisabled();

    fireEvent.click(button("20 A"));
    expect(button("20 A")).toHaveAttribute("aria-pressed", "true");
    expect(sent.some((request) => request.method === "POST")).toBe(false);

    fireEvent.click(button("Set 20.0 A"));
    expect(note()).toHaveTextContent("Sending 20.0 A. Waiting for the device.");
    expect(button("Sending")).toBeDisabled();
    expect(button("15 A")).toBeDisabled();
    expect(sent.find((request) => request.method === "POST"))
      .toMatchObject({ path: "/api/controls/input-1-current-limit", body: { value: 20 } });
    await act(async () => {
      answer(new Response(JSON.stringify({ outcome: "confirmed", new: 20, reported: 19.5 })));
    });
    expect(note()).toHaveTextContent("The device set 19.5 A rather than 20.0 A.");
  });

  it("takes a value from its keys, its steppers and the keyboard, to a tenth", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit({ ceiling: 30 })] },
      "POST /api/controls/input-1-current-limit": { body: { outcome: "confirmed", new: 12.3, reported: 12.3 } } });
    await screenOpen();
    for (const key of ["1", "2", ".", "5"]) {
      fireEvent.click(button(key));
    }
    expect(button("Set 12.5 A")).toBeEnabled();
    fireEvent.click(button("Del"));
    fireEvent.click(button("3"));
    expect(button("Set 12.3 A")).toBeEnabled();
    fireEvent.click(button("+1 amps"));
    fireEvent.click(button("-0.1 amps"));
    expect(button("Set 13.2 A")).toBeEnabled();

    const pad = document.querySelector(".fof-limit")!;
    fireEvent.keyDown(pad, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(pad, { key: "ArrowUp" });
    expect(button("Set 12.3 A")).toBeEnabled();
    fireEvent.keyDown(pad, { key: "Enter" });
    expect(await screen.findByText("Set to 12.3 A.")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "POST")?.body).toEqual({ value: 12.3 });
  });

  it("refuses a value above what the account may set, and says why", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit({ ceiling: 30 })] } });
    await screenOpen();
    for (const key of ["3", "5"]) {
      fireEvent.click(button(key));
    }
    expect(note()).toHaveTextContent("That is above the breaker size of 30.0 A.");
    expect(button("Set 35.0 A")).toBeDisabled();
  });

  it("lets an operator only lower the limit until an admin sets the breaker size", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] } });
    const group = await screenOpen();
    expect(presets(group.parentElement!)).toEqual(["10 A", "15 A"]);
    expect(note()).toHaveTextContent("can only be lowered");
    expect(screen.queryByRole("button", { name: /^Breaker/ })).toBeNull();
    expect(screen.getByText("Breaker")).toHaveTextContent("Not set");
  });

  it("offers no change while the device does not allow one", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit({ adjustable: false })] } });
    await screenOpen();
    expect(note()).toHaveTextContent("does not allow this to be changed now");
    expect(button("Locked")).toBeDisabled();
    expect(button("1")).toBeDisabled();
  });

  it("says when the device has not confirmed a change, or refused it", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") },
      "GET /api/controls": { body: [limit({ ceiling: 30 })] },
      "POST /api/controls/input-1-current-limit": { body: { outcome: "unconfirmed", new: 10, reported: 16 } } });
    await screenOpen();
    fireEvent.click(button("10 A"));
    fireEvent.click(button("Set 10.0 A"));
    expect(await screen.findByText("Sent 10.0 A. The device has not confirmed it yet.")).toBeInTheDocument();
  });

  it("lets an admin set and remove the breaker size", async () => {
    const sent = fakeServer({ "GET /api/session": { body: session("admin") },
      "GET /api/controls": { body: [limit({ ceiling: 30 })] },
      "PUT /api/controls/input-1-current-limit/ceiling": { body: limit({ ceiling: 32 }) } });
    await screenOpen();
    fireEvent.click(button(/^Breaker/));
    expect(screen.getByRole("navigation", { name: "Breaker size" })).toBeInTheDocument();
    for (const key of ["3", "2"]) {
      fireEvent.click(button(key));
    }
    fireEvent.click(button("Save 32.0 A"));
    expect(await screen.findByText("Breaker size saved: 32.0 A.")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "PUT")).toMatchObject({ body: { value: 32 }, csrf: "token" });
    expect(screen.getByRole("navigation", { name: "Shore power limit" })).toBeInTheDocument();

    fireEvent.click(button(/^Breaker/));
    fireEvent.click(button("Remove"));
    await act(async () => {});
    expect(sent.filter((request) => request.method === "PUT").at(-1)).toMatchObject({ body: { value: null } });
  });
});

describe("the highest a limit may be set to", () => {
  it("is the breaker size, the device's highest for an admin without one, or the value for anyone else", () => {
    expect(highest(limit({ ceiling: 30 }), false)).toBe(30);
    expect(highest(limit({ ceiling: 30, high: 25 }), true)).toBe(25);
    expect(highest(limit(), true)).toBe(100);
    expect(highest(limit(), false)).toBe(16);
  });
});
