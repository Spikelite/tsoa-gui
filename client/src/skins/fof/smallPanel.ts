import { createContext, useSyncExternalStore } from "react";

/** A landscape screen too small for the console's usual layout, which fof.css gives a shape of its own. */
const SMALL_PANEL = "(orientation: landscape) and (max-height: 610px), (orientation: landscape) and (max-width: 900px)";

const media = () => (typeof matchMedia === "function" ? matchMedia(SMALL_PANEL) : null);

function subscribe(changed: () => void): () => void {
  const query = media();
  query?.addEventListener?.("change", changed);
  return () => query?.removeEventListener?.("change", changed);
}

/** Whether the screen is a small panel, where a part's page shows one section at a time. */
export const useSmallPanel = () => useSyncExternalStore(subscribe, () => media()?.matches ?? false);

/** The one section a part's page is showing, or null for all of them. */
export const SectionContext = createContext<string | null>(null);
