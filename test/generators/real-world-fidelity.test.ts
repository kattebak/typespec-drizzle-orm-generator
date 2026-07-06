import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapFieldToColumn } from "../../src/generators/column-mapper.ts";
import { generateDescribe } from "../../src/generators/describe-generator.ts";
import { resolveDialect } from "../../src/generators/dialect.ts";
import { generateSchema } from "../../src/generators/schema-generator.ts";
import { buildRelationGraph } from "../../src/ir/relation-graph.ts";
import type { FieldDef, TableDef } from "../../src/ir/types.ts";

const pg = resolveDialect("pg");
const sqlite = resolveDialect("sqlite");

function baseField(name: string, over: Partial<FieldDef>): FieldDef {
  return {
    name,
    columnName: name.replace(/([A-Z])/g, "_$1").toLowerCase(),
    type: { kind: "text" },
    nullable: false,
    createdAt: false,
    updatedAt: false,
    ...over,
  };
}

describe("composite primary key describe", () => {
  const editionLocale: TableDef = {
    name: "EditionLocale",
    service: "bookstore",
    tableName: "edition_locales",
    primaryKey: {
      tableName: "edition_locales",
      columns: ["editionId", "languageCode"],
      isComposite: true,
    },
    isJunction: false,
    fields: [
      baseField("editionId", {
        columnName: "edition_id",
        type: { kind: "uuid", encoding: "base36" },
      }),
      baseField("languageCode", { columnName: "language_code" }),
      baseField("translatedTitle", { columnName: "translated_title" }),
    ],
    foreignKeys: [],
    indexes: [],
    uniqueConstraints: [],
  };

  const output = generateDescribe([editionLocale], buildRelationGraph([editionLocale]));

  it("emits one parameter per primary-key column", () => {
    assert.ok(output.includes("  editionId: string,"));
    assert.ok(output.includes("  languageCode: string,"));
  });

  it("filters on every primary-key column", () => {
    assert.ok(output.includes("where: { editionId, languageCode }"));
  });
});

describe("jsonb columns", () => {
  const bookExtra: TableDef = {
    name: "BookExtra",
    service: "bookstore",
    tableName: "book_extras",
    primaryKey: { tableName: "book_extras", columns: ["bookExtraId"], isComposite: false },
    isJunction: false,
    fields: [
      baseField("bookExtraId", {
        columnName: "book_extra_id",
        type: { kind: "uuid", encoding: "base36" },
      }),
      baseField("metadata", { type: { kind: "jsonb" } }),
      baseField("tags", { type: { kind: "jsonb" }, nullable: true }),
    ],
    foreignKeys: [],
    indexes: [],
    uniqueConstraints: [],
  };

  it("emits jsonb for pg", () => {
    const output = generateSchema([bookExtra], [], pg);
    assert.ok(output.includes('metadata: jsonb("metadata").notNull(),'));
    assert.ok(output.includes('tags: jsonb("tags"),'));
    assert.ok(output.includes("jsonb,"));
  });

  it("maps jsonb to json-mode text for sqlite", () => {
    const output = generateSchema([bookExtra], [], sqlite);
    assert.ok(output.includes('metadata: text("metadata", { mode: "json" }).notNull(),'));
    assert.ok(output.includes('tags: text("tags", { mode: "json" }),'));
  });
});

describe("varchar columns", () => {
  const shortName: TableDef = {
    name: "ShortName",
    service: "bookstore",
    tableName: "short_names",
    primaryKey: { tableName: "short_names", columns: ["shortNameId"], isComposite: false },
    isJunction: false,
    fields: [
      baseField("shortNameId", {
        columnName: "short_name_id",
        type: { kind: "uuid", encoding: "base36" },
      }),
      baseField("name", { type: { kind: "varchar", length: 64 } }),
    ],
    foreignKeys: [],
    indexes: [],
    uniqueConstraints: [],
  };

  it("emits varchar with length for pg", () => {
    const output = generateSchema([shortName], [], pg);
    assert.ok(output.includes('name: varchar("name", { length: 64 }).notNull(),'));
  });

  it("maps varchar to text with length for sqlite", () => {
    const output = generateSchema([shortName], [], sqlite);
    assert.ok(output.includes('name: text("name", { length: 64 }).notNull(),'));
  });
});

describe("textEnum columns", () => {
  const row: TableDef = {
    name: "Row",
    service: "s",
    tableName: "rows",
    primaryKey: { tableName: "rows", columns: ["rowId"], isComposite: false },
    isJunction: false,
    fields: [
      baseField("rowId", { columnName: "row_id", type: { kind: "uuid", encoding: "base36" } }),
      baseField("status", { type: { kind: "textEnum", values: ["active", "deleted"] } }),
      baseField("phase", {
        type: { kind: "textEnum", values: ["idle", "done"] },
        nullable: true,
      }),
    ],
    foreignKeys: [],
    indexes: [],
    uniqueConstraints: [],
  };

  it("emits a text column with a $type union for a non-null enum", () => {
    const output = generateSchema([row], [], pg);
    assert.ok(output.includes('status: text("status").$type<"active" | "deleted">().notNull(),'));
  });

  it("keeps the $type union on a nullable enum (no notNull)", () => {
    const output = generateSchema([row], [], pg);
    assert.ok(output.includes('phase: text("phase").$type<"idle" | "done">(),'));
  });

  it("declares no pgEnum for text-backed enums", () => {
    const output = generateSchema([row], [], pg);
    assert.ok(!output.includes("pgEnum"));
  });
});

describe("onDelete referential action", () => {
  function tableFor(field: FieldDef): TableDef {
    return {
      name: "Fk",
      service: "bookstore",
      tableName: "fks",
      primaryKey: { tableName: "fks", columns: ["fkId"], isComposite: false },
      isJunction: false,
      fields: [field],
      foreignKeys: [],
      indexes: [],
      uniqueConstraints: [],
    };
  }

  it("emits the onDelete option when set", () => {
    const field = baseField("bookId", {
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      references: { tableName: "Book", fieldName: "bookId", onDelete: "cascade" },
    });
    const col = mapFieldToColumn(field, tableFor(field), pg);
    assert.ok(col.includes('.references(() => books.bookId, { onDelete: "cascade" })'));
  });

  it("emits a bare reference when no policy is set", () => {
    const field = baseField("translatorId", {
      columnName: "translator_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: true,
      references: { tableName: "Translator", fieldName: "translatorId" },
    });
    const col = mapFieldToColumn(field, tableFor(field), pg);
    assert.ok(col.includes(".references(() => translators.translatorId)"));
    assert.ok(!col.includes("onDelete"));
  });
});
