import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SystemStore } from "./store";
import { useSystem } from "./useSystem";

type Handler = (event: Event) => void;

function Readout({ store }: { store: SystemStore }) {
  const { model, connected } = useSystem(store);
  const soc = model?.battery?.soc_percent;
  return <p>{connected ? `Battery ${soc ?? "unknown"}%` : "Waiting"}</p>;
}

describe("useSystem", () => {
  it("re-renders as the model arrives and changes", () => {
    const handlers = new Map<string, Handler>();
    const store = new SystemStore("/stream", () => ({
      addEventListener: (type: string, listener: Handler) => handlers.set(type, listener),
      close: () => {},
    }));
    const emit = (type: string, data: unknown) =>
      act(() => handlers.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) })));

    render(<Readout store={store} />);
    expect(screen.getByText("Waiting")).toBeInTheDocument();

    emit("model", { live: true, battery: { soc_percent: 40 } });
    expect(screen.getByText("Battery 40%")).toBeInTheDocument();

    emit("patch", { battery: { soc_percent: null } });
    expect(screen.getByText("Battery unknown%")).toBeInTheDocument();
  });
});
