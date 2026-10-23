import { lazy, type ComponentType } from "react";

import type { System } from "../model/system";
import { MinimalSkin } from "./minimal/MinimalSkin";

export interface Skin {
  id: string;
  name: string;
  /** `connected` is false while the page has lost its connection to the server. */
  component: ComponentType<{ model: System; connected: boolean }>;
  /**
   * The skin shows the application's name, the time of day and the skin
   * choice in its own frame, in place of the page header's.
   */
  framed?: boolean;
}

export const DEFAULT_SKIN = "minimal";

// The default skin ships with the page. The others load only when chosen, so
// a screen showing the minimal skin never downloads them.
export const SKINS: Skin[] = [
  { id: "minimal", name: "Minimal", component: MinimalSkin },
  {
    id: "sci-fi-fof",
    name: "Sci-Fi FOF",
    framed: true,
    component: lazy(() => import("./fof/FofSkin").then((module) => ({ default: module.FofSkin }))),
  },
];

const STORAGE_KEY = "tsoa-gui.skin";

/**
 * The skin to show. A kiosk screen opens a fixed address and has nobody to
 * click, so `?skin=` in the address wins; otherwise the browser's last choice;
 * otherwise the default. An unknown name falls through to the next.
 */
export function chosenSkin(search: string, storage: Pick<Storage, "getItem"> | null): string {
  const known = new Set(SKINS.map((skin) => skin.id));
  const fromAddress = new URLSearchParams(search).get("skin");
  if (fromAddress !== null && known.has(fromAddress)) {
    return fromAddress;
  }
  let saved: string | null = null;
  try {
    saved = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Storage can be off, as in a private window; then nothing is remembered.
  }
  return saved !== null && known.has(saved) ? saved : DEFAULT_SKIN;
}

export function rememberSkin(id: string, storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(STORAGE_KEY, id);
  } catch {
    // As above: without storage, the choice lasts until the page closes.
  }
}

/** The address with its `?skin=` replaced, if it has one, so a reload keeps the choice. */
export function addressWithSkin(href: string, id: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("skin")) {
    return null;
  }
  url.searchParams.set("skin", id);
  return url.toString();
}
