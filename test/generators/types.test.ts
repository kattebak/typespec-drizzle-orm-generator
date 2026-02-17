import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateIndex } from "../../src/generators/index-generator.ts";
import { generateTypes } from "../../src/generators/types-generator.ts";

const typesOutput = generateTypes();
const indexOutput = generateIndex();

describe("types generator", () => {
  it("imports customType from drizzle-orm/pg-core", () => {
    assert.ok(typesOutput.includes('import { customType } from "drizzle-orm/pg-core";'));
  });

  it("imports short-uuid", () => {
    assert.ok(typesOutput.includes('import short from "short-uuid";'));
  });

  it("creates base36 translator", () => {
    assert.ok(typesOutput.includes("const translator = short(short.constants.uuid25Base36);"));
  });

  it("exports base36Uuid custom type", () => {
    assert.ok(typesOutput.includes("export const base36Uuid = customType<{"));
    assert.ok(typesOutput.includes("  data: string;"));
    assert.ok(typesOutput.includes("  driverData: string;"));
  });

  it("includes dataType returning uuid", () => {
    assert.ok(typesOutput.includes('dataType: () => "uuid",'));
  });

  it("includes toDriver and fromDriver", () => {
    assert.ok(
      typesOutput.includes("toDriver: (value: string): string => translator.toUUID(value),"),
    );
    assert.ok(
      typesOutput.includes("fromDriver: (value: string): string => translator.fromUUID(value),"),
    );
  });

  it("exports DrizzleClient type alias", () => {
    assert.ok(typesOutput.includes("export type DrizzleClient ="));
  });

  it("imports relations for DrizzleClient type", () => {
    assert.ok(typesOutput.includes('import type { relations } from "./relations.js";'));
  });
});

describe("index generator", () => {
  it("re-exports types", () => {
    assert.ok(indexOutput.includes('export * from "./types.js";'));
  });

  it("re-exports schema", () => {
    assert.ok(indexOutput.includes('export * from "./schema.js";'));
  });

  it("re-exports relations", () => {
    assert.ok(indexOutput.includes('export { relations } from "./relations.js";'));
  });

  it("re-exports describe", () => {
    assert.ok(indexOutput.includes('export * from "./describe.js";'));
  });
});
