import { describe, expect, it, vi } from "vitest";

import { SystemStore } from "./store";

class FakeStream {
  closed = false;
  private readonly handlers = new Map<string, (event: Event) => void>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.handlers.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: unknown): void {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(data) });
    this.handlers.get(type)?.(event);
  }
}

function storeWithStream() {
  const streams: FakeStream[] = [];
  const store = new SystemStore("/stream", () => {
    const stream = new FakeStream();
    streams.push(stream);
    return stream;
  });
  return { store, streams };
}

describe("SystemStore", () => {
  it("opens the stream on the first subscriber and closes it after the last", () => {
    const { store, streams } = storeWithStream();
    const first = store.subscribe(() => {});
    const second = store.subscribe(() => {});
    expect(streams).toHaveLength(1);
    first();
    expect(streams[0]?.closed).toBe(false);
    second();
    expect(streams[0]?.closed).toBe(true);
  });

  it("takes the whole model, then applies each change", () => {
    const { store, streams } = storeWithStream();
    const listener = vi.fn();
    store.subscribe(listener);
    const stream = streams[0]!;

    stream.emit("model", { live: true, battery: { soc_percent: 50 } });
    expect(store.getSnapshot()).toEqual({ model: { live: true, battery: { soc_percent: 50 } }, connected: true });

    const before = store.getSnapshot();
    stream.emit("patch", { battery: { soc_percent: 51 } });
    expect(store.getSnapshot().model).toEqual({ live: true, battery: { soc_percent: 51 } });
    expect(store.getSnapshot()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores a change that arrives before any model", () => {
    const { store, streams } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("patch", { battery: { soc_percent: 51 } });
    expect(store.getSnapshot().model).toBeNull();
  });

  it("shows a lost connection but keeps the last model", () => {
    const { store, streams } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("model", { live: true });
    streams[0]!.emit("error");
    expect(store.getSnapshot()).toEqual({ model: { live: true }, connected: false });
  });
});
