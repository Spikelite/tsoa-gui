// Applies a patch from the server's event stream to the model. A patch has
// the model's shape but holds only what changed: objects on both sides are
// merged key by key, and anything else, arrays included, is replaced whole.
// Unlike a JSON merge patch, null sets a value to null; the model always has
// every key, and null is how it says a reading is not known.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge(target: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    result[key] = isObject(value) && isObject(current) ? merge(current, value) : value;
  }
  return result;
}

export function applyPatch<T extends object>(model: T, patch: unknown): T {
  if (!isObject(patch)) {
    throw new Error("a patch must be an object");
  }
  return merge(model as unknown as JsonObject, patch) as unknown as T;
}
