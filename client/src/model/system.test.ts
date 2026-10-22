// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { generateModelTypes } from "./codegen";

describe("system.ts", () => {
  it("is what the current schema generates", async () => {
    const read = (name: string) => readFile(new URL(name, import.meta.url), "utf8");
    const schema = JSON.parse(await read("./system.schema.json"));
    expect(await generateModelTypes(schema)).toBe(await read("./system.ts"));
  });
});
