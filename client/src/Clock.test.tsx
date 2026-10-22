import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Clock } from "./Clock";

describe("Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 41, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the time of day, and moves on at the next minute", () => {
    render(<Clock />);
    const clock = screen.getByLabelText("Time of day");
    expect(clock.textContent).toMatch(/9:41/);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(clock.textContent).toMatch(/9:42/);
  });
});
