import { afterEach, describe, expect, it, vi } from "vitest";

import { CHECK_EVERY_MS, EXPLAIN_AFTER_MS, RELOAD_AFTER_MS, SystemStore } from "./store";

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

function storeWithStream(answers = false) {
  const streams: FakeStream[] = [];
  const server = { answers, asked: 0 };
  const reload = vi.fn();
  const store = new SystemStore("/stream", () => {
    const stream = new FakeStream();
    streams.push(stream);
    return stream;
  }, {
    answers: () => {
      server.asked += 1;
      return Promise.resolve(server.answers);
    },
    reload,
  });
  return { store, streams, server, reload };
}

afterEach(() => {
  vi.useRealTimers();
});

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
    expect(store.getSnapshot()).toEqual({
      model: { live: true, battery: { soc_percent: 50 } }, connected: true, waiting: null, overdue: false,
    });

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

  it("reloads the page once the server answers again after a long loss of the stream", async () => {
    vi.useFakeTimers();
    const { store, streams, server, reload } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("model", { live: true });
    streams[0]!.emit("error");
    // Nobody is asked before the wait is up, and nothing reloads while the
    // server does not answer.
    await vi.advanceTimersByTimeAsync(RELOAD_AFTER_MS - 1);
    expect(server.asked).toBe(0);
    await vi.advanceTimersByTimeAsync(1 + 3 * CHECK_EVERY_MS);
    expect(server.asked).toBe(4);
    expect(reload).not.toHaveBeenCalled();
    server.answers = true;
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    // It reloads once, and asks no more.
    await vi.advanceTimersByTimeAsync(5 * CHECK_EVERY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(server.asked).toBe(5);
  });

  it("asks nothing and reloads nothing when the stream comes back in time", async () => {
    vi.useFakeTimers();
    const { store, streams, server, reload } = storeWithStream(true);
    store.subscribe(() => {});
    streams[0]!.emit("model", { live: true });
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(RELOAD_AFTER_MS - 1000);
    streams[0]!.emit("model", { live: true });
    await vi.advanceTimersByTimeAsync(10 * RELOAD_AFTER_MS);
    expect(server.asked).toBe(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits for the server when the stream fails before its first model", async () => {
    vi.useFakeTimers();
    const { store, streams, reload } = storeWithStream(true);
    store.subscribe(() => {});
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(RELOAD_AFTER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops asking once nothing reads the stream", async () => {
    vi.useFakeTimers();
    const { store, streams, server, reload } = storeWithStream(true);
    const unsubscribe = store.subscribe(() => {});
    streams[0]!.emit("error");
    unsubscribe();
    await vi.advanceTimersByTimeAsync(10 * RELOAD_AFTER_MS);
    expect(server.asked).toBe(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows a lost connection but keeps the last model", () => {
    const { store, streams } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("model", { live: true });
    streams[0]!.emit("error");
    expect(store.getSnapshot()).toEqual({ model: { live: true }, connected: false, waiting: null, overdue: false });
  });

  it("reloads the page when a stream names another release than the first", () => {
    const { store, streams, reload } = storeWithStream();
    store.subscribe(() => {});
    const stream = streams[0]!;
    stream.emit("release", { version: "1.0.0", client: "aaaa" });
    stream.emit("model", { live: true });
    // The stream reconnects after the server restarts on the same release.
    stream.emit("error");
    stream.emit("release", { version: "1.0.0", client: "aaaa" });
    expect(reload).not.toHaveBeenCalled();
    stream.emit("error");
    stream.emit("release", { version: "1.1.0", client: "bbbb" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads the page when a development build's client changes, though it has no version", () => {
    const { store, streams, reload } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("release", { version: null, client: "aaaa" });
    streams[0]!.emit("release", { version: null, client: "bbbb" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the first release across closing and reopening the stream", () => {
    const { store, streams, reload } = storeWithStream();
    store.subscribe(() => {})();
    streams[0]!.emit("release", { version: "1.0.0", client: "aaaa" });
    store.subscribe(() => {});
    streams[1]!.emit("release", { version: "1.1.0", client: "aaaa" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("marks the first model overdue after a wait, with what the server said about it", async () => {
    vi.useFakeTimers();
    const { store, streams } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("release", { version: "1.0.0", client: "aaaa" });
    streams[0]!.emit("status", { waiting: "broker_unreachable" });
    await vi.advanceTimersByTimeAsync(EXPLAIN_AFTER_MS - 1);
    expect(store.getSnapshot()).toMatchObject({ connected: true, waiting: "broker_unreachable", overdue: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot().overdue).toBe(true);
    streams[0]!.emit("status", { waiting: "broker_silent" });
    expect(store.getSnapshot().waiting).toBe("broker_silent");
  });

  it("marks the first model overdue when the stream never opens", async () => {
    vi.useFakeTimers();
    const { store, streams } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(EXPLAIN_AFTER_MS);
    expect(store.getSnapshot()).toMatchObject({ connected: false, overdue: true });
  });

  it("never marks a model overdue that arrives in time", async () => {
    vi.useFakeTimers();
    const { store, streams } = storeWithStream();
    store.subscribe(() => {});
    streams[0]!.emit("model", { live: true });
    await vi.advanceTimersByTimeAsync(10 * EXPLAIN_AFTER_MS);
    expect(store.getSnapshot().overdue).toBe(false);
  });
});
