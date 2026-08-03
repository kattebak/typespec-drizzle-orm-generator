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

  it("imports nothing beyond the drizzle core module", () => {
    const imports = typesOutput.split("\n").filter((line) => line.startsWith("import"));
    assert.deepEqual(imports, [
      'import { customType } from "drizzle-orm/pg-core";',
      'import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";',
      'import type { relations } from "./relations.js";',
    ]);
  });

  it("converts through its own codec rather than a runtime dependency", () => {
    assert.ok(typesOutput.includes("function base36ToBytes(id: string): Uint8Array {"));
    assert.ok(typesOutput.includes("function bytesToBase36(bytes: Uint8Array): string {"));
    assert.ok(!typesOutput.includes("short-uuid"));
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
      typesOutput.includes(
        "toDriver: (value: string): string => bytesToUuid(base36ToBytes(value)),",
      ),
    );
    assert.ok(
      typesOutput.includes(
        "fromDriver: (value: string): string => bytesToBase36(uuidToBytes(value)),",
      ),
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
    assert.ok(typesOutput.includes("crypto.getRandomValues(bytes);"));
    assert.ok(typesOutput.includes("return bytesToBase36(bytes);"));
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

  it("nullableBigint coerces the string driver value to a number", () => {
    assert.ok(typesOutput.includes("export const nullableBigint = customType<{"));
    assert.ok(typesOutput.includes("  data: number | undefined;"));
    assert.ok(typesOutput.includes("  driverData: number | string | null;"));
    assert.ok(typesOutput.includes("fromDriver: (v) => (v == null ? undefined : Number(v)),"));
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

describe("uuid custom types per encoding", () => {
  const sqliteTypes = generateTypes(resolveDialect("sqlite"));

  it("emits a distinct custom type for every encoding on both dialects", () => {
    for (const name of ["canonicalUuid", "base36Uuid", "rawUuid"]) {
      assert.ok(typesOutput.includes(`export const ${name} = customType<{`), `pg missing ${name}`);
      assert.ok(
        sqliteTypes.includes(`export const ${name} = customType<{`),
        `sqlite missing ${name}`,
      );
    }
  });

  it("stores base36 verbatim rather than expanding it to a UUID", () => {
    const base36Block = sqliteTypes.slice(sqliteTypes.indexOf("export const base36Uuid"));
    const declaration = base36Block.slice(0, base36Block.indexOf("});"));
    assert.ok(declaration.includes('dataType: () => "text",'));
    assert.ok(!declaration.includes("toUUID"));
    assert.ok(!declaration.includes("fromUUID"));
  });

  it("stores raw uuids as a 16-byte blob on SQLite, with no hex form in between", () => {
    assert.ok(sqliteTypes.includes('dataType: () => "blob",'));
    assert.ok(
      sqliteTypes.includes("toDriver: (value: string): Uint8Array => base36ToBytes(value),"),
    );
    assert.ok(
      sqliteTypes.includes("fromDriver: (value: Uint8Array): string => bytesToBase36(value),"),
    );
  });

  it("stores raw uuids in the native pg uuid type", () => {
    const rawBlock = typesOutput.slice(typesOutput.indexOf("export const rawUuid"));
    assert.ok(rawBlock.slice(0, rawBlock.indexOf("});")).includes('dataType: () => "uuid",'));
  });

  it("exports a nullableBlob wrapper on SQLite only", () => {
    assert.ok(sqliteTypes.includes("export const nullableBlob = customType<{"));
    assert.ok(sqliteTypes.includes("  data: Uint8Array | undefined;"));
    assert.ok(!typesOutput.includes("nullableBlob"));
  });
});
