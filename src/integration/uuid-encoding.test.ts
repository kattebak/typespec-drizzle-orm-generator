import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import short from "short-uuid";
import { assemblePackage } from "../assembler.ts";
import type { Dialect } from "../generators/dialect.ts";
import type { FieldDef, TableDef } from "../ir/types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputRoot = join(repoRoot, ".tmp", "uuid-encoding");
const translator = short(short.constants.uuid25Base36);

function uuidField(name: string, encoding: "base36" | "canonical" | "raw"): FieldDef {
  return {
    name: `${encoding}Id`,
    columnName: name,
    type: { kind: "uuid", encoding },
    uuid: { encoding, autoGenerate: false },
    nullable: false,
    createdAt: false,
    updatedAt: false,
  };
}

const tokens: TableDef = {
  name: "Token",
  service: "auth",
  tableName: "tokens",
  primaryKey: { tableName: "tokens", columns: ["tokenId"], isComposite: false },
  fields: [
    {
      name: "tokenId",
      columnName: "token_id",
      type: { kind: "text" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    uuidField("canonical_id", "canonical"),
    uuidField("base36_id", "base36"),
    uuidField("raw_id", "raw"),
    {
      name: "payload",
      columnName: "payload",
      type: { kind: "blob" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

interface UuidColumn {
  getSQLType(): string;
  mapToDriverValue(value: string): unknown;
  mapFromDriverValue(value: unknown): string;
}

interface GeneratedSchema {
  tokens: Record<string, UuidColumn>;
}

function isGeneratedSchema(value: unknown): value is GeneratedSchema {
  if (typeof value !== "object" || value === null) return false;
  const table = (value as Record<string, unknown>).tokens;
  return typeof table === "object" && table !== null;
}

async function emitSchema(dialect: Dialect): Promise<GeneratedSchema> {
  const outputDir = join(outputRoot, dialect);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const files = assemblePackage([tokens], [], {
    packageName: `@uuid-encoding/${dialect}`,
    packageVersion: "0.0.0",
    dialect,
    pluralize: true,
    schemaOnly: true,
  });

  for (const name of ["types.ts", "schema.ts"]) {
    const content = files.get(name);
    assert.ok(content, `Missing ${name}`);
    await writeFile(join(outputDir, name), content);
  }

  const loaded: unknown = await import(pathToFileURL(join(outputDir, "schema.ts")).href);
  assert.ok(isGeneratedSchema(loaded));
  return loaded;
}

after(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

describe("uuid encodings on SQLite", () => {
  it("stores each encoding in its own form and reads every one back as base36", async () => {
    const schema = await emitSchema("sqlite");

    assert.equal(schema.tokens.canonicalId.getSQLType(), "text");
    assert.equal(schema.tokens.base36Id.getSQLType(), "text");
    assert.equal(schema.tokens.rawId.getSQLType(), "blob");
    assert.equal(schema.tokens.payload.getSQLType(), "blob");

    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tokens (
        token_id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        base36_id TEXT NOT NULL,
        raw_id BLOB NOT NULL,
        payload BLOB NOT NULL
      );
    `);
    const db = drizzle({ client: sqlite });

    const id = translator.new();
    const canonical = translator.toUUID(id);

    db.insert(schema.tokens)
      .values({
        tokenId: "token-1",
        canonicalId: id,
        base36Id: id,
        rawId: id,
        payload: new Uint8Array([1, 2, 3]),
      })
      .run();

    const rows = db.select().from(schema.tokens).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].canonicalId, id);
    assert.equal(rows[0].base36Id, id);
    assert.equal(rows[0].rawId, id);

    const stored = sqlite
      .prepare(`
        SELECT
          typeof(canonical_id) AS canonicalType,
          length(canonical_id) AS canonicalLength,
          canonical_id AS canonicalValue,
          typeof(base36_id) AS base36Type,
          length(base36_id) AS base36Length,
          base36_id AS base36Value,
          typeof(raw_id) AS rawType,
          length(raw_id) AS rawLength,
          lower(hex(raw_id)) AS rawHex
        FROM tokens
      `)
      .get();

    assert.deepEqual(stored, {
      canonicalType: "text",
      canonicalLength: 36,
      canonicalValue: canonical,
      base36Type: "text",
      base36Length: 25,
      base36Value: id,
      rawType: "blob",
      rawLength: 16,
      rawHex: canonical.replace(/-/g, ""),
    });
  });

  it("round-trips ids whose canonical form has leading zero bytes", async () => {
    const schema = await emitSchema("sqlite");
    const sqlite = new Database(":memory:");
    sqlite.exec(
      "CREATE TABLE tokens (token_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL, base36_id TEXT NOT NULL, raw_id BLOB NOT NULL, payload BLOB NOT NULL);",
    );
    const db = drizzle({ client: sqlite });

    const canonical = "00000000-0000-4000-8000-0000000000ff";
    const id = translator.fromUUID(canonical);

    db.insert(schema.tokens)
      .values({
        tokenId: "token-2",
        canonicalId: id,
        base36Id: id,
        rawId: id,
        payload: new Uint8Array(),
      })
      .run();

    const rows = db.select().from(schema.tokens).all();
    assert.equal(rows[0].rawId, id);
    assert.equal(rows[0].canonicalId, id);
    assert.equal(rows[0].base36Id, id);

    const raw = sqlite
      .prepare("SELECT lower(hex(raw_id)) AS hex, length(raw_id) AS len FROM tokens")
      .get();
    assert.deepEqual(raw, { hex: canonical.replace(/-/g, ""), len: 16 });
  });
});

describe("uuid encodings on PostgreSQL", () => {
  it("maps each encoding to its column type and round-trips through the driver", async () => {
    const schema = await emitSchema("pg");

    assert.equal(schema.tokens.canonicalId.getSQLType(), "uuid");
    assert.equal(schema.tokens.base36Id.getSQLType(), "text");
    assert.equal(schema.tokens.rawId.getSQLType(), "uuid");
    assert.equal(schema.tokens.payload.getSQLType(), "bytea");

    const id = translator.new();
    const canonical = translator.toUUID(id);

    for (const [column, driverValue] of [
      [schema.tokens.canonicalId, canonical],
      [schema.tokens.base36Id, id],
      [schema.tokens.rawId, canonical],
    ] as const) {
      assert.equal(column.mapToDriverValue(id), driverValue);
      assert.equal(column.mapFromDriverValue(driverValue), id);
    }
  });
});
