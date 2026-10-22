import { act } from "@testing-library/react";

import { SystemStore } from "../model/store";

type Handler = (event: Event) => void;

// A store fed by hand instead of by the server's event stream.
export function fakeStore() {
  const handlers = new Map<string, Handler>();
  const store = new SystemStore("/stream", () => ({
    addEventListener: (type: string, listener: Handler) => {
      handlers.set(type, listener);
    },
    close: () => {},
  }));
  const emit = (type: string, data?: unknown) =>
    act(() => {
      const event = data === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(data) });
      handlers.get(type)?.(event);
    });
  return { store, emit };
}
