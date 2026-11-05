import { createContext, useSyncExternalStore } from "react";

/** A landscape screen too small for the console's usual layout, which fof.css gives a shape of its own. */
const SMALL_PANEL = "(orientation: landscape) and (max-height: 610px), (orientation: landscape) and (max-width: 900px)";

const media = (query: string) => (typeof matchMedia === "function" ? matchMedia(query) : null);

function useMedia(query: string): boolean {
  return useSyncExternalStore((changed) => {
    const list = media(query);
    list?.addEventListener?.("change", changed);
    return () => list?.removeEventListener?.("change", changed);
  }, () => media(query)?.matches ?? false);
}

/** Whether the screen is a small panel, where a part's page shows one section at a time. */
export const useSmallPanel = () => useMedia(SMALL_PANEL);

/** Whether the screen is held upright, with no room for the diagram. */
export const useUpright = () => useMedia("(orientation: portrait)");

/** The one section a part's page is showing, or null for all of them. */
export const SectionContext = createContext<string | null>(null);
