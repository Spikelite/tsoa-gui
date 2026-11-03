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
    expect(sent.at(-1)).toMatchObject({ path: "/api/controls/input-1-current-limit", body: { value: 3 } });
    await act(async () => {
      answer(new Response(JSON.stringify({ outcome: "confirmed", new: 3, reported: 4.2 })));
    });
    expect(within(panel).getByRole("status")).toHaveTextContent("The device set 4.2 A rather than 3.0 A.");
  });

  it("says when the device has not confirmed a change", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] },
      "POST /api/controls/input-1-current-limit": { body: { outcome: "unconfirmed", new: 10, reported: 16 } } });
    await inverterPage(skin);
    const panel = await open();
    fireEvent.click(within(panel).getByRole("button", { name: "10 A" }));
    expect(await within(panel).findByText("Sent 10.0 A. The device has not confirmed it yet.")).toBeInTheDocument();
  });

  it("says why a change was refused", async () => {
    fakeServer({ "GET /api/session": { body: session("operator") }, "GET /api/controls": { body: [limit()] },
      "POST /api/controls/input-1-current-limit": { status: 409,
        body: { detail: "The device does not allow this setting to be changed now." } } });
    await inverterPage(skin);
    const panel = await open();
    fireEvent.click(within(panel).getByRole("button", { name: "15 A" }));
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
    expect(sent.at(-2)).toMatchObject({ method: "PUT", body: { value: 30 }, csrf: "token" });
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
