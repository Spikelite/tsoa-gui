import { applyPatch } from "./patch";
import type { System } from "./system";

export interface SystemState {
  /** The latest model, or null before the first one arrives. */
  model: System | null;
  /** Whether the stream from the server is open. The model's own `live` says whether the server hears the device. */
  connected: boolean;
}

interface EventStream {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

// The browser's copy of the system model, kept current from the server's
// event stream while anything is subscribed. Each change produces a new
// state object, so React sees it as changed.
export class SystemStore {
  private state: SystemState = { model: null, connected: false };
  private readonly listeners = new Set<() => void>();
  private stream: EventStream | null = null;
  private readonly url: string;
  private readonly open: (url: string) => EventStream;

  constructor(url = "/api/system/events", open: (url: string) => EventStream = (u) => new EventSource(u)) {
    this.url = url;
    this.open = open;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.stream === null) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  };

  getSnapshot = (): SystemState => this.state;

  private connect(): void {
    const stream = this.open(this.url);
    stream.addEventListener("model", (event) => {
      this.set({ model: JSON.parse((event as MessageEvent<string>).data) as System, connected: true });
    });
    stream.addEventListener("patch", (event) => {
      if (this.state.model !== null) {
        const patch: unknown = JSON.parse((event as MessageEvent<string>).data);
        this.set({ model: applyPatch(this.state.model, patch), connected: true });
      }
    });
    // EventSource reconnects on its own, and the server starts every stream
    // with the whole model, so a lost connection only needs to be shown.
    stream.addEventListener("error", () => {
      if (this.state.connected) {
        this.set({ ...this.state, connected: false });
      }
    });
    this.stream = stream;
  }

  private disconnect(): void {
    this.stream?.close();
    this.stream = null;
    this.set({ ...this.state, connected: false });
  }

  private set(state: SystemState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
