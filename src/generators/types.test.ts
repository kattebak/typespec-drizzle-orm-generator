import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDialect } from "./dialect.ts";
import { generateIndex } from "./index-generator.ts";
import { generateTypes } from "./types-generator.ts";

const pg = resolveDialect("pg");
const typesOutput = generateTypes(pg);
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

  it("exports DrizzleClient type alias using PgAsyncDatabase", () => {
    assert.ok(typesOutput.includes("export type DrizzleClient = PgAsyncDatabase<"));
  });

  it("imports PgAsyncDatabase and PgQueryResultHKT for DrizzleClient type", () => {
    assert.ok(
      typesOutput.includes(
        'import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";',
      ),
    );
  });

  it("imports relations for DrizzleClient type", () => {
    assert.ok(typesOutput.includes('import type { relations } from "./relations.js";'));
  });

  it("exports generateBase36Id function", () => {
    assert.ok(typesOutput.includes("export function generateBase36Id(): string {"));
    assert.ok(typesOutput.includes("return translator.new();"));
  });

  it("exports nullableText custom type", () => {
    assert.ok(typesOutput.includes("export const nullableText = customType<{"));
    assert.ok(typesOutput.includes("  data: string | undefined;"));
    assert.ok(typesOutput.includes("  driverData: string | null;"));
    assert.ok(typesOutput.includes('dataType: () => "text",'));
    assert.ok(typesOutput.includes("fromDriver: (v) => v ?? undefined,"));
  });

  it("exports nullableInteger custom type", () => {
    assert.ok(typesOutput.includes("export const nullableInteger = customType<{"));
    assert.ok(typesOutput.includes('dataType: () => "integer",'));
  });

  it("exports nullableReal custom type", () => {
    assert.ok(typesOutput.includes("export const nullableReal = customType<{"));
    assert.ok(typesOutput.includes('dataType: () => "real",'));
  });

  it("exports PG-specific nullable wrappers", () => {
    assert.ok(typesOutput.includes("export const nullableBigint = customType<{"));
    assert.ok(typesOutput.includes("export const nullableDoublePrecision = customType<{"));
    assert.ok(typesOutput.includes("export const nullableBoolean = customType<{"));
    assert.ok(typesOutput.includes("export const nullableTimestamp = customType<{"));
  });

  it("nullableTimestamp uses timestamp with time zone dataType", () => {
    assert.ok(typesOutput.includes('dataType: () => "timestamp with time zone",'));
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

describe("types generator (sqlite)", () => {
  const sqlite = resolveDialect("sqlite");
  const output = generateTypes(sqlite);

  it("imports customType from drizzle-orm/sqlite-core", () => {
    assert.ok(output.includes('import { customType } from "drizzle-orm/sqlite-core";'));
  });

  it("includes dataType returning text instead of uuid", () => {
    assert.ok(output.includes('dataType: () => "text",'));
  });

  it("exports base36Uuid custom type", () => {
    assert.ok(output.includes("export const base36Uuid = customType<{"));
  });

  it("includes sqlite-specific comment", () => {
    assert.ok(output.includes("stored as text"));
  });

  it("exports DrizzleClient type alias using BaseSQLiteDatabase", () => {
    assert.ok(output.includes("export type DrizzleClient = BaseSQLiteDatabase<"));
  });

  it("imports BaseSQLiteDatabase for DrizzleClient type", () => {
    assert.ok(
      output.includes('import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";'),
    );
  });

  it("exports generateBase36Id function", () => {
    assert.ok(output.includes("export function generateBase36Id(): string {"));
  });

  it("exports nullableText custom type for SQLite", () => {
    assert.ok(output.includes("export const nullableText = customType<{"));
    assert.ok(output.includes('dataType: () => "text",'));
  });

  it("exports nullableInteger custom type for SQLite", () => {
    assert.ok(output.includes("export const nullableInteger = customType<{"));
    assert.ok(output.includes('dataType: () => "integer",'));
  });

  it("exports nullableReal custom type for SQLite", () => {
    assert.ok(output.includes("export const nullableReal = customType<{"));
    assert.ok(output.includes('dataType: () => "real",'));
  });

  it("does not export PG-specific nullable wrappers", () => {
    assert.ok(!output.includes("nullableBigint"));
    assert.ok(!output.includes("nullableDoublePrecision"));
    assert.ok(!output.includes("nullableBoolean"));
    assert.ok(!output.includes("nullableTimestamp"));
  });
});
