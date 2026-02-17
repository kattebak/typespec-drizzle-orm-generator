import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRelations } from "../../src/generators/relations-generator.ts";
import { buildRelationGraph } from "../../src/ir/relation-graph.ts";
import { bookstoreEntities } from "../fixtures/bookstore-ir.ts";

const graph = buildRelationGraph(bookstoreEntities);
const output = generateRelations(bookstoreEntities, graph);

describe("relations generator", () => {
  // ===========================================
  // Imports
  // ===========================================

  it("generates defineRelations import", () => {
    assert.ok(output.includes('import { defineRelations } from "drizzle-orm";'));
  });

  it("generates schema import", () => {
    assert.ok(output.includes('import * as schema from "./schema.js";'));
  });

  // ===========================================
  // defineRelations wrapper
  // ===========================================

  it("wraps all relations in defineRelations call", () => {
    assert.ok(output.includes("export const relations = defineRelations(schema, (r) => ({"));
    assert.ok(output.includes("}));"));
  });

  // ===========================================
  // Author relations
  // ===========================================

  it("generates Author with many books", () => {
    assert.ok(output.includes("  authors: {"));
    assert.ok(output.includes("    books: r.many.books(),"));
  });

  // ===========================================
  // Book relations
  // ===========================================

  it("generates Book one relation to Author", () => {
    assert.ok(output.includes("    author: r.one.authors({"));
    assert.ok(output.includes("      from: r.books.authorId,"));
    assert.ok(output.includes("      to: r.authors.authorId,"));
  });

  it("generates Book many relations for editions, bookTags, reviews", () => {
    assert.ok(output.includes("    editions: r.many.editions(),"));
    assert.ok(output.includes("    bookTags: r.many.bookTags(),"));
    assert.ok(output.includes("    reviews: r.many.reviews(),"));
  });

  it("generates Book many-through to Genre via BookGenre", () => {
    assert.ok(output.includes("    genres: r.many.genres({"));
    assert.ok(output.includes("      from: r.books.bookId.through(r.bookGenres.bookId),"));
    assert.ok(output.includes("      to: r.genres.genreId.through(r.bookGenres.genreId),"));
  });

  // ===========================================
  // Genre relations
  // ===========================================

  it("generates Genre many-through to Book via BookGenre", () => {
    assert.ok(output.includes("  genres: {"));
    assert.ok(output.includes("    books: r.many.books({"));
    assert.ok(output.includes("      from: r.genres.genreId.through(r.bookGenres.genreId),"));
    assert.ok(output.includes("      to: r.books.bookId.through(r.bookGenres.bookId),"));
  });

  // ===========================================
  // BookGenre (junction) relations
  // ===========================================

  it("generates BookGenre one relations to Book and Genre", () => {
    assert.ok(output.includes("  bookGenres: {"));
    assert.ok(output.includes("    book: r.one.books({"));
    assert.ok(output.includes("      from: r.bookGenres.bookId,"));
    assert.ok(output.includes("      to: r.books.bookId,"));
    assert.ok(output.includes("    genre: r.one.genres({"));
    assert.ok(output.includes("      from: r.bookGenres.genreId,"));
    assert.ok(output.includes("      to: r.genres.genreId,"));
  });

  // ===========================================
  // BookTag relations
  // ===========================================

  it("generates BookTag one relation to Book", () => {
    assert.ok(output.includes("  bookTags: {"));
    assert.ok(output.includes("    book: r.one.books({"));
    assert.ok(output.includes("      from: r.bookTags.bookId,"));
    assert.ok(output.includes("      to: r.books.bookId,"));
  });

  // ===========================================
  // Translator relations
  // ===========================================

  it("generates Translator with many editions", () => {
    assert.ok(output.includes("  translators: {"));
    assert.ok(output.includes("    editions: r.many.editions(),"));
  });

  // ===========================================
  // Publisher relations
  // ===========================================

  it("generates Publisher with many editions", () => {
    assert.ok(output.includes("  publishers: {"));
    assert.ok(output.includes("    editions: r.many.editions(),"));
  });

  // ===========================================
  // Edition relations
  // ===========================================

  it("generates Edition one relations to Book, Translator, and Publisher", () => {
    assert.ok(output.includes("  editions: {"));

    assert.ok(output.includes("    book: r.one.books({"));
    assert.ok(output.includes("      from: r.editions.bookId,"));
    assert.ok(output.includes("      to: r.books.bookId,"));

    assert.ok(output.includes("    translator: r.one.translators({"));
    assert.ok(output.includes("      from: r.editions.translatorId,"));
    assert.ok(output.includes("      to: r.translators.translatorId,"));

    assert.ok(output.includes("    publisher: r.one.publishers({"));
    assert.ok(output.includes("      from: r.editions.publisherId,"));
    assert.ok(output.includes("      to: r.publishers.publisherId,"));
  });

  // ===========================================
  // Review relations
  // ===========================================

  it("generates Review one relation to Book", () => {
    assert.ok(output.includes("  reviews: {"));
    assert.ok(output.includes("    book: r.one.books({"));
    assert.ok(output.includes("      from: r.reviews.bookId,"));
    assert.ok(output.includes("      to: r.books.bookId,"));
  });

  // ===========================================
  // All 9 entities present
  // ===========================================

  it("generates entries for all 9 entities", () => {
    const tableVars = [
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

    for (const name of tableVars) {
      assert.ok(output.includes(`  ${name}: {`), `Missing entity block: ${name}`);
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
