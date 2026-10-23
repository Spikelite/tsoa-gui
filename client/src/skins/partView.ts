import { useEffect, useSyncExternalStore } from "react";

import type { PartName } from "../model/system";

// Which part's own page is showing, kept in the address as ?part= so that a
// kiosk can open straight onto one and the browser's back button returns to
// the overview. Opening a page adds a step to the browser's history; closing
// one goes back over it, or, on a page the browser opened directly, drops
// ?part= from the address in place.

const PARAM = "part";
const CHANGE = "tsoa-gui-part";
const PARTS: PartName[] = ["grid", "generator", "inverter_charger", "battery", "solar", "ac_loads", "dc_loads"];

/** Where on the screen the page was opened from, as shares of the viewport, for a skin that zooms out of it. */
export type Origin = { x: number; y: number };
let origin: Origin | null = null;

function current(): PartName | null {
  const value = new URLSearchParams(window.location.search).get(PARAM);
  return PARTS.find((part) => part === value) ?? null;
}

function subscribe(changed: () => void): () => void {
  window.addEventListener("popstate", changed);
  window.addEventListener(CHANGE, changed);
  return () => {
    window.removeEventListener("popstate", changed);
    window.removeEventListener(CHANGE, changed);
  };
}

function addressWith(part: PartName | null): string {
  const url = new URL(window.location.href);
  if (part === null) {
    url.searchParams.delete(PARAM);
  } else {
    url.searchParams.set(PARAM, part);
  }
  return url.toString();
}

/** The address of a part's page, for a link to it. */
export function partAddress(part: PartName): string {
  return addressWith(part);
}

export function openPart(part: PartName, from?: Element | null) {
  const box = from?.getBoundingClientRect();
  origin = box ? { x: (box.left + box.width / 2) / window.innerWidth, y: (box.top + box.height / 2) / window.innerHeight } : null;
  window.history.pushState({ [CHANGE]: true }, "", addressWith(part));
  window.dispatchEvent(new Event(CHANGE));
}

export function closePart() {
  origin = null;
  if ((window.history.state as Record<string, unknown> | null)?.[CHANGE]) {
    window.history.back();
  } else {
    window.history.replaceState(null, "", addressWith(null));
    window.dispatchEvent(new Event(CHANGE));
  }
}

export function usePart(): PartName | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/** Where the page showing now was opened from, if it was opened by a click. */
export function openedFrom(): Origin | null {
  return origin;
}

/** Closes a part's page on Escape, as a skin showing one should. */
export function useEscapeCloses(open: boolean) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        closePart();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
}
