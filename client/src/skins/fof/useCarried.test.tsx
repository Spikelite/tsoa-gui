import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoutesContext, useCarried, type Along, type Routes } from "./carry";

const along: Along = { keys: ["grid-inverter"], end: "source" };
const idle: Routes = { "grid-inverter": { period: 12, phase: 0.5, length: 3 } };
const active: Routes = { "grid-inverter": { period: 2, phase: 0.5, length: 3 } };

function Lit({ value }: { value: boolean }) {
  return <p data-testid="lit">{String(useCarried(value, along))}</p>;
}

describe("useCarried", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times a change again by its conduit's new pace, from when the change was made", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.advanceTimersByTime(1000);
    const { rerender } = render(<RoutesContext.Provider value={idle}><Lit value={false} /></RoutesContext.Provider>);

    // Made at 1 s on the idle route, the change would light the source as its 12 s cycle starts...
    rerender(<RoutesContext.Provider value={idle}><Lit value={true} /></RoutesContext.Provider>);
    // ...but the conduit then publishes its active route, and the change keeps the conduit's 2 s cycle.
    rerender(<RoutesContext.Provider value={active}><Lit value={true} /></RoutesContext.Provider>);

    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByTestId("lit")).toHaveTextContent("false");
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByTestId("lit")).toHaveTextContent("true");
  });
});
