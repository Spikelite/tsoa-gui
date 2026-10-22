import type { System } from "../model/system";

// How current the readings on screen are. Old readings are never passed off
// as current: every skin says so, the minimal one in a notice under its
// header and a framed one in its own frame.
export type Link = "live" | "stale" | "lost";

export function link(model: System, connected: boolean): Link {
  return !connected ? "lost" : model.live ? "live" : "stale";
}

/** One word for the link, for a skin with room for no more. */
export const LINK_WORDS: Record<Link, string> = { live: "Live", stale: "Stale", lost: "Offline" };

/** What the link means, in full. */
export const LINK_SENTENCES: Record<Link, string> = {
  live: "The readings are live.",
  stale: "The server has stopped hearing from the device. These are the last readings it had.",
  lost: "Lost the connection to the server. These are the last readings it sent.",
};
