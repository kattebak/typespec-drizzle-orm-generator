import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedBookstore } from "../fixtures/bookstore-seed.ts";
import { createTestDb } from "../fixtures/db.ts";

describe("bookstore relations (SQLite integration)", () => {
  // ===========================================
  // One-to-many: Author → Book
  // ===========================================

  it("queries an author with all their books", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const author = await db.query.authors.findFirst({
      where: { authorId: "author-1" },
      with: { books: true },
    });

    assert.ok(author);
    assert.equal(author.name, "Gabriel García Márquez");
    assert.equal(author.books.length, 1);
    assert.equal(author.books[0].title, "One Hundred Years of Solitude");
  });

  // ===========================================
  // Many-to-one: Book → Author
  // ===========================================

  it("queries a book with its author", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: { author: true },
    });

    assert.ok(book);
    assert.equal(book.author.name, "Gabriel García Márquez");
  });

  // ===========================================
  // Many-to-many through junction: Book ↔ Genre
  // ===========================================

  it("queries a book with genres through junction", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: { genres: true },
    });

    assert.ok(book);
    assert.equal(book.genres.length, 2);
    const names = book.genres.map((g) => g.name).sort();
    assert.deepEqual(names, ["Literary Fiction", "Magical Realism"]);
  });

  it("queries genres with books (reverse many-to-many)", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const genre = await db.query.genres.findFirst({
      where: { genreId: "genre-2" },
      with: { books: true },
    });

    assert.ok(genre);
    assert.equal(genre.name, "Literary Fiction");
    assert.equal(genre.books.length, 2);
    const titles = genre.books.map((b) => b.title).sort();
    assert.deepEqual(titles, ["Norwegian Wood", "One Hundred Years of Solitude"]);
  });

  // ===========================================
  // Junction entity: BookGenre → Book, Genre
  // ===========================================

  it("queries a junction record with both sides", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const bg = await db.query.bookGenres.findFirst({
      with: { book: true, genre: true },
    });

    assert.ok(bg);
    assert.ok(bg.book);
    assert.ok(bg.genre);
    assert.equal(typeof bg.book.title, "string");
    assert.equal(typeof bg.genre.name, "string");
  });

  // ===========================================
  // Multiple FKs: Edition → Book, Translator, Publisher
  // ===========================================

  it("queries an edition with all three FK relations", async () => {
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
    assert.equal(edition.book.title, "One Hundred Years of Solitude");
    assert.equal(edition.translator?.name, "Gregory Rabassa");
    assert.equal(edition.publisher.name, "Harper & Row");
  });

  // ===========================================
  // Nullable FK: Edition.translatorId
  // ===========================================

  it("returns null for nullable FK with no related record", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const edition = await db.query.editions.findFirst({
      where: { editionId: "edition-3" },
      with: { translator: true },
    });

    assert.ok(edition);
    assert.equal(edition.translator, null);
  });

  // ===========================================
  // One-to-many: Book → BookTag, Review
  // ===========================================

  it("queries a book with bookTags and reviews", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: {
        bookTags: true,
        reviews: true,
      },
    });

    assert.ok(book);
    assert.equal(book.bookTags.length, 2);
    assert.equal(book.reviews.length, 2);
  });

  // ===========================================
  // Reverse: BookTag → Book
  // ===========================================

  it("queries a bookTag with its parent book", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const tag = await db.query.bookTags.findFirst({
      with: { book: true },
    });

    assert.ok(tag);
    assert.ok(tag.book);
    assert.equal(typeof tag.book.title, "string");
  });

  // ===========================================
  // Reverse: Review → Book
  // ===========================================

  it("queries a review with its parent book", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const review = await db.query.reviews.findFirst({
      with: { book: true },
    });

    assert.ok(review);
    assert.ok(review.book);
    assert.equal(typeof review.book.title, "string");
  });

  // ===========================================
  // Reverse: Translator → editions, Publisher → editions
  // ===========================================

  it("queries a translator with their editions", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const translator = await db.query.translators.findFirst({
      where: { translatorId: "translator-1" },
      with: { editions: true },
    });

    assert.ok(translator);
    assert.equal(translator.name, "Gregory Rabassa");
    assert.equal(translator.editions.length, 1);
  });

  it("queries a publisher with their editions", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const publisher = await db.query.publishers.findFirst({
      where: { publisherId: "publisher-3" },
      with: { editions: true },
    });

    assert.ok(publisher);
    assert.equal(publisher.name, "Vintage Books");
    assert.equal(publisher.editions.length, 1);
  });

  // ===========================================
  // Complete traversal: Book with ALL relations
  // ===========================================

  it("queries a book with all relations at once", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: {
        author: true,
        editions: true,
        bookTags: true,
        reviews: true,
        genres: true,
      },
    });

    assert.ok(book);
    assert.equal(book.author.name, "Gabriel García Márquez");
    assert.equal(book.editions.length, 1);
    assert.equal(book.bookTags.length, 2);
    assert.equal(book.reviews.length, 2);
    assert.equal(book.genres.length, 2);
  });
});
