import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Eased } from "./Eased";
import { percent, power } from "./format";

describe("Eased", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("eases to a new reading instead of jumping to it", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { rerender } = render(<p data-testid="value"><Eased value={100} format={power} /></p>);
    expect(screen.getByTestId("value")).toHaveTextContent("100 W");

    rerender(<p data-testid="value"><Eased value={200} format={power} /></p>);
    expect(screen.getByTestId("value")).toHaveTextContent("100 W");

    act(() => vi.advanceTimersByTime(300));
    const midway = Number.parseInt(screen.getByTestId("value").textContent ?? "", 10);
    expect(midway).toBeGreaterThan(100);
    expect(midway).toBeLessThan(200);

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("value")).toHaveTextContent("200 W");
  });

  it("stays between the two readings when a frame's time is from before the easing started", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    vi.advanceTimersByTime(20_000);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { rerender } = render(<p data-testid="value"><Eased value={72} format={percent} /></p>);

    rerender(<p data-testid="value"><Eased value={73} format={percent} /></p>);
    act(() => frames.shift()?.(performance.now() - 9400));
    expect(screen.getByTestId("value")).toHaveTextContent("72%");

    act(() => frames.shift()?.(performance.now() + 800));
    expect(screen.getByTestId("value")).toHaveTextContent("73%");
  });

  it("shows an unknown reading as unknown at once", () => {
    const { rerender } = render(<p data-testid="value"><Eased value={100} format={power} /></p>);
    rerender(<p data-testid="value"><Eased value={null} format={power} /></p>);
    expect(screen.getByTestId("value")).toHaveTextContent("unknown");
  });
});
