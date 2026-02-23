import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapFieldToColumn } from "../../src/generators/column-mapper.ts";
import { resolveDialect } from "../../src/generators/dialect.ts";
import type { FieldDef, TableDef } from "../../src/ir/types.ts";

const pg = resolveDialect("pg");

/** Minimal table for testing single-column PK fields */
function makeTable(pkColumns: string[], overrides?: Partial<TableDef>): TableDef {
  return {
    name: "Test",
    service: "test",
    tableName: "tests",
    primaryKey: {
      tableName: "tests",
      columns: pkColumns,
      isComposite: pkColumns.length > 1,
    },
    fields: [],
    foreignKeys: [],
    isJunction: false,
    indexes: [],
    uniqueConstraints: [],
    ...overrides,
  };
}

/** Minimal field helper */
function makeField(overrides: Partial<FieldDef>): FieldDef {
  return {
    name: "test",
    columnName: "test",
    type: { kind: "text" },
    nullable: false,
    createdAt: false,
    updatedAt: false,
    ...overrides,
  };
}

describe("column mapper", () => {
  // ===========================================
  // Basic types
  // ===========================================

  it("maps a required text field", () => {
    const field = makeField({
      name: "title",
      columnName: "title",
      type: { kind: "text" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'text("title").notNull()');
  });

  it("maps an optional text field (nullable)", () => {
    const field = makeField({
      name: "bio",
      columnName: "bio",
      type: { kind: "text" },
      nullable: true,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'text("bio")');
  });

  it("maps a required integer field", () => {
    const field = makeField({
      name: "publicationYear",
      columnName: "publication_year",
      type: { kind: "integer" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'integer("publication_year").notNull()');
  });

  it("maps an optional integer field", () => {
    const field = makeField({
      name: "pageCount",
      columnName: "page_count",
      type: { kind: "integer" },
      nullable: true,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'integer("page_count")');
  });

  it("maps a varchar field", () => {
    const field = makeField({
      name: "name",
      columnName: "name",
      type: { kind: "varchar", length: 256 },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'varchar("name", { length: 256 }).notNull()');
  });

  it("maps a bigint field", () => {
    const field = makeField({
      name: "count",
      columnName: "count",
      type: { kind: "bigint" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'bigint("count", { mode: "number" }).notNull()',
    );
  });

  it("maps a real field", () => {
    const field = makeField({
      name: "score",
      columnName: "score",
      type: { kind: "real" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'real("score").notNull()');
  });

  it("maps a doublePrecision field", () => {
    const field = makeField({
      name: "price",
      columnName: "price",
      type: { kind: "doublePrecision" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'doublePrecision("price").notNull()');
  });

  it("maps a boolean field", () => {
    const field = makeField({
      name: "active",
      columnName: "active",
      type: { kind: "boolean" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'boolean("active").notNull()');
  });

  // ===========================================
  // UUID fields
  // ===========================================

  it("maps a uuid primary key with auto-generation", () => {
    const field = makeField({
      name: "authorId",
      columnName: "author_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
    });
    const table = makeTable(["authorId"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'base36Uuid("author_id").primaryKey().$defaultFn(() => generateBase36Id())',
    );
  });

  it("maps a uuid FK field (no auto-generation)", () => {
    const field = makeField({
      name: "authorId",
      columnName: "author_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { tableName: "Author", fieldName: "authorId" },
    });
    const table = makeTable(["bookId"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'base36Uuid("author_id").notNull().references(() => authors.authorId)',
    );
  });

  it("maps a nullable uuid FK field", () => {
    const field = makeField({
      name: "translatorId",
      columnName: "translator_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: true,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { tableName: "Translator", fieldName: "translatorId" },
    });
    const table = makeTable(["editionId"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'base36Uuid("translator_id").references(() => translators.translatorId)',
    );
  });

  // ===========================================
  // Timestamp fields
  // ===========================================

  it("maps a @createdAt timestamp", () => {
    const field = makeField({
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
    });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'timestamp("created_at", { withTimezone: true }).notNull().defaultNow()',
    );
  });

  it("maps an @updatedAt timestamp", () => {
    const field = makeField({
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      updatedAt: true,
    });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()',
    );
  });

  it("maps a plain timestamp (not createdAt/updatedAt)", () => {
    const field = makeField({
      name: "reviewDate",
      columnName: "review_date",
      type: { kind: "timestamp" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'timestamp("review_date", { withTimezone: true }).notNull()',
    );
  });

  // ===========================================
  // Enum fields
  // ===========================================

  it("maps an enum field", () => {
    const field = makeField({
      name: "format",
      columnName: "format",
      type: {
        kind: "enum",
        enumName: "bookFormatEnum",
        values: ["hardcover", "paperback", "ebook", "audiobook"],
      },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'bookFormatEnum("format").notNull()');
  });

  // ===========================================
  // Composite PK fields
  // ===========================================

  it("does not add .primaryKey() for composite PK fields", () => {
    const field = makeField({
      name: "bookId",
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { tableName: "Book", fieldName: "bookId" },
    });
    const table = makeTable(["bookId", "genreId"], {
      name: "BookGenre",
      tableName: "book_genres",
    });
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'base36Uuid("book_id").notNull().references(() => books.bookId)',
    );
  });

  // ===========================================
  // Default values
  // ===========================================

  it("maps a field with a numeric default", () => {
    const field = makeField({
      name: "rating",
      columnName: "rating",
      type: { kind: "integer" },
      nullable: false,
      defaultValue: 3,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, pg), 'integer("rating").notNull().default(3)');
  });

  it("maps a field with a string default", () => {
    const field = makeField({
      name: "status",
      columnName: "status",
      type: {
        kind: "enum",
        enumName: "statusEnum",
        values: ["draft", "published"],
      },
      nullable: false,
      defaultValue: "draft",
    });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, pg),
      'statusEnum("status").notNull().default("draft")',
    );
  });
});

// ===========================================
// SQLite dialect
// ===========================================

const sqlite = resolveDialect("sqlite");

describe("column mapper (sqlite)", () => {
  it("maps text field same as pg", () => {
    const field = makeField({ name: "title", columnName: "title", type: { kind: "text" } });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, sqlite), 'text("title").notNull()');
  });

  it("maps boolean to integer with boolean mode", () => {
    const field = makeField({ name: "active", columnName: "active", type: { kind: "boolean" } });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, sqlite),
      'integer("active", { mode: "boolean" }).notNull()',
    );
  });

  it("maps timestamp to integer with timestamp mode", () => {
    const field = makeField({
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      createdAt: true,
    });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, sqlite),
      'integer("created_at", { mode: "timestamp" }).notNull().defaultNow()',
    );
  });

  it("maps doublePrecision to real", () => {
    const field = makeField({
      name: "price",
      columnName: "price",
      type: { kind: "doublePrecision" },
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, sqlite), 'real("price").notNull()');
  });

  it("maps bigint to integer with number mode", () => {
    const field = makeField({ name: "count", columnName: "count", type: { kind: "bigint" } });
    const table = makeTable(["id"]);
    assert.equal(
      mapFieldToColumn(field, table, sqlite),
      'integer("count", { mode: "number" }).notNull()',
    );
  });

  it("maps varchar to text with length", () => {
    const field = makeField({
      name: "name",
      columnName: "name",
      type: { kind: "varchar", length: 256 },
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, sqlite), 'text("name", { length: 256 }).notNull()');
  });

  it("maps enum field to text", () => {
    const field = makeField({
      name: "format",
      columnName: "format",
      type: { kind: "enum", enumName: "bookFormatEnum", values: ["hardcover", "paperback"] },
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table, sqlite), 'text("format").notNull()');
  });

  it("maps uuid field to base36Uuid", () => {
    const field = makeField({
      name: "authorId",
      columnName: "author_id",
      type: { kind: "uuid", encoding: "base36" },
      uuid: { encoding: "base36", autoGenerate: true },
    });
    const table = makeTable(["authorId"]);
    assert.equal(
      mapFieldToColumn(field, table, sqlite),
      'base36Uuid("author_id").primaryKey().$defaultFn(() => generateBase36Id())',
    );
  });
});
