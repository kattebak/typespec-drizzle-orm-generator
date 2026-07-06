import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as schema from "../fixtures/bookstore-schema.ts";
import { seedBookstore } from "../fixtures/bookstore-seed.ts";
import { createTestDb } from "../fixtures/db.ts";

describe("SQLite bookstore smoke test", () => {
  it("creates tables, seeds data, and queries an author with books", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const author = await db.query.authors.findFirst({
      with: { books: true },
    });

    assert.ok(author);
    assert.equal(author.name, "Gabriel García Márquez");
    assert.ok(author.books.length > 0);
    assert.equal(author.books[0].title, "One Hundred Years of Solitude");
  });

  it("queries a book with its author", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: { author: true },
    });

    assert.ok(book);
    assert.equal(book.title, "One Hundred Years of Solitude");
    assert.equal(book.author.name, "Gabriel García Márquez");
  });

  it("queries a book with editions, tags, and reviews", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: {
        editions: true,
        bookTags: true,
        reviews: true,
      },
    });

    assert.ok(book);
    assert.equal(book.editions.length, 1);
    assert.equal(book.bookTags.length, 2);
    assert.equal(book.reviews.length, 2);
  });

  it("queries genres through junction table (many-to-many)", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: { genres: true },
    });

    assert.ok(book);
    assert.equal(book.genres.length, 2);
    const genreNames = book.genres.map((g) => g.name).sort();
    assert.deepEqual(genreNames, ["Literary Fiction", "Magical Realism"]);
  });

  it("queries genre with its books (reverse many-to-many)", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const genre = await db.query.genres.findFirst({
      where: { genreId: "genre-2" },
      with: { books: true },
    });

    assert.ok(genre);
    assert.equal(genre.name, "Literary Fiction");
    assert.equal(genre.books.length, 2);
  });

  it("queries an edition with book, translator, and publisher", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const edition = await db.query.editions.findFirst({
      where: { editionId: "edition-1" },
      with: {
        book: true,
        translator: true,
        publisher: true,
      },
    });

    assert.ok(edition);
    assert.equal(edition.language, "English");
    assert.ok(edition.book);
    assert.equal(edition.book.title, "One Hundred Years of Solitude");
    assert.ok(edition.translator);
    assert.equal(edition.translator.name, "Gregory Rabassa");
    assert.ok(edition.publisher);
    assert.equal(edition.publisher.name, "Harper & Row");
  });

  it("handles nullable translator in edition", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const edition = await db.query.editions.findFirst({
      where: { editionId: "edition-3" },
      with: {
        translator: true,
        publisher: true,
      },
    });

    assert.ok(edition);
    assert.equal(edition.language, "Japanese");
    assert.equal(edition.translator, null);
    assert.ok(edition.publisher);
    assert.equal(edition.publisher.name, "Kodansha");
  });

  it("creates all 9 tables successfully", () => {
    const db = createTestDb();
    seedBookstore(db);

    const tables = [
      schema.authors,
      schema.books,
      schema.genres,
      schema.bookGenres,
      schema.bookTags,
      schema.translators,
      schema.publishers,
      schema.editions,
      schema.reviews,
    ];

    for (const table of tables) {
      const result = db.select().from(table).all();
      assert.ok(Array.isArray(result));
      assert.ok(result.length > 0);
    }
  });
});
