// Regenerates src/model/system.ts from src/model/system.schema.json, which the
// server writes with `python -m tsoa_gui.schema`.
import { readFile, writeFile } from "node:fs/promises";

import { generateModelTypes } from "../src/model/codegen.ts";

const model = new URL("../src/model/", import.meta.url);
const schema = JSON.parse(await readFile(new URL("system.schema.json", model), "utf8"));
await writeFile(new URL("system.ts", model), await generateModelTypes(schema));
console.log("wrote src/model/system.ts");
