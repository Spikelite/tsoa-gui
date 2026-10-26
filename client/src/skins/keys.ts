// Labels, titles and names can come from a device, which may report two
// that are the same: a temperature sensor it calls "Battery" beside the
// battery's own reading, say. React keys have to differ within a list, or it
// can draw one row's value in the other's place, so each name is keyed with
// how many times it has come before in its list. The count ends at the first
// colon, so no two names make the same key, and a row keeps its key when
// rows with other names come and go around it.

/** A React key for each of these names, in order, no two the same. */
export function keysFor(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const before = seen.get(name) ?? 0;
    seen.set(name, before + 1);
    return `${before}:${name}`;
  });
}
