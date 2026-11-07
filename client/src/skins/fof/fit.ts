import { useLayoutEffect, type RefObject } from "react";

/** The well's width on a screen no wider than 16:9, in the frame's text. Past it, a page has width to spare. */
const USUAL_WIDTH_EM = 82;
/** As large as a page's text goes, however few readings it has. */
const LARGEST = 2;
const NARROWEST_COLUMN = "17.5em";
/** How many times the search for the largest text halves the range it has left. */
const STEPS = 7;

/** The height a page has in the well. */
function roomIn(well: HTMLElement): number {
  const { paddingTop, paddingBottom } = getComputedStyle(well);
  return well.clientHeight - parseFloat(paddingTop) - parseFloat(paddingBottom);
}

function draw(page: HTMLElement, scale: number, columns: string) {
  page.style.setProperty("--fof-fit", String(scale));
  page.style.setProperty("--fof-columns", columns);
}

function clear(page: HTMLElement) {
  page.style.removeProperty("--fof-fit");
  page.style.removeProperty("--fof-columns");
}

/**
 * Draws a page as large as it fits a window wider than the screens it was laid
 * out for. Its text follows the frame's, which follows the window's height
 * there, so the width to spare would go unused. Spread over more columns, the
 * sections need less height, which lets the text grow, which needs more width,
 * so the only way to the answer is to try it. The page's own height is what is
 * measured, since the well's scroll height moves with the page's zoom.
 */
function fit(page: HTMLElement, well: HTMLElement) {
  clear(page);
  const sections = page.querySelector(".fof-deck-groups")?.children;
  const spare = well.clientWidth / parseFloat(getComputedStyle(well).fontSize) / USUAL_WIDTH_EM;
  if (sections === undefined || !(spare > 1)) {
    return;
  }
  const room = roomIn(well);
  const spread = `${NARROWEST_COLUMN} ${sections.length}`;
  const fits = (scale: number) => {
    draw(page, scale, spread);
    return page.offsetHeight <= room;
  };
  let low = 1;
  let high = Math.min(LARGEST, spare);
  for (let step = 0; step < STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const scale = Math.floor(low * 100) / 100;
  fits(scale);
  // A tall section can leave the last columns empty, so those that hold anything take their width.
  const used = new Set([...sections].map((section) => (section as HTMLElement).offsetLeft)).size;
  draw(page, scale, String(used));
}

/** Keeps a page fitted to its window, and to readings that make it taller. `part` is what it shows, since one page can follow another in the same element. */
export function useFittedPage(page: RefObject<HTMLElement | null>, active: boolean, part: string): void {
  useLayoutEffect(() => {
    const element = page.current;
    const well = element?.closest<HTMLElement>(".fof-well");
    if (!active || !element || !well) {
      return;
    }
    const refit = () => fit(element, well);
    refit();
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(refit) : null;
    resized?.observe(well);
    // The first layout can be in a fallback face, which runs wider than the skin's own.
    if ("fonts" in document) {
      void document.fonts.ready.then(refit);
    }
    return () => {
      resized?.disconnect();
      clear(element);
    };
  }, [page, active, part]);

  useLayoutEffect(() => {
    const element = page.current;
    const well = element?.closest<HTMLElement>(".fof-well");
    if (active && element && well && element.offsetHeight > roomIn(well)) {
      fit(element, well);
    }
  });
}
