import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSchema } from "../../src/generators/schema-generator.ts";
import type { EntityDef, EnumDef } from "../../src/ir/types.ts";
import { bookstoreEntities, bookstoreEnums } from "../fixtures/bookstore-ir.ts";

describe("schema generator", () => {
  it("generates correct imports", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    assert.ok(output.includes('from "drizzle-orm/pg-core"'));
    assert.ok(output.includes('import { base36Uuid } from "./types.js"'));
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
    const output = generateSchema([], enums);
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
    const output = generateSchema([], enums);
    assert.ok(
      output.includes(
        'export const bookFormatEnum = pgEnum("book_format", [\n  "hardcover",\n  "paperback",\n  "ebook",\n  "audiobook",\n]);',
      ),
    );
  });

  // ===========================================
  // Individual entity tests
  // ===========================================

  it("generates authors table", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    assert.ok(output.includes('export const authors = pgTable("authors", {'));
    assert.ok(output.includes('authorId: base36Uuid("author_id").primaryKey().defaultRandom(),'));
    assert.ok(output.includes('name: text("name").notNull(),'));
    assert.ok(output.includes('bio: text("bio"),'));
    assert.ok(output.includes('birthYear: integer("birth_year"),'));
    assert.ok(output.includes('nationality: text("nationality"),'));
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
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    // Books now uses callback form due to index
    assert.ok(output.includes("export const books = pgTable("));
    assert.ok(output.includes('"books"'));
    assert.ok(output.includes('bookId: base36Uuid("book_id").primaryKey().defaultRandom(),'));
    assert.ok(
      output.includes(
        'authorId: base36Uuid("author_id").notNull().references(() => authors.authorId),',
      ),
    );
    assert.ok(output.includes('title: text("title").notNull(),'));
    assert.ok(output.includes('originalLanguage: text("original_language").notNull(),'));
    assert.ok(output.includes('publicationYear: integer("publication_year").notNull(),'));
    // isbn has .unique()
    assert.ok(output.includes('isbn: text("isbn").unique(),'));
    assert.ok(output.includes('pageCount: integer("page_count"),'));
    // Index in callback
    assert.ok(
      output.includes(
        'index("books_author_publication_idx").on(table.authorId, table.publicationYear)',
      ),
    );
  });

  it("generates genres table", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    assert.ok(output.includes('export const genres = pgTable("genres", {'));
    assert.ok(output.includes('genreId: base36Uuid("genre_id").primaryKey().defaultRandom(),'));
    assert.ok(output.includes('description: text("description"),'));
  });

  it("generates bookGenres junction table with composite PK", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

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
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    assert.ok(output.includes('export const bookTags = pgTable("book_tags", {'));
    assert.ok(
      output.includes('bookTagId: base36Uuid("book_tag_id").primaryKey().defaultRandom(),'),
    );
    assert.ok(
      output.includes('bookId: base36Uuid("book_id").notNull().references(() => books.bookId),'),
    );
  });

  it("generates translators table", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    assert.ok(output.includes('export const translators = pgTable("translators", {'));
    assert.ok(
      output.includes('translatorId: base36Uuid("translator_id").primaryKey().defaultRandom(),'),
    );
    assert.ok(output.includes('nativeLanguage: text("native_language").notNull(),'));
  });

  it("generates publishers table", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    assert.ok(output.includes('export const publishers = pgTable("publishers", {'));
    assert.ok(
      output.includes('publisherId: base36Uuid("publisher_id").primaryKey().defaultRandom(),'),
    );
    assert.ok(output.includes('country: text("country"),'));
    assert.ok(output.includes('founded: integer("founded"),'));
  });

  it("generates editions table with FKs, enum field, and composite unique", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    // Editions now uses callback form due to composite unique
    assert.ok(output.includes("export const editions = pgTable("));
    assert.ok(output.includes('"editions"'));
    assert.ok(output.includes('editionId: base36Uuid("edition_id").primaryKey().defaultRandom(),'));
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
    assert.ok(output.includes('isbn: text("isbn"),'));
    assert.ok(output.includes('publicationYear: integer("publication_year").notNull(),'));
    // Composite unique constraint
    assert.ok(
      output.includes('uniqueIndex("edition_book_language_uq").on(table.bookId, table.language)'),
    );
  });

  it("generates reviews table with CHECK constraint", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

    // Reviews now uses callback form due to CHECK constraint
    assert.ok(output.includes("export const reviews = pgTable("));
    assert.ok(output.includes('"reviews"'));
    assert.ok(output.includes('reviewId: base36Uuid("review_id").primaryKey().defaultRandom(),'));
    assert.ok(
      output.includes('bookId: base36Uuid("book_id").notNull().references(() => books.bookId),'),
    );
    assert.ok(output.includes('rating: integer("rating").notNull(),'));
    assert.ok(output.includes('text: text("text"),'));
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
    const output = generateSchema(bookstoreEntities, bookstoreEnums);
    assert.ok(output.includes('import { sql } from "drizzle-orm";'));
  });

  it("generates check import from pg-core when CHECK constraints exist", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);
    assert.ok(output.includes("check,"));
  });

  it("generates index import from pg-core when indexes exist", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);
    assert.ok(output.includes("index,"));
  });

  it("generates uniqueIndex import when composite uniques exist", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);
    assert.ok(output.includes("uniqueIndex,"));
  });

  it("generates bookFormatEnum declaration from bookstore enums", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);
    assert.ok(output.includes('export const bookFormatEnum = pgEnum("book_format", ['));
    assert.ok(output.includes('"hardcover",'));
    assert.ok(output.includes('"paperback",'));
    assert.ok(output.includes('"ebook",'));
    assert.ok(output.includes('"audiobook",'));
  });

  it("generates composite FK constraint in table callback", () => {
    const entityWithFK: EntityDef = {
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
          foreignEntity: "Author",
          foreignColumns: ["authorId", "fullName"],
        },
      ],
      isJunction: false,
      indexes: [],
      uniqueConstraints: [],
    };
    const output = generateSchema([entityWithFK], []);
    assert.ok(output.includes("foreignKey({"));
    assert.ok(output.includes('name: "author_name_fk"'));
    assert.ok(output.includes("columns: [table.authorId, table.authorFullName]"));
    assert.ok(output.includes("foreignColumns: [authors.authorId, authors.fullName]"));
  });

  it("generates @check constraint on a field", () => {
    const entityWithCheck: EntityDef = {
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
    const output = generateSchema([entityWithCheck], []);
    assert.ok(output.includes('check("reviews_text_check"'));
    assert.ok(output.includes("length(text) <= 10000"));
  });

  it("generates unique index for composite unique constraints", () => {
    const entityWithUQ: EntityDef = {
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
    const output = generateSchema([entityWithUQ], []);
    assert.ok(
      output.includes('uniqueIndex("edition_book_lang_uq").on(table.bookId, table.language)'),
    );
  });

  it("generates non-unique index", () => {
    const entityWithIdx: EntityDef = {
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
    const output = generateSchema([entityWithIdx], []);
    assert.ok(output.includes('index("books_author_year_idx").on(table.authorId, table.year)'));
  });

  it("generates unique index via @index({ unique: true })", () => {
    const entityWithUniqueIdx: EntityDef = {
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
    const output = generateSchema([entityWithUniqueIdx], []);
    assert.ok(output.includes('uniqueIndex("books_isbn_idx").on(table.isbn)'));
  });

  it("generates .unique() for single-column unique constraint", () => {
    const entityWithUnique: EntityDef = {
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
    const output = generateSchema([entityWithUnique], []);
    assert.ok(output.includes('email: text("email").notNull().unique(),'));
  });

  it("generates CHECK for minValue only", () => {
    const entity: EntityDef = {
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
    const output = generateSchema([entity], []);
    assert.ok(output.includes('check("items_quantity_check"'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: checking literal template output
    assert.ok(output.includes("${table.quantity} >= 0"));
    assert.ok(!output.includes("AND"));
  });

  it("generates CHECK for maxValue only", () => {
    const entity: EntityDef = {
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
    const output = generateSchema([entity], []);
    assert.ok(output.includes('check("items_score_check"'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: checking literal template output
    assert.ok(output.includes("${table.score} <= 100"));
    assert.ok(!output.includes("AND"));
  });

  it("generates default value in column definition", () => {
    const entity: EntityDef = {
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
    const output = generateSchema([entity], []);
    assert.ok(output.includes(".default(3)"));
  });

  // ===========================================
  // Full output structure
  // ===========================================

  it("generates all 9 entities", () => {
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

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
    const output = generateSchema(bookstoreEntities, bookstoreEnums);

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
