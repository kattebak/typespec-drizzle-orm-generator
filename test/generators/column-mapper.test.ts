import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapFieldToColumn } from "../../src/generators/column-mapper.ts";
import type { FieldDef, TableDef } from "../../src/ir/types.ts";

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
    assert.equal(mapFieldToColumn(field, table), 'text("title").notNull()');
  });

  it("maps an optional text field (nullable)", () => {
    const field = makeField({
      name: "bio",
      columnName: "bio",
      type: { kind: "text" },
      nullable: true,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'text("bio")');
  });

  it("maps a required integer field", () => {
    const field = makeField({
      name: "publicationYear",
      columnName: "publication_year",
      type: { kind: "integer" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'integer("publication_year").notNull()');
  });

  it("maps an optional integer field", () => {
    const field = makeField({
      name: "pageCount",
      columnName: "page_count",
      type: { kind: "integer" },
      nullable: true,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'integer("page_count")');
  });

  it("maps a varchar field", () => {
    const field = makeField({
      name: "name",
      columnName: "name",
      type: { kind: "varchar", length: 256 },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'varchar("name", { length: 256 }).notNull()');
  });

  it("maps a bigint field", () => {
    const field = makeField({
      name: "count",
      columnName: "count",
      type: { kind: "bigint" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'bigint("count", { mode: "number" }).notNull()');
  });

  it("maps a real field", () => {
    const field = makeField({
      name: "score",
      columnName: "score",
      type: { kind: "real" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'real("score").notNull()');
  });

  it("maps a doublePrecision field", () => {
    const field = makeField({
      name: "price",
      columnName: "price",
      type: { kind: "doublePrecision" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'doublePrecision("price").notNull()');
  });

  it("maps a boolean field", () => {
    const field = makeField({
      name: "active",
      columnName: "active",
      type: { kind: "boolean" },
      nullable: false,
    });
    const table = makeTable(["id"]);
    assert.equal(mapFieldToColumn(field, table), 'boolean("active").notNull()');
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
      mapFieldToColumn(field, table),
      'base36Uuid("author_id").primaryKey().defaultRandom()',
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
      mapFieldToColumn(field, table),
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
      mapFieldToColumn(field, table),
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
      mapFieldToColumn(field, table),
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
      mapFieldToColumn(field, table),
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
      mapFieldToColumn(field, table),
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
    assert.equal(mapFieldToColumn(field, table), 'bookFormatEnum("format").notNull()');
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
      mapFieldToColumn(field, table),
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
    assert.equal(mapFieldToColumn(field, table), 'integer("rating").notNull().default(3)');
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
    assert.equal(mapFieldToColumn(field, table), 'statusEnum("status").notNull().default("draft")');
  });
});
