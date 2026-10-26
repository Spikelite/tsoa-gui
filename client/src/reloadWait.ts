/** How long the page waits before reloading after a skin fails to draw. */
export const FIRST_WAIT_MS = 10_000;
/** The longest it waits, and how long after a reload a failure counts as coming straight back. */
export const LONGEST_WAIT_MS = 5 * 60_000;

const STORAGE_KEY = "tsoa-gui.reload";

// A failure that comes straight back after the reload would reload the page
// in a loop, so the tab remembers when it last reloaded for one and how long
// it waited, and a failure within LONGEST_WAIT_MS of that reload waits twice
// as long. Without storage, as in a private window, every wait is the first.

/** How long to wait before reloading for a failure now, remembering the reload that follows it. */
export function reloadWait(storage: Pick<Storage, "getItem" | "setItem"> | null, now: number): number {
  const last = lastReload(storage);
  const wait = last !== null && now - last.at < LONGEST_WAIT_MS ? Math.min(last.wait * 2, LONGEST_WAIT_MS)
    : FIRST_WAIT_MS;
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ at: now + wait, wait }));
  } catch {
    // Storage can be full or off; the wait still holds for this page.
  }
  return wait;
}

function lastReload(storage: Pick<Storage, "getItem"> | null): { at: number; wait: number } | null {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (typeof saved === "object" && saved !== null && "at" in saved && "wait" in saved
      && typeof saved.at === "number" && typeof saved.wait === "number" && saved.wait > 0) {
      return { at: saved.at, wait: saved.wait };
    }
  } catch {
    // Unreadable is the same as nothing saved.
  }
  return null;
}
