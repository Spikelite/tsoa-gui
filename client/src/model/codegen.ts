import { compile, type JSONSchema } from "json-schema-to-typescript";

// The server's pydantic models are the one definition of the system model.
// system.ts is generated from their JSON Schema with these settings, and the
// test beside this file fails when the two drift apart.
const BANNER = "/* Generated from system.schema.json by `npm run model`. Do not edit by hand. */";

export function generateModelTypes(schema: JSONSchema): Promise<string> {
  return compile(schema, "System", {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
  });
}
