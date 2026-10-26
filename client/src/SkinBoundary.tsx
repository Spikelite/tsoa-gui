import { Component, type ReactNode } from "react";

import { reloadWait } from "./reloadWait";

/** How the boundary reloads the page, and where the tab remembers its reloads. */
export interface Reloading {
  reload(): void;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
}

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const browserReloading: Reloading = {
  reload: () => window.location.reload(),
  get storage() {
    return tabStorage();
  },
};

// A skin that throws while drawing would otherwise take the whole page with
// it and leave it blank, and since the event stream stays open, nothing else
// ever reloads it. On a kiosk nobody is there to, so the boundary says what
// happened in place of the skin and reloads the page itself.
export class SkinBoundary extends Component<{ children: ReactNode; reloading?: Reloading }, { failed: boolean }> {
  state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    if (this.timer !== null) {
      return;
    }
    const reloading = this.props.reloading ?? browserReloading;
    this.timer = setTimeout(() => reloading.reload(), reloadWait(reloading.storage, Date.now()));
  }

  componentWillUnmount(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  render(): ReactNode {
    return this.state.failed ? (
      <p className="waiting" role="alert">Something went wrong drawing this page. Reloading in a moment.</p>
    ) : (
      this.props.children
    );
  }
}
