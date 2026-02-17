import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DecoratorContext, Model, ModelProperty } from "@typespec/compiler";
import { assemblePackage } from "../../src/assembler.ts";
import {
  $compositeUnique,
  $createdAt,
  $entity,
  $indexDef,
  $junction,
  $maxValue,
  $minValue,
  $pk,
  $primaryKey,
  $references,
  $unique,
  $updatedAt,
  $uuid,
} from "../../src/decorators.ts";
import { buildIR, type ProgramStateAccess } from "../../src/ir/builder.ts";

/**
 * Creates a mock TypeSpec Program with state management.
 */
function createMockProgram(): ProgramStateAccess & {
  stateMap(key: symbol): Map<unknown, unknown>;
  stateSet(key: symbol): Set<unknown>;
} {
  const maps = new Map<symbol, Map<unknown, unknown>>();
  const sets = new Map<symbol, Set<unknown>>();

  return {
    stateMap(key: symbol) {
      let map = maps.get(key);
      if (!map) {
        map = new Map();
        maps.set(key, map);
      }
      return map;
    },
    stateSet(key: symbol) {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      return set;
    },
  };
}

function mockContext(program: ReturnType<typeof createMockProgram>): DecoratorContext {
  return { program } as unknown as DecoratorContext;
}

function mockScalar(name: string) {
  return { kind: "Scalar" as const, name };
}

interface MockModel {
  kind: "Model";
  name: string;
  properties: Map<string, MockProp>;
}

interface MockProp {
  kind: "ModelProperty";
  name: string;
  type: ReturnType<typeof mockScalar> | MockEnumType;
  optional: boolean;
  model: MockModel;
}

interface MockEnumType {
  kind: "Enum";
  name: string;
  members: Map<string, { name: string; value?: string }>;
}

/**
 * Creates the full bookstore domain as mock TypeSpec models + properties
 * and populates decorator state by calling the real decorator functions.
 */
function createBookstoreMocks(program: ReturnType<typeof createMockProgram>) {
  const ctx = mockContext(program);

  function createModel(name: string): MockModel {
    return {
      kind: "Model" as const,
      name,
      properties: new Map<string, MockProp>(),
    };
  }

  function addProp(model: MockModel, name: string, typeName: string, optional = false): MockProp {
    const prop: MockProp = {
      kind: "ModelProperty" as const,
      name,
      type: mockScalar(typeName),
      optional,
      model,
    };
    model.properties.set(name, prop);
    return prop;
  }

  function addEnumProp(
    model: MockModel,
    name: string,
    enumName: string,
    members: Array<{ name: string; value?: string }>,
    optional = false,
  ): MockProp {
    const prop: MockProp = {
      kind: "ModelProperty" as const,
      name,
      type: {
        kind: "Enum" as const,
        name: enumName,
        members: new Map(members.map((m) => [m.name, m])),
      },
      optional,
      model,
    };
    model.properties.set(name, prop);
    return prop;
  }

  // Author
  const authorModel = createModel("Author");
  const authorId = addProp(authorModel, "authorId", "string");
  addProp(authorModel, "name", "string");
  addProp(authorModel, "bio", "string", true);
  addProp(authorModel, "birthYear", "int32", true);
  addProp(authorModel, "nationality", "string", true);
  const authorCreatedAt = addProp(authorModel, "createdAt", "utcDateTime");
  const authorUpdatedAt = addProp(authorModel, "updatedAt", "utcDateTime");

  $entity(ctx, authorModel as unknown as Model, "Author", "bookstore");
  $primaryKey(ctx, authorModel as unknown as Model, "authors");
  $pk(ctx, authorId as unknown as ModelProperty);
  $uuid(ctx, authorId as unknown as ModelProperty, "base36", true);
  $createdAt(ctx, authorCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, authorUpdatedAt as unknown as ModelProperty);

  // Book
  const bookModel = createModel("Book");
  const bookId = addProp(bookModel, "bookId", "string");
  const bookAuthorId = addProp(bookModel, "authorId", "string");
  addProp(bookModel, "title", "string");
  addProp(bookModel, "originalLanguage", "string");
  const bookPubYear = addProp(bookModel, "publicationYear", "int32");
  const bookIsbn = addProp(bookModel, "isbn", "string", true);
  addProp(bookModel, "pageCount", "int32", true);
  const bookCreatedAt = addProp(bookModel, "createdAt", "utcDateTime");
  const bookUpdatedAt = addProp(bookModel, "updatedAt", "utcDateTime");

  $entity(ctx, bookModel as unknown as Model, "Book", "bookstore");
  $primaryKey(ctx, bookModel as unknown as Model, "books");
  $pk(ctx, bookId as unknown as ModelProperty);
  $uuid(ctx, bookId as unknown as ModelProperty, "base36", true);
  $uuid(ctx, bookAuthorId as unknown as ModelProperty, "base36");
  $references(ctx, bookAuthorId as unknown as ModelProperty, authorId as unknown as ModelProperty);
  $unique(ctx, bookIsbn as unknown as ModelProperty);
  $indexDef(ctx, bookModel as unknown as Model, "books_author_publication_idx", [
    bookAuthorId,
    bookPubYear,
  ] as unknown as ModelProperty[]);
  $createdAt(ctx, bookCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, bookUpdatedAt as unknown as ModelProperty);

  // Genre
  const genreModel = createModel("Genre");
  const genreId = addProp(genreModel, "genreId", "string");
  addProp(genreModel, "name", "string");
  addProp(genreModel, "description", "string", true);
  const genreCreatedAt = addProp(genreModel, "createdAt", "utcDateTime");
  const genreUpdatedAt = addProp(genreModel, "updatedAt", "utcDateTime");

  $entity(ctx, genreModel as unknown as Model, "Genre", "bookstore");
  $primaryKey(ctx, genreModel as unknown as Model, "genres");
  $pk(ctx, genreId as unknown as ModelProperty);
  $uuid(ctx, genreId as unknown as ModelProperty, "base36", true);
  $createdAt(ctx, genreCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, genreUpdatedAt as unknown as ModelProperty);

  // BookGenre (junction)
  const bookGenreModel = createModel("BookGenre");
  const bgBookId = addProp(bookGenreModel, "bookId", "string");
  const bgGenreId = addProp(bookGenreModel, "genreId", "string");

  $entity(ctx, bookGenreModel as unknown as Model, "BookGenre", "bookstore");
  $primaryKey(ctx, bookGenreModel as unknown as Model, "book_genres");
  $junction(ctx, bookGenreModel as unknown as Model);
  $pk(ctx, bgBookId as unknown as ModelProperty);
  $pk(ctx, bgGenreId as unknown as ModelProperty);
  $uuid(ctx, bgBookId as unknown as ModelProperty, "base36");
  $uuid(ctx, bgGenreId as unknown as ModelProperty, "base36");
  $references(ctx, bgBookId as unknown as ModelProperty, bookId as unknown as ModelProperty);
  $references(ctx, bgGenreId as unknown as ModelProperty, genreId as unknown as ModelProperty);

  // BookTag
  const bookTagModel = createModel("BookTag");
  const bookTagId = addProp(bookTagModel, "bookTagId", "string");
  const btBookId = addProp(bookTagModel, "bookId", "string");
  addProp(bookTagModel, "name", "string");
  const btCreatedAt = addProp(bookTagModel, "createdAt", "utcDateTime");
  const btUpdatedAt = addProp(bookTagModel, "updatedAt", "utcDateTime");

  $entity(ctx, bookTagModel as unknown as Model, "BookTag", "bookstore");
  $primaryKey(ctx, bookTagModel as unknown as Model, "book_tags");
  $pk(ctx, bookTagId as unknown as ModelProperty);
  $uuid(ctx, bookTagId as unknown as ModelProperty, "base36", true);
  $uuid(ctx, btBookId as unknown as ModelProperty, "base36");
  $references(ctx, btBookId as unknown as ModelProperty, bookId as unknown as ModelProperty);
  $createdAt(ctx, btCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, btUpdatedAt as unknown as ModelProperty);

  // Translator
  const translatorModel = createModel("Translator");
  const translatorId = addProp(translatorModel, "translatorId", "string");
  addProp(translatorModel, "name", "string");
  addProp(translatorModel, "nativeLanguage", "string");
  const tCreatedAt = addProp(translatorModel, "createdAt", "utcDateTime");
  const tUpdatedAt = addProp(translatorModel, "updatedAt", "utcDateTime");

  $entity(ctx, translatorModel as unknown as Model, "Translator", "bookstore");
  $primaryKey(ctx, translatorModel as unknown as Model, "translators");
  $pk(ctx, translatorId as unknown as ModelProperty);
  $uuid(ctx, translatorId as unknown as ModelProperty, "base36", true);
  $createdAt(ctx, tCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, tUpdatedAt as unknown as ModelProperty);

  // Publisher
  const publisherModel = createModel("Publisher");
  const publisherId = addProp(publisherModel, "publisherId", "string");
  addProp(publisherModel, "name", "string");
  addProp(publisherModel, "country", "string", true);
  addProp(publisherModel, "founded", "int32", true);
  const pCreatedAt = addProp(publisherModel, "createdAt", "utcDateTime");
  const pUpdatedAt = addProp(publisherModel, "updatedAt", "utcDateTime");

  $entity(ctx, publisherModel as unknown as Model, "Publisher", "bookstore");
  $primaryKey(ctx, publisherModel as unknown as Model, "publishers");
  $pk(ctx, publisherId as unknown as ModelProperty);
  $uuid(ctx, publisherId as unknown as ModelProperty, "base36", true);
  $createdAt(ctx, pCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, pUpdatedAt as unknown as ModelProperty);

  // Edition
  const editionModel = createModel("Edition");
  const editionId = addProp(editionModel, "editionId", "string");
  const edBookId = addProp(editionModel, "bookId", "string");
  const edTranslatorId = addProp(editionModel, "translatorId", "string", true);
  const edPublisherId = addProp(editionModel, "publisherId", "string");
  addEnumProp(editionModel, "format", "BookFormat", [
    { name: "hardcover", value: "hardcover" },
    { name: "paperback", value: "paperback" },
    { name: "ebook", value: "ebook" },
    { name: "audiobook", value: "audiobook" },
  ]);
  const edLanguage = addProp(editionModel, "language", "string");
  addProp(editionModel, "title", "string");
  addProp(editionModel, "isbn", "string", true);
  addProp(editionModel, "publicationYear", "int32");
  const edCreatedAt = addProp(editionModel, "createdAt", "utcDateTime");
  const edUpdatedAt = addProp(editionModel, "updatedAt", "utcDateTime");

  $entity(ctx, editionModel as unknown as Model, "Edition", "bookstore");
  $primaryKey(ctx, editionModel as unknown as Model, "editions");
  $pk(ctx, editionId as unknown as ModelProperty);
  $uuid(ctx, editionId as unknown as ModelProperty, "base36", true);
  $uuid(ctx, edBookId as unknown as ModelProperty, "base36");
  $uuid(ctx, edTranslatorId as unknown as ModelProperty, "base36");
  $uuid(ctx, edPublisherId as unknown as ModelProperty, "base36");
  $references(ctx, edBookId as unknown as ModelProperty, bookId as unknown as ModelProperty);
  $references(
    ctx,
    edTranslatorId as unknown as ModelProperty,
    translatorId as unknown as ModelProperty,
  );
  $references(
    ctx,
    edPublisherId as unknown as ModelProperty,
    publisherId as unknown as ModelProperty,
  );
  $compositeUnique(ctx, editionModel as unknown as Model, "edition_book_language_uq", [
    edBookId,
    edLanguage,
  ] as unknown as ModelProperty[]);
  $createdAt(ctx, edCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, edUpdatedAt as unknown as ModelProperty);

  // Review
  const reviewModel = createModel("Review");
  const reviewId = addProp(reviewModel, "reviewId", "string");
  const revBookId = addProp(reviewModel, "bookId", "string");
  const revRating = addProp(reviewModel, "rating", "int32");
  addProp(reviewModel, "text", "string", true);
  addProp(reviewModel, "reviewerName", "string");
  addProp(reviewModel, "reviewDate", "utcDateTime");
  const revCreatedAt = addProp(reviewModel, "createdAt", "utcDateTime");
  const revUpdatedAt = addProp(reviewModel, "updatedAt", "utcDateTime");

  $entity(ctx, reviewModel as unknown as Model, "Review", "bookstore");
  $primaryKey(ctx, reviewModel as unknown as Model, "reviews");
  $pk(ctx, reviewId as unknown as ModelProperty);
  $uuid(ctx, reviewId as unknown as ModelProperty, "base36", true);
  $uuid(ctx, revBookId as unknown as ModelProperty, "base36");
  $references(ctx, revBookId as unknown as ModelProperty, bookId as unknown as ModelProperty);
  $minValue(ctx, revRating as unknown as ModelProperty, 1);
  $maxValue(ctx, revRating as unknown as ModelProperty, 5);
  $createdAt(ctx, revCreatedAt as unknown as ModelProperty);
  $updatedAt(ctx, revUpdatedAt as unknown as ModelProperty);
}

describe("IR builder (from decorator state)", () => {
  const program = createMockProgram();
  createBookstoreMocks(program);
  const { entities, enums } = buildIR(program);

  // ===========================================
  // Entity count
  // ===========================================

  it("extracts all 9 bookstore entities", () => {
    assert.equal(entities.length, 9);
  });

  // ===========================================
  // Entity names
  // ===========================================

  it("produces correct entity names", () => {
    const names = entities.map((e) => e.name).sort();
    assert.deepEqual(names, [
      "Author",
      "Book",
      "BookGenre",
      "BookTag",
      "Edition",
      "Genre",
      "Publisher",
      "Review",
      "Translator",
    ]);
  });

  // ===========================================
  // Author entity
  // ===========================================

  it("Author has correct table name and PK", () => {
    const author = entities.find((e) => e.name === "Author");
    assert.ok(author);
    assert.equal(author.tableName, "authors");
    assert.equal(author.service, "bookstore");
    assert.deepEqual(author.primaryKey.columns, ["authorId"]);
    assert.equal(author.primaryKey.isComposite, false);
    assert.equal(author.isJunction, false);
  });

  it("Author has 7 fields with correct types", () => {
    const author = entities.find((e) => e.name === "Author");
    assert.ok(author);
    assert.equal(author.fields.length, 7);

    const authorIdField = author.fields.find((f) => f.name === "authorId");
    assert.ok(authorIdField);
    assert.equal(authorIdField.type.kind, "uuid");
    assert.deepEqual(authorIdField.uuid, {
      encoding: "base36",
      autoGenerate: true,
    });
    assert.equal(authorIdField.nullable, false);

    const bioField = author.fields.find((f) => f.name === "bio");
    assert.ok(bioField);
    assert.equal(bioField.type.kind, "text");
    assert.equal(bioField.nullable, true);

    const birthYearField = author.fields.find((f) => f.name === "birthYear");
    assert.ok(birthYearField);
    assert.equal(birthYearField.type.kind, "integer");
    assert.equal(birthYearField.columnName, "birth_year");
  });

  it("Author has createdAt and updatedAt timestamps", () => {
    const author = entities.find((e) => e.name === "Author");
    assert.ok(author);
    const createdAt = author.fields.find((f) => f.name === "createdAt");
    assert.ok(createdAt);
    const updatedAt = author.fields.find((f) => f.name === "updatedAt");
    assert.ok(updatedAt);
    assert.equal(createdAt.createdAt, true);
    assert.equal(createdAt.type.kind, "timestamp");
    assert.equal(updatedAt.updatedAt, true);
  });

  // ===========================================
  // Book entity — FK references
  // ===========================================

  it("Book.authorId has references to Author.authorId", () => {
    const book = entities.find((e) => e.name === "Book");
    assert.ok(book);
    const authorIdField = book.fields.find((f) => f.name === "authorId");
    assert.ok(authorIdField);
    assert.deepEqual(authorIdField.references, {
      entityName: "Author",
      fieldName: "authorId",
    });
  });

  // ===========================================
  // BookGenre (junction)
  // ===========================================

  it("BookGenre is marked as junction with composite PK", () => {
    const bookGenre = entities.find((e) => e.name === "BookGenre");
    assert.ok(bookGenre);
    assert.equal(bookGenre.isJunction, true);
    assert.equal(bookGenre.primaryKey.isComposite, true);
    assert.deepEqual(bookGenre.primaryKey.columns, ["bookId", "genreId"]);
  });

  it("BookGenre has references to Book and Genre", () => {
    const bookGenre = entities.find((e) => e.name === "BookGenre");
    assert.ok(bookGenre);
    const bookIdField = bookGenre.fields.find((f) => f.name === "bookId");
    assert.ok(bookIdField);
    const genreIdField = bookGenre.fields.find((f) => f.name === "genreId");
    assert.ok(genreIdField);
    assert.deepEqual(bookIdField.references, {
      entityName: "Book",
      fieldName: "bookId",
    });
    assert.deepEqual(genreIdField.references, {
      entityName: "Genre",
      fieldName: "genreId",
    });
  });

  // ===========================================
  // Edition — multiple FKs including nullable
  // ===========================================

  it("Edition has three FK references (book, translator, publisher)", () => {
    const edition = entities.find((e) => e.name === "Edition");
    assert.ok(edition);
    const bookId = edition.fields.find((f) => f.name === "bookId");
    assert.ok(bookId);
    const translatorId = edition.fields.find((f) => f.name === "translatorId");
    assert.ok(translatorId);
    const publisherId = edition.fields.find((f) => f.name === "publisherId");
    assert.ok(publisherId);

    assert.deepEqual(bookId.references, {
      entityName: "Book",
      fieldName: "bookId",
    });
    assert.deepEqual(translatorId.references, {
      entityName: "Translator",
      fieldName: "translatorId",
    });
    assert.deepEqual(publisherId.references, {
      entityName: "Publisher",
      fieldName: "publisherId",
    });
  });

  it("Edition.translatorId is nullable", () => {
    const edition = entities.find((e) => e.name === "Edition");
    assert.ok(edition);
    const translatorId = edition.fields.find((f) => f.name === "translatorId");
    assert.ok(translatorId);
    assert.equal(translatorId.nullable, true);
  });

  // ===========================================
  // Column name generation (snake_case)
  // ===========================================

  it("generates snake_case column names", () => {
    const book = entities.find((e) => e.name === "Book");
    assert.ok(book);
    const authorId = book.fields.find((f) => f.name === "authorId");
    assert.ok(authorId);
    assert.equal(authorId.columnName, "author_id");

    const pubYear = book.fields.find((f) => f.name === "publicationYear");
    assert.ok(pubYear);
    assert.equal(pubYear.columnName, "publication_year");
  });

  // ===========================================
  // Enum extraction
  // ===========================================

  it("extracts BookFormat enum from Edition.format", () => {
    assert.equal(enums.length, 1);
    assert.equal(enums[0].name, "bookFormatEnum");
    assert.deepEqual(enums[0].values, ["hardcover", "paperback", "ebook", "audiobook"]);
  });

  // ===========================================
  // Constraint extraction
  // ===========================================

  it("Book.isbn has unique constraint", () => {
    const book = entities.find((e) => e.name === "Book");
    assert.ok(book);
    const isbn = book.fields.find((f) => f.name === "isbn");
    assert.ok(isbn);
    assert.equal(isbn.constraints?.unique, true);
  });

  it("Book has an index on (authorId, publicationYear)", () => {
    const book = entities.find((e) => e.name === "Book");
    assert.ok(book);
    assert.equal(book.indexes.length, 1);
    assert.equal(book.indexes[0].name, "books_author_publication_idx");
    assert.deepEqual(book.indexes[0].columns, ["authorId", "publicationYear"]);
    assert.equal(book.indexes[0].unique, false);
  });

  it("Edition has composite unique on (bookId, language)", () => {
    const edition = entities.find((e) => e.name === "Edition");
    assert.ok(edition);
    assert.equal(edition.uniqueConstraints.length, 1);
    assert.equal(edition.uniqueConstraints[0].name, "edition_book_language_uq");
    assert.deepEqual(edition.uniqueConstraints[0].columns, ["bookId", "language"]);
  });

  it("Review.rating has minValue/maxValue constraints", () => {
    const review = entities.find((e) => e.name === "Review");
    assert.ok(review);
    const rating = review.fields.find((f) => f.name === "rating");
    assert.ok(rating);
    assert.equal(rating.constraints?.minValue, 1);
    assert.equal(rating.constraints?.maxValue, 5);
  });
});

describe("end-to-end: decorators → IR builder → assemblePackage", () => {
  const program = createMockProgram();
  createBookstoreMocks(program);
  const { entities, enums } = buildIR(program);

  const config = {
    packageName: "@bookstore/drizzle-schema",
    packageVersion: "0.0.1",
  };

  const files = assemblePackage(entities, enums, config);

  it("produces all 6 output files", () => {
    assert.equal(files.size, 6);
    assert.ok(files.has("package.json"));
    assert.ok(files.has("types.ts"));
    assert.ok(files.has("schema.ts"));
    assert.ok(files.has("relations.ts"));
    assert.ok(files.has("describe.ts"));
    assert.ok(files.has("index.ts"));
  });

  it("schema.ts contains all 9 pgTable declarations", () => {
    const schema = files.get("schema.ts");
    assert.ok(schema);
    for (const table of [
      "authors",
      "books",
      "genres",
      "bookGenres",
      "bookTags",
      "translators",
      "publishers",
      "editions",
      "reviews",
    ]) {
      assert.ok(schema.includes(`export const ${table} = pgTable(`), `Missing table: ${table}`);
    }
  });

  it("relations.ts contains defineRelations with all entities", () => {
    const relations = files.get("relations.ts");
    assert.ok(relations);
    assert.ok(relations.includes("export const relations = defineRelations(schema, (r) => ({"));
    for (const entity of [
      "authors",
      "books",
      "genres",
      "bookGenres",
      "bookTags",
      "translators",
      "publishers",
      "editions",
      "reviews",
    ]) {
      assert.ok(relations.includes(`  ${entity}: {`), `Missing relation block: ${entity}`);
    }
  });

  it("describe.ts contains 8 describe functions (no junction)", () => {
    const describe = files.get("describe.ts");
    assert.ok(describe);
    for (const fn of [
      "describeAuthor",
      "describeBook",
      "describeGenre",
      "describeBookTag",
      "describeTranslator",
      "describePublisher",
      "describeEdition",
      "describeReview",
    ]) {
      assert.ok(describe.includes(`export const ${fn} = (`), `Missing describe function: ${fn}`);
    }
    assert.ok(!describe.includes("describeBookGenre"));
  });

  it("describe.ts uses v2 object-based where syntax", () => {
    const describe = files.get("describe.ts");
    assert.ok(describe);
    assert.ok(describe.includes("where: { bookId },"));
    assert.ok(describe.includes("where: { authorId },"));
  });

  it("package.json has correct metadata", () => {
    const content = files.get("package.json");
    assert.ok(content);
    const pkg = JSON.parse(content);
    assert.equal(pkg.name, "@bookstore/drizzle-schema");
    assert.equal(pkg.version, "0.0.1");
  });

  it("schema.ts contains pgEnum declaration for bookFormatEnum", () => {
    const schemaTs = files.get("schema.ts");
    assert.ok(schemaTs);
    assert.ok(
      schemaTs.includes("export const bookFormatEnum = pgEnum("),
      "Missing pgEnum declaration",
    );
    assert.ok(schemaTs.includes('"hardcover"'), "Missing hardcover value");
    assert.ok(schemaTs.includes('"ebook"'), "Missing ebook value");
  });

  it("schema.ts contains .unique() on Book.isbn", () => {
    const schemaTs = files.get("schema.ts");
    assert.ok(schemaTs);
    assert.ok(schemaTs.includes(".unique()"), "Missing .unique() call on isbn");
  });

  it("schema.ts contains CHECK constraint for Review.rating", () => {
    const schemaTs = files.get("schema.ts");
    assert.ok(schemaTs);
    assert.ok(schemaTs.includes("check("), "Missing check() call for rating");
    assert.ok(schemaTs.includes("reviews_rating_check"), "Missing check constraint name");
  });

  it("schema.ts contains index for books", () => {
    const schemaTs = files.get("schema.ts");
    assert.ok(schemaTs);
    assert.ok(
      schemaTs.includes('index("books_author_publication_idx")'),
      "Missing index declaration",
    );
  });

  it("schema.ts contains uniqueIndex for editions composite unique", () => {
    const schemaTs = files.get("schema.ts");
    assert.ok(schemaTs);
    assert.ok(
      schemaTs.includes('uniqueIndex("edition_book_language_uq")'),
      "Missing uniqueIndex declaration",
    );
  });

  it("schema.ts imports sql from drizzle-orm for CHECK constraints", () => {
    const schemaTs = files.get("schema.ts");
    assert.ok(schemaTs);
    assert.ok(schemaTs.includes('import { sql } from "drizzle-orm"'), "Missing sql import");
  });
});
