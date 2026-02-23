import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDialect } from "../../src/generators/dialect.ts";
import { generateSchema } from "../../src/generators/schema-generator.ts";
import type { EnumDef, TableDef } from "../../src/ir/types.ts";
import { bookstoreEnums, bookstoreTables } from "../fixtures/bookstore-ir.ts";

const pg = resolveDialect("pg");
const sqlite = resolveDialect("sqlite");

describe("schema generator", () => {
  it("generates correct imports", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes('from "drizzle-orm/pg-core"'));
    assert.ok(output.includes('from "./types.js"'));
    assert.ok(output.includes("base36Uuid"));
    assert.ok(output.includes("generateBase36Id"));
    assert.ok(output.includes("nullableInteger"));
    assert.ok(output.includes("nullableText"));
    assert.ok(output.includes("pgTable,"));
    assert.ok(output.includes("integer,"));
    assert.ok(output.includes("text,"));
    assert.ok(output.includes("timestamp,"));
    assert.ok(output.includes("primaryKey,"));
  });

  it("generates pgEnum imports when enums are present", () => {
    const enums: EnumDef[] = [
      {
        name: "bookFormatEnum",
        sqlName: "book_format",
        values: ["hardcover", "paperback", "ebook", "audiobook"],
      },
    ];
    const output = generateSchema([], enums, pg);
    assert.ok(output.includes("pgEnum,"));
  });

  it("generates pgEnum declaration", () => {
    const enums: EnumDef[] = [
      {
        name: "bookFormatEnum",
        sqlName: "book_format",
        values: ["hardcover", "paperback", "ebook", "audiobook"],
      },
    ];
    const output = generateSchema([], enums, pg);
    assert.ok(
      output.includes(
        'export const bookFormatEnum = pgEnum("book_format", [\n  "hardcover",\n  "paperback",\n  "ebook",\n  "audiobook",\n]);',
      ),
    );
  });

  // ===========================================
  // Individual table tests
  // ===========================================

  it("generates authors table", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes('export const authors = pgTable("authors", {'));
    assert.ok(
      output.includes(
        'authorId: base36Uuid("author_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(output.includes('name: text("name").notNull(),'));
    assert.ok(output.includes('bio: nullableText("bio"),'));
    assert.ok(output.includes('birthYear: nullableInteger("birth_year"),'));
    assert.ok(output.includes('nationality: nullableText("nationality"),'));
    assert.ok(
      output.includes(
        'createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),',
      ),
    );
    assert.ok(
      output.includes(
        'updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),',
      ),
    );
  });

  it("generates books table with FK, unique, and index", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    // Books now uses callback form due to index
    assert.ok(output.includes("export const books = pgTable("));
    assert.ok(output.includes('"books"'));
    assert.ok(
      output.includes(
        'bookId: base36Uuid("book_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(
      output.includes(
        'authorId: base36Uuid("author_id").notNull().references(() => authors.authorId),',
      ),
    );
    assert.ok(output.includes('title: text("title").notNull(),'));
    assert.ok(output.includes('originalLanguage: text("original_language").notNull(),'));
    assert.ok(output.includes('publicationYear: integer("publication_year").notNull(),'));
    // isbn has .unique()
    assert.ok(output.includes('isbn: nullableText("isbn").unique(),'));
    assert.ok(output.includes('pageCount: nullableInteger("page_count"),'));
    // Index in callback
    assert.ok(
      output.includes(
        'index("books_author_publication_idx").on(table.authorId, table.publicationYear)',
      ),
    );
  });

  it("generates genres table", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes('export const genres = pgTable("genres", {'));
    assert.ok(
      output.includes(
        'genreId: base36Uuid("genre_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(output.includes('description: nullableText("description"),'));
  });

  it("generates bookGenres junction table with composite PK", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes("export const bookGenres = pgTable("));
    assert.ok(output.includes('"book_genres"'));
    assert.ok(
      output.includes('bookId: base36Uuid("book_id").notNull().references(() => books.bookId),'),
    );
    assert.ok(
      output.includes(
        'genreId: base36Uuid("genre_id").notNull().references(() => genres.genreId),',
      ),
    );
    assert.ok(output.includes("(table) => ["));
    assert.ok(output.includes("primaryKey({"));
    assert.ok(output.includes('name: "book_genres_pk"'));
    assert.ok(output.includes("columns: [table.bookId, table.genreId]"));
  });

  it("generates bookTags table", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes('export const bookTags = pgTable("book_tags", {'));
    assert.ok(
      output.includes(
        'bookTagId: base36Uuid("book_tag_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(
      output.includes('bookId: base36Uuid("book_id").notNull().references(() => books.bookId),'),
    );
  });

  it("generates translators table", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes('export const translators = pgTable("translators", {'));
    assert.ok(
      output.includes(
        'translatorId: base36Uuid("translator_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(output.includes('nativeLanguage: text("native_language").notNull(),'));
  });

  it("generates publishers table", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    assert.ok(output.includes('export const publishers = pgTable("publishers", {'));
    assert.ok(
      output.includes(
        'publisherId: base36Uuid("publisher_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(output.includes('country: nullableText("country"),'));
    assert.ok(output.includes('founded: nullableInteger("founded"),'));
  });

  it("generates editions table with FKs, enum field, and composite unique", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    // Editions now uses callback form due to composite unique
    assert.ok(output.includes("export const editions = pgTable("));
    assert.ok(output.includes('"editions"'));
    assert.ok(
      output.includes(
        'editionId: base36Uuid("edition_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(
      output.includes('bookId: base36Uuid("book_id").notNull().references(() => books.bookId),'),
    );
    // Nullable FK — no .notNull()
    assert.ok(
      output.includes(
        'translatorId: base36Uuid("translator_id").references(() => translators.translatorId),',
      ),
    );
    assert.ok(
      output.includes(
        'publisherId: base36Uuid("publisher_id").notNull().references(() => publishers.publisherId),',
      ),
    );
    // Enum field
    assert.ok(output.includes('format: bookFormatEnum("format").notNull(),'));
    assert.ok(output.includes('language: text("language").notNull(),'));
    assert.ok(output.includes('isbn: nullableText("isbn"),'));
    assert.ok(output.includes('publicationYear: integer("publication_year").notNull(),'));
    // Composite unique constraint
    assert.ok(
      output.includes('uniqueIndex("edition_book_language_uq").on(table.bookId, table.language)'),
    );
  });

  it("generates reviews table with CHECK constraint", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    // Reviews now uses callback form due to CHECK constraint
    assert.ok(output.includes("export const reviews = pgTable("));
    assert.ok(output.includes('"reviews"'));
    assert.ok(
      output.includes(
        'reviewId: base36Uuid("review_id").primaryKey().$defaultFn(() => generateBase36Id()),',
      ),
    );
    assert.ok(
      output.includes('bookId: base36Uuid("book_id").notNull().references(() => books.bookId),'),
    );
    assert.ok(output.includes('rating: integer("rating").notNull(),'));
    assert.ok(output.includes('text: nullableText("text"),'));
    assert.ok(output.includes('reviewerName: text("reviewer_name").notNull(),'));
    assert.ok(
      output.includes('reviewDate: timestamp("review_date", { withTimezone: true }).notNull(),'),
    );
    // CHECK constraint from minValue/maxValue
    assert.ok(output.includes('check("reviews_rating_check"'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: checking literal template output
    assert.ok(output.includes("${table.rating} >= 1 AND ${table.rating} <= 5"));
  });

  // ===========================================
  // Constraint-specific tests
  // ===========================================

  it("generates sql import when CHECK constraints are present", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);
    assert.ok(output.includes('import { sql } from "drizzle-orm";'));
  });

  it("generates check import from pg-core when CHECK constraints exist", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);
    assert.ok(output.includes("check,"));
  });

  it("generates index import from pg-core when indexes exist", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);
    assert.ok(output.includes("index,"));
  });

  it("generates uniqueIndex import when composite uniques exist", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);
    assert.ok(output.includes("uniqueIndex"));
  });

  it("generates bookFormatEnum declaration from bookstore enums", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);
    assert.ok(output.includes('export const bookFormatEnum = pgEnum("book_format", ['));
    assert.ok(output.includes('"hardcover",'));
    assert.ok(output.includes('"paperback",'));
    assert.ok(output.includes('"ebook",'));
    assert.ok(output.includes('"audiobook",'));
  });

  it("generates composite FK constraint in table callback", () => {
    const tableWithFK: TableDef = {
      name: "BookAuthor",
      service: "bookstore",
      tableName: "book_authors",
      primaryKey: { tableName: "book_authors", columns: ["bookId", "authorId"], isComposite: true },
      fields: [
        {
          name: "bookId",
          columnName: "book_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "authorId",
          columnName: "author_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "authorFullName",
          columnName: "author_full_name",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
      ],
      foreignKeys: [
        {
          name: "author_name_fk",
          columns: ["authorId", "authorFullName"],
          foreignTable: "Author",
          foreignColumns: ["authorId", "fullName"],
        },
      ],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableWithFK], [], pg);
    assert.ok(output.includes("foreignKey({"));
    assert.ok(output.includes('name: "author_name_fk"'));
    assert.ok(output.includes("columns: [table.authorId, table.authorFullName]"));
    assert.ok(output.includes("foreignColumns: [authors.authorId, authors.fullName]"));
  });

  it("generates @check constraint on a field", () => {
    const tableWithCheck: TableDef = {
      name: "Review",
      service: "bookstore",
      tableName: "reviews",
      primaryKey: { tableName: "reviews", columns: ["reviewId"], isComposite: false },
      fields: [
        {
          name: "reviewId",
          columnName: "review_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "text",
          columnName: "text",
          type: { kind: "text" },
          nullable: true,
          createdAt: false,
          updatedAt: false,
          constraints: { check: "length(text) <= 10000" },
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableWithCheck], [], pg);
    assert.ok(output.includes('check("reviews_text_check"'));
    assert.ok(output.includes("length(text) <= 10000"));
  });

  it("generates unique index for composite unique constraints", () => {
    const tableWithUQ: TableDef = {
      name: "Edition",
      service: "test",
      tableName: "editions",
      primaryKey: { tableName: "editions", columns: ["editionId"], isComposite: false },
      fields: [
        {
          name: "editionId",
          columnName: "edition_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "bookId",
          columnName: "book_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "language",
          columnName: "language",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [{ name: "edition_book_lang_uq", columns: ["bookId", "language"] }],
    };
    const output = generateSchema([tableWithUQ], [], pg);
    assert.ok(
      output.includes('uniqueIndex("edition_book_lang_uq").on(table.bookId, table.language)'),
    );
  });

  it("generates non-unique index", () => {
    const tableWithIdx: TableDef = {
      name: "Book",
      service: "test",
      tableName: "books",
      primaryKey: { tableName: "books", columns: ["bookId"], isComposite: false },
      fields: [
        {
          name: "bookId",
          columnName: "book_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "authorId",
          columnName: "author_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "year",
          columnName: "year",
          type: { kind: "integer" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [{ name: "books_author_year_idx", columns: ["authorId", "year"], unique: false }],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableWithIdx], [], pg);
    assert.ok(output.includes('index("books_author_year_idx").on(table.authorId, table.year)'));
  });

  it("generates unique index via @index({ unique: true })", () => {
    const tableWithUniqueIdx: TableDef = {
      name: "Book",
      service: "test",
      tableName: "books",
      primaryKey: { tableName: "books", columns: ["bookId"], isComposite: false },
      fields: [
        {
          name: "bookId",
          columnName: "book_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "isbn",
          columnName: "isbn",
          type: { kind: "text" },
          nullable: true,
          createdAt: false,
          updatedAt: false,
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [{ name: "books_isbn_idx", columns: ["isbn"], unique: true }],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableWithUniqueIdx], [], pg);
    assert.ok(output.includes('uniqueIndex("books_isbn_idx").on(table.isbn)'));
  });

  it("generates .unique() for single-column unique constraint", () => {
    const tableWithUnique: TableDef = {
      name: "Author",
      service: "test",
      tableName: "authors",
      primaryKey: { tableName: "authors", columns: ["authorId"], isComposite: false },
      fields: [
        {
          name: "authorId",
          columnName: "author_id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "email",
          columnName: "email",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
          constraints: { unique: true },
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableWithUnique], [], pg);
    assert.ok(output.includes('email: text("email").notNull().unique(),'));
  });

  it("generates CHECK for minValue only", () => {
    const tableDef: TableDef = {
      name: "Item",
      service: "test",
      tableName: "items",
      primaryKey: { tableName: "items", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "quantity",
          columnName: "quantity",
          type: { kind: "integer" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
          constraints: { minValue: 0 },
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableDef], [], pg);
    assert.ok(output.includes('check("items_quantity_check"'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: checking literal template output
    assert.ok(output.includes("${table.quantity} >= 0"));
    assert.ok(!output.includes("AND"));
  });

  it("generates CHECK for maxValue only", () => {
    const tableDef: TableDef = {
      name: "Item",
      service: "test",
      tableName: "items",
      primaryKey: { tableName: "items", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "score",
          columnName: "score",
          type: { kind: "integer" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
          constraints: { maxValue: 100 },
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableDef], [], pg);
    assert.ok(output.includes('check("items_score_check"'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: checking literal template output
    assert.ok(output.includes("${table.score} <= 100"));
    assert.ok(!output.includes("AND"));
  });

  it("generates default value in column definition", () => {
    const tableDef: TableDef = {
      name: "Config",
      service: "test",
      tableName: "configs",
      primaryKey: { tableName: "configs", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "retryCount",
          columnName: "retry_count",
          type: { kind: "integer" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
          defaultValue: 3,
        },
      ],
      foreignKeys: [],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([tableDef], [], pg);
    assert.ok(output.includes(".default(3)"));
  });

  // ===========================================
  // Full output structure
  // ===========================================

  it("generates all 9 tables", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    const tableNames = [
      "authors",
      "books",
      "genres",
      "bookGenres",
      "bookTags",
      "translators",
      "publishers",
      "editions",
      "reviews",
    ];

    for (const name of tableNames) {
      assert.ok(output.includes(`export const ${name} =`), `Missing table variable: ${name}`);
    }
  });

  it("produces valid-looking TypeScript (no syntax errors in structure)", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg);

    // Check balanced braces (rough check)
    const opens = (output.match(/{/g) || []).length;
    const closes = (output.match(/}/g) || []).length;
    assert.equal(opens, closes, "Unbalanced braces in generated output");

    // Check balanced parens
    const openParens = (output.match(/\(/g) || []).length;
    const closeParens = (output.match(/\)/g) || []).length;
    assert.equal(openParens, closeParens, "Unbalanced parentheses in generated output");
  });
});

// ===========================================
// SQLite dialect
// ===========================================

describe("schema generator (sqlite)", () => {
  it("imports from drizzle-orm/sqlite-core", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    assert.ok(output.includes('from "drizzle-orm/sqlite-core"'));
  });

  it("uses sqliteTable instead of pgTable", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    assert.ok(output.includes("sqliteTable("));
    assert.ok(!output.includes("pgTable("));
  });

  it("does not emit pgEnum declarations", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    assert.ok(!output.includes("pgEnum"));
  });

  it("maps enum fields to text with enum constraint", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    assert.ok(
      output.includes(
        'format: text("format", { enum: ["hardcover", "paperback", "ebook", "audiobook"] }).notNull(),',
      ),
    );
  });

  it("generates enum constraint for isolated enum field", () => {
    const tableDef: TableDef = {
      name: "Task",
      service: "test",
      tableName: "tasks",
      primaryKey: { tableName: "tasks", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "status",
          columnName: "status",
          type: { kind: "enum", enumName: "taskStatusEnum", values: ["open", "closed"] },
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
    const output = generateSchema([tableDef], [], sqlite);
    assert.ok(output.includes('status: text("status", { enum: ["open", "closed"] }).notNull(),'));
    assert.ok(!output.includes("pgEnum"));
  });

  it("maps boolean fields to integer with boolean mode", () => {
    const tableDef: TableDef = {
      name: "Config",
      service: "test",
      tableName: "configs",
      primaryKey: { tableName: "configs", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "active",
          columnName: "active",
          type: { kind: "boolean" },
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
    const output = generateSchema([tableDef], [], sqlite);
    assert.ok(output.includes('active: integer("active", { mode: "boolean" }).notNull(),'));
  });

  it("maps timestamp fields to integer with timestamp mode", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    assert.ok(output.includes('integer("created_at", { mode: "timestamp" })'));
  });

  it("maps doublePrecision fields to real()", () => {
    const tableDef: TableDef = {
      name: "Measure",
      service: "test",
      tableName: "measures",
      primaryKey: { tableName: "measures", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "value",
          columnName: "value",
          type: { kind: "doublePrecision" },
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
    const output = generateSchema([tableDef], [], sqlite);
    assert.ok(output.includes('value: real("value").notNull(),'));
  });

  it("maps varchar fields to text with length", () => {
    const tableDef: TableDef = {
      name: "Item",
      service: "test",
      tableName: "items",
      primaryKey: { tableName: "items", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "name",
          columnName: "name",
          type: { kind: "varchar", length: 256 },
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
    const output = generateSchema([tableDef], [], sqlite);
    assert.ok(output.includes('name: text("name", { length: 256 }).notNull(),'));
  });

  it("maps bigint fields to integer with number mode", () => {
    const tableDef: TableDef = {
      name: "Counter",
      service: "test",
      tableName: "counters",
      primaryKey: { tableName: "counters", columns: ["id"], isComposite: false },
      fields: [
        {
          name: "id",
          columnName: "id",
          type: { kind: "text" },
          nullable: false,
          createdAt: false,
          updatedAt: false,
        },
        {
          name: "count",
          columnName: "count",
          type: { kind: "bigint" },
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
    const output = generateSchema([tableDef], [], sqlite);
    assert.ok(output.includes('count: integer("count", { mode: "number" }).notNull(),'));
  });

  it("imports only sqlite-compatible column types", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    assert.ok(!output.includes("boolean,"));
    assert.ok(!output.includes("timestamp,"));
    assert.ok(!output.includes("doublePrecision,"));
    assert.ok(!output.includes("bigint,"));
    assert.ok(!output.includes("varchar,"));
  });

  it("generates all 9 tables with sqliteTable", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    const tableNames = [
      "authors",
      "books",
      "genres",
      "bookGenres",
      "bookTags",
      "translators",
      "publishers",
      "editions",
      "reviews",
    ];
    for (const name of tableNames) {
      assert.ok(output.includes(`export const ${name} =`), `Missing table variable: ${name}`);
    }
  });

  it("produces valid-looking TypeScript", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, sqlite);
    const opens = (output.match(/{/g) || []).length;
    const closes = (output.match(/}/g) || []).length;
    assert.equal(opens, closes, "Unbalanced braces");
    const openParens = (output.match(/\(/g) || []).length;
    const closeParens = (output.match(/\)/g) || []).length;
    assert.equal(openParens, closeParens, "Unbalanced parens");
  });
});

describe("schema generator (pluralize: false)", () => {
  it("uses singular variable names derived from model name", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg, false);

    assert.ok(output.includes("export const author = pgTable("));
    assert.ok(output.includes("export const book = pgTable("));
    assert.ok(output.includes("export const genre = pgTable("));
    assert.ok(output.includes("export const bookGenre = pgTable("));
    assert.ok(output.includes("export const review = pgTable("));
  });

  it("does not pluralize variable names", () => {
    const output = generateSchema(bookstoreTables, bookstoreEnums, pg, false);

    assert.ok(!output.includes("export const authors "));
    assert.ok(!output.includes("export const books "));
    assert.ok(!output.includes("export const genres "));
  });
});
