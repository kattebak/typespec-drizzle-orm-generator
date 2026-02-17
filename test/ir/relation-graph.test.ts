import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ManyRelation,
  ManyThroughRelation,
  OneRelation,
} from "../../src/ir/relation-graph.ts";
import { buildRelationGraph, deriveOneRelationName } from "../../src/ir/relation-graph.ts";
import { bookstoreTables } from "../fixtures/bookstore-ir.ts";

describe("deriveOneRelationName", () => {
  it('strips "Id" suffix: authorId → author', () => {
    assert.equal(deriveOneRelationName("authorId"), "author");
  });

  it('strips "Id" suffix: bookId → book', () => {
    assert.equal(deriveOneRelationName("bookId"), "book");
  });

  it("returns field name unchanged if no Id suffix", () => {
    assert.equal(deriveOneRelationName("name"), "name");
  });
});

describe("buildRelationGraph", () => {
  const graph = buildRelationGraph(bookstoreTables);

  // ===========================================
  // Graph structure
  // ===========================================

  it("creates entries for all 9 tables", () => {
    assert.equal(graph.size, 9);
    for (const table of bookstoreTables) {
      assert.ok(graph.has(table.name), `Missing graph entry for ${table.name}`);
    }
  });

  // ===========================================
  // Author relations
  // ===========================================

  it("Author has a many reverse to Book", () => {
    const rels = graph.get("Author");
    assert.ok(rels);
    const booksRel = rels.find((r) => r.name === "books");
    assert.ok(booksRel);
    assert.equal(booksRel.kind, "many");
    assert.equal((booksRel as ManyRelation).table, "Book");
  });

  it("Author has exactly 1 relation (books)", () => {
    const rels = graph.get("Author");
    assert.ok(rels);
    assert.equal(rels.length, 1);
  });

  // ===========================================
  // Book relations
  // ===========================================

  it("Book has a one relation to Author", () => {
    const rels = graph.get("Book");
    assert.ok(rels);
    const authorRel = rels.find((r) => r.name === "author") as OneRelation;
    assert.ok(authorRel);
    assert.deepEqual(authorRel, {
      kind: "one",
      name: "author",
      fromTable: "Book",
      fromField: "authorId",
      toTable: "Author",
      toField: "authorId",
      optional: false,
    });
  });

  it("Book has many reverse relations for bookTags, editions, and reviews", () => {
    const rels = graph.get("Book");
    assert.ok(rels);
    const manyNames = rels
      .filter((r) => r.kind === "many")
      .map((r) => r.name)
      .sort();
    assert.deepEqual(manyNames, ["bookTags", "editions", "reviews"]);
  });

  it("Book has a many-through relation to Genre via BookGenre", () => {
    const rels = graph.get("Book");
    assert.ok(rels);
    const genresRel = rels.find((r) => r.name === "genres") as ManyThroughRelation;
    assert.ok(genresRel);
    assert.deepEqual(genresRel, {
      kind: "many-through",
      name: "genres",
      fromTable: "Book",
      fromField: "bookId",
      toTable: "Genre",
      toField: "genreId",
      junction: {
        table: "BookGenre",
        fromField: "bookId",
        toField: "genreId",
      },
    });
  });

  it("Book has 5 total relations (1 one + 3 many + 1 many-through)", () => {
    const rels = graph.get("Book");
    assert.ok(rels);
    assert.equal(rels.length, 5);
  });

  // ===========================================
  // Genre relations
  // ===========================================

  it("Genre has a many-through relation to Book via BookGenre", () => {
    const rels = graph.get("Genre");
    assert.ok(rels);
    const booksRel = rels.find((r) => r.name === "books") as ManyThroughRelation;
    assert.ok(booksRel);
    assert.deepEqual(booksRel, {
      kind: "many-through",
      name: "books",
      fromTable: "Genre",
      fromField: "genreId",
      toTable: "Book",
      toField: "bookId",
      junction: {
        table: "BookGenre",
        fromField: "genreId",
        toField: "bookId",
      },
    });
  });

  it("Genre has exactly 1 relation (books many-through)", () => {
    const rels = graph.get("Genre");
    assert.ok(rels);
    assert.equal(rels.length, 1);
  });

  // ===========================================
  // BookGenre (junction) relations
  // ===========================================

  it("BookGenre has one relations to both Book and Genre", () => {
    const rels = graph.get("BookGenre");
    assert.ok(rels);

    const bookRel = rels.find((r) => r.name === "book") as OneRelation;
    assert.ok(bookRel);
    assert.equal(bookRel.kind, "one");
    assert.equal(bookRel.toTable, "Book");
    assert.equal(bookRel.fromField, "bookId");

    const genreRel = rels.find((r) => r.name === "genre") as OneRelation;
    assert.ok(genreRel);
    assert.equal(genreRel.kind, "one");
    assert.equal(genreRel.toTable, "Genre");
    assert.equal(genreRel.fromField, "genreId");
  });

  it("BookGenre does NOT produce many reverses on Book or Genre", () => {
    const bookRels = graph.get("Book");
    assert.ok(bookRels);
    const genreRels = graph.get("Genre");
    assert.ok(genreRels);

    // Book should not have a many "bookGenres" relation
    const bookGenresRel = bookRels.find((r) => r.name === "bookGenres");
    assert.equal(bookGenresRel, undefined);

    // Genre should not have a many "bookGenres" relation
    const genreBookGenresRel = genreRels.find((r) => r.name === "bookGenres");
    assert.equal(genreBookGenresRel, undefined);
  });

  it("BookGenre has exactly 2 relations (one to Book, one to Genre)", () => {
    const rels = graph.get("BookGenre");
    assert.ok(rels);
    assert.equal(rels.length, 2);
  });

  // ===========================================
  // BookTag relations
  // ===========================================

  it("BookTag has a one relation to Book", () => {
    const rels = graph.get("BookTag");
    assert.ok(rels);
    const bookRel = rels.find((r) => r.name === "book") as OneRelation;
    assert.ok(bookRel);
    assert.equal(bookRel.kind, "one");
    assert.equal(bookRel.fromField, "bookId");
    assert.equal(bookRel.toTable, "Book");
    assert.equal(bookRel.optional, false);
  });

  // ===========================================
  // Translator relations
  // ===========================================

  it("Translator has a many reverse to Edition", () => {
    const rels = graph.get("Translator");
    assert.ok(rels);
    const editionsRel = rels.find((r) => r.name === "editions");
    assert.ok(editionsRel);
    assert.equal(editionsRel.kind, "many");
    assert.equal((editionsRel as ManyRelation).table, "Edition");
  });

  // ===========================================
  // Publisher relations
  // ===========================================

  it("Publisher has a many reverse to Edition", () => {
    const rels = graph.get("Publisher");
    assert.ok(rels);
    const editionsRel = rels.find((r) => r.name === "editions");
    assert.ok(editionsRel);
    assert.equal(editionsRel.kind, "many");
    assert.equal((editionsRel as ManyRelation).table, "Edition");
  });

  // ===========================================
  // Edition relations
  // ===========================================

  it("Edition has three one relations (book, translator, publisher)", () => {
    const rels = graph.get("Edition");
    assert.ok(rels);
    const oneRels = rels.filter((r) => r.kind === "one") as OneRelation[];
    assert.equal(oneRels.length, 3);

    const names = oneRels.map((r) => r.name).sort();
    assert.deepEqual(names, ["book", "publisher", "translator"]);
  });

  it("Edition.translator is optional (nullable FK)", () => {
    const rels = graph.get("Edition");
    assert.ok(rels);
    const translatorRel = rels.find((r) => r.name === "translator") as OneRelation;
    assert.ok(translatorRel);
    assert.equal(translatorRel.optional, true);
  });

  it("Edition.book is required (non-nullable FK)", () => {
    const rels = graph.get("Edition");
    assert.ok(rels);
    const bookRel = rels.find((r) => r.name === "book") as OneRelation;
    assert.ok(bookRel);
    assert.equal(bookRel.optional, false);
  });

  // ===========================================
  // Review relations
  // ===========================================

  it("Review has a one relation to Book", () => {
    const rels = graph.get("Review");
    assert.ok(rels);
    const bookRel = rels.find((r) => r.name === "book") as OneRelation;
    assert.ok(bookRel);
    assert.equal(bookRel.kind, "one");
    assert.equal(bookRel.fromField, "bookId");
    assert.equal(bookRel.toTable, "Book");
  });

  it("Review has exactly 1 relation", () => {
    const rels = graph.get("Review");
    assert.ok(rels);
    assert.equal(rels.length, 1);
  });
});
