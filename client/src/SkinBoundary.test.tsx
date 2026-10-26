import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { App } from "./App";
import type { System } from "./model/system";
import { FIRST_WAIT_MS, LONGEST_WAIT_MS } from "./reloadWait";
import { SkinBoundary, type Reloading } from "./SkinBoundary";
import { fakeStore } from "./test/fakeStore";
import { system } from "./test/system";

function Broken(): never {
  throw new Error("invented failure");
}

type Tab = Reloading & { reload: Mock<() => void> };

function tab(): Tab {
  const saved = new Map<string, string>();
  return {
    reload: vi.fn<() => void>(),
    storage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => void saved.set(key, value) },
  };
}

/** How long a page that fails to draw waits before it reloads. */
function waitBeforeReload(reloading: Tab): number {
  reloading.reload.mockClear();
  render(<SkinBoundary reloading={reloading}><Broken /></SkinBoundary>);
  const start = Date.now();
  while (reloading.reload.mock.calls.length === 0) {
    act(() => vi.advanceTimersByTime(1000));
  }
  cleanup();
  return Date.now() - start;
}

describe("SkinBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // React reports each error it catches on the console.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("draws the skin while it draws", () => {
    render(<SkinBoundary reloading={tab()}><p>Drawn</p></SkinBoundary>);
    expect(screen.getByText("Drawn")).toBeInTheDocument();
  });

  it("says what happened in place of a skin that fails, and reloads after a short wait", () => {
    const reloading = tab();
    render(<SkinBoundary reloading={reloading}><Broken /></SkinBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Reloading in a moment");
    act(() => vi.advanceTimersByTime(FIRST_WAIT_MS - 1));
    expect(reloading.reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(reloading.reload).toHaveBeenCalledOnce();
  });

  it("waits longer each time a failure comes straight back, up to a limit", () => {
    const reloading = tab();
    const waits = Array.from({ length: 7 }, () => waitBeforeReload(reloading));
    expect(waits).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    expect(waits[0]).toBe(FIRST_WAIT_MS);
    expect(waits.at(-1)).toBe(LONGEST_WAIT_MS);
  });

  it("waits the short time again for a failure long after the last reload", () => {
    const reloading = tab();
    waitBeforeReload(reloading);
    waitBeforeReload(reloading);
    vi.advanceTimersByTime(LONGEST_WAIT_MS);
    expect(waitBeforeReload(reloading)).toBe(FIRST_WAIT_MS);
  });

  it("catches a skin that fails on a model it does not expect", () => {
    const { store, emit } = fakeStore();
    const reloading = tab();
    render(<App store={store} reloading={reloading} />);
    const broken = { ...system, inverter_charger: { ...system.inverter_charger, alarms: null } } as unknown as System;
    emit("model", broken);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong drawing this page");
    act(() => vi.advanceTimersByTime(FIRST_WAIT_MS));
    expect(reloading.reload).toHaveBeenCalledOnce();
  });
});
