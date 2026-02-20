import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateDescribe } from "../../src/generators/describe-generator.ts";
import { buildRelationGraph } from "../../src/ir/relation-graph.ts";
import { bookstoreTables } from "../fixtures/bookstore-ir.ts";

const graph = buildRelationGraph(bookstoreTables);
const output = generateDescribe(bookstoreTables, graph);

describe("describe generator", () => {
  // ===========================================
  // Imports
  // ===========================================

  it("generates DrizzleClient type import", () => {
    assert.ok(output.includes('import type { DrizzleClient } from "./types.js";'));
  });

  it("generates schema import", () => {
    assert.ok(output.includes('import * as schema from "./schema.js";'));
  });

  // ===========================================
  // Junction exclusion
  // ===========================================

  it("does NOT generate describe for BookGenre (junction)", () => {
    assert.ok(!output.includes("describeBookGenre"));
    assert.ok(!output.includes("BookGenreDescription"));
  });

  // ===========================================
  // describeAuthor
  // ===========================================

  it("generates AuthorDescription type", () => {
    assert.ok(
      output.includes("export type AuthorDescription = typeof schema.authors.$inferSelect & {"),
    );
    assert.ok(output.includes("  books: (typeof schema.books.$inferSelect)[];"));
  });

  it("generates describeAuthor function", () => {
    assert.ok(output.includes("export const describeAuthor = ("));
    assert.ok(output.includes("  db: DrizzleClient,"));
    assert.ok(output.includes("  authorId: string,"));
    assert.ok(output.includes("): Promise<AuthorDescription | undefined> =>"));
    assert.ok(output.includes("  db.query.authors.findFirst({"));
    assert.ok(output.includes("    where: { authorId },"));
    assert.ok(output.includes("books: true"));
  });

  // ===========================================
  // describeBook
  // ===========================================

  it("generates BookDescription type with all relations", () => {
    assert.ok(
      output.includes("export type BookDescription = typeof schema.books.$inferSelect & {"),
    );
    assert.ok(output.includes("  author: typeof schema.authors.$inferSelect;"));
    assert.ok(output.includes("  editions: (typeof schema.editions.$inferSelect)[];"));
    assert.ok(output.includes("  bookTags: (typeof schema.bookTags.$inferSelect)[];"));
    assert.ok(output.includes("  reviews: (typeof schema.reviews.$inferSelect)[];"));
    assert.ok(output.includes("  genres: (typeof schema.genres.$inferSelect)[];"));
  });

  it("generates describeBook function with v2 where syntax", () => {
    assert.ok(output.includes("export const describeBook = ("));
    assert.ok(output.includes("  bookId: string,"));
    assert.ok(output.includes("): Promise<BookDescription | undefined> =>"));
    assert.ok(output.includes("  db.query.books.findFirst({"));
    assert.ok(output.includes("    where: { bookId },"));
    assert.ok(output.includes("author: true"));
    assert.ok(output.includes("editions: true"));
    assert.ok(output.includes("genres: true"));
    assert.ok(output.includes("bookTags: true"));
    assert.ok(output.includes("reviews: true"));
  });

  // ===========================================
  // describeGenre
  // ===========================================

  it("generates GenreDescription type with many-through books", () => {
    assert.ok(
      output.includes("export type GenreDescription = typeof schema.genres.$inferSelect & {"),
    );
    assert.ok(output.includes("  books: (typeof schema.books.$inferSelect)[];"));
  });

  it("generates describeGenre function", () => {
    assert.ok(output.includes("export const describeGenre = ("));
    assert.ok(output.includes("  genreId: string,"));
    assert.ok(output.includes("): Promise<GenreDescription | undefined> =>"));
    assert.ok(output.includes("  db.query.genres.findFirst({"));
    assert.ok(output.includes("    where: { genreId },"));
  });

  // ===========================================
  // describeBookTag
  // ===========================================

  it("generates BookTagDescription type with one book", () => {
    assert.ok(
      output.includes("export type BookTagDescription = typeof schema.bookTags.$inferSelect & {"),
    );
    assert.ok(output.includes("  book: typeof schema.books.$inferSelect;"));
  });

  it("generates describeBookTag function", () => {
    assert.ok(output.includes("export const describeBookTag = ("));
    assert.ok(output.includes("  bookTagId: string,"));
    assert.ok(output.includes("): Promise<BookTagDescription | undefined> =>"));
  });

  // ===========================================
  // describeTranslator
  // ===========================================

  it("generates TranslatorDescription type", () => {
    assert.ok(
      output.includes(
        "export type TranslatorDescription = typeof schema.translators.$inferSelect & {",
      ),
    );
    assert.ok(output.includes("  editions: (typeof schema.editions.$inferSelect)[];"));
  });

  it("generates describeTranslator function", () => {
    assert.ok(output.includes("export const describeTranslator = ("));
    assert.ok(output.includes("  translatorId: string,"));
  });

  // ===========================================
  // describePublisher
  // ===========================================

  it("generates PublisherDescription type", () => {
    assert.ok(
      output.includes(
        "export type PublisherDescription = typeof schema.publishers.$inferSelect & {",
      ),
    );
    assert.ok(output.includes("  editions: (typeof schema.editions.$inferSelect)[];"));
  });

  it("generates describePublisher function", () => {
    assert.ok(output.includes("export const describePublisher = ("));
    assert.ok(output.includes("  publisherId: string,"));
  });

  // ===========================================
  // describeEdition
  // ===========================================

  it("generates EditionDescription type with optional translator", () => {
    assert.ok(
      output.includes("export type EditionDescription = typeof schema.editions.$inferSelect & {"),
    );
    assert.ok(output.includes("  book: typeof schema.books.$inferSelect;"));
    assert.ok(output.includes("  translator: typeof schema.translators.$inferSelect | null;"));
    assert.ok(output.includes("  publisher: typeof schema.publishers.$inferSelect;"));
  });

  it("generates describeEdition function", () => {
    assert.ok(output.includes("export const describeEdition = ("));
    assert.ok(output.includes("  editionId: string,"));
    assert.ok(output.includes("): Promise<EditionDescription | undefined> =>"));
    assert.ok(output.includes("book: true"));
    assert.ok(output.includes("translator: true"));
    assert.ok(output.includes("publisher: true"));
  });

  // ===========================================
  // describeReview
  // ===========================================

  it("generates ReviewDescription type", () => {
    assert.ok(
      output.includes("export type ReviewDescription = typeof schema.reviews.$inferSelect & {"),
    );
    assert.ok(output.includes("  book: typeof schema.books.$inferSelect;"));
  });

  it("generates describeReview function", () => {
    assert.ok(output.includes("export const describeReview = ("));
    assert.ok(output.includes("  reviewId: string,"));
    assert.ok(output.includes("): Promise<ReviewDescription | undefined> =>"));
  });

  // ===========================================
  // All 8 non-junction tables have describe functions
  // ===========================================

  it("generates describe functions for all 8 non-junction tables", () => {
    const expected = [
      "describeAuthor",
      "describeBook",
      "describeGenre",
      "describeBookTag",
      "describeTranslator",
      "describePublisher",
      "describeEdition",
      "describeReview",
    ];

    for (const name of expected) {
      assert.ok(output.includes(`export const ${name} = (`), `Missing describe function: ${name}`);
    }
  });

  it("generates Description types for all 8 non-junction tables", () => {
    const expected = [
      "AuthorDescription",
      "BookDescription",
      "GenreDescription",
      "BookTagDescription",
      "TranslatorDescription",
      "PublisherDescription",
      "EditionDescription",
      "ReviewDescription",
    ];

    for (const name of expected) {
      assert.ok(output.includes(`export type ${name} =`), `Missing Description type: ${name}`);
    }
  });

  // ===========================================
  // Structural validity
  // ===========================================

  it("produces valid-looking TypeScript (balanced braces and parens)", () => {
    const opens = (output.match(/{/g) || []).length;
    const closes = (output.match(/}/g) || []).length;
    assert.equal(opens, closes, "Unbalanced braces");

    const openParens = (output.match(/\(/g) || []).length;
    const closeParens = (output.match(/\)/g) || []).length;
    assert.equal(openParens, closeParens, "Unbalanced parentheses");
  });
});
