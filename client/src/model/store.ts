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

/** How the store finds out whether the server answers, and reloads the page once it does. */
export interface Recovery {
  /** Whether the server answers at all, with any status. */
  answers(): Promise<boolean>;
  reload(): void;
}

/** How long the stream has to be lost before the store starts asking whether the server answers. */
export const RELOAD_AFTER_MS = 30_000;
/** How often it asks after that. */
export const CHECK_EVERY_MS = 5_000;

const browserRecovery: Recovery = {
  answers: () => fetch("/", { cache: "no-store" }).then(() => true, () => false),
  reload: () => window.location.reload(),
};

// The browser's copy of the system model, kept current from the server's
// event stream while anything is subscribed. Each change produces a new
// state object, so React sees it as changed.
//
// EventSource reconnects on its own, but gives up for good when the server
// answers with anything other than the stream, such as its page saying a
// newer release is needed. So once the stream has been lost for a while, the
// store asks every few seconds whether the server answers at all, and
// reloads the page as soon as it does, to show whatever the server serves
// now. It never reloads while the server does not answer: the browser would
// put its own page up instead, which never tries again.
export class SystemStore {
  private state: SystemState = { model: null, connected: false };
  private readonly listeners = new Set<() => void>();
  private stream: EventStream | null = null;
  private readonly url: string;
  private readonly open: (url: string) => EventStream;
  private readonly recovery: Recovery;
  /** The timer that next asks whether the server answers, while the stream is lost. */
  private waiting: ReturnType<typeof setTimeout> | null = null;

  constructor(url = "/api/system/events", open: (url: string) => EventStream = (u) => new EventSource(u),
    recovery: Recovery = browserRecovery) {
    this.url = url;
    this.open = open;
    this.recovery = recovery;
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
      this.found();
      this.set({ model: JSON.parse((event as MessageEvent<string>).data) as System, connected: true });
    });
    stream.addEventListener("patch", (event) => {
      if (this.state.model !== null) {
        const patch: unknown = JSON.parse((event as MessageEvent<string>).data);
        this.found();
        this.set({ model: applyPatch(this.state.model, patch), connected: true });
      }
    });
    // The server starts every stream with the whole model, so a lost
    // connection only needs to be shown until the stream is back.
    stream.addEventListener("error", () => {
      this.lost();
      if (this.state.connected) {
        this.set({ ...this.state, connected: false });
      }
    });
    this.stream = stream;
  }

  private disconnect(): void {
    this.found();
    this.stream?.close();
    this.stream = null;
    this.set({ ...this.state, connected: false });
  }

  /** The stream is lost: unless it is already, the store starts its wait before asking after the server. */
  private lost(): void {
    if (this.waiting === null) {
      this.waiting = setTimeout(() => void this.check(), RELOAD_AFTER_MS);
    }
  }

  /** The stream is back, or nothing reads it any more: the store stops asking. */
  private found(): void {
    if (this.waiting !== null) {
      clearTimeout(this.waiting);
      this.waiting = null;
    }
  }

  private async check(): Promise<void> {
    const answers = await this.recovery.answers();
    // The stream may have come back while the store was asking.
    if (this.waiting === null) {
      return;
    }
    if (answers) {
      this.waiting = null;
      this.recovery.reload();
    } else {
      this.waiting = setTimeout(() => void this.check(), CHECK_EVERY_MS);
    }
  }

  private set(state: SystemState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
