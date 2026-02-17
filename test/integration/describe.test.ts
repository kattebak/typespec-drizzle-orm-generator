import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedBookstore } from "../fixtures/bookstore-seed.ts";
import { createTestDb } from "../fixtures/db.ts";

describe("describe queries (SQLite integration)", () => {
  // ===========================================
  // describeAuthor pattern: author + books[]
  // ===========================================

  it("describeAuthor returns author with books", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const author = await db.query.authors.findFirst({
      where: { authorId: "author-1" },
      with: { books: true },
    });

    assert.ok(author);
    assert.equal(author.name, "Gabriel García Márquez");
    assert.ok(Array.isArray(author.books));
    assert.equal(author.books.length, 1);
    assert.equal(author.books[0].title, "One Hundred Years of Solitude");
  });

  // ===========================================
  // describeBook pattern: book + author + editions[] + genres[] + bookTags[] + reviews[]
  // ===========================================

  it("describeBook returns book with all relations", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: {
        author: true,
        editions: true,
        genres: true,
        bookTags: true,
        reviews: true,
      },
    });

    assert.ok(book);
    assert.equal(typeof book.author.name, "string");
    assert.ok(Array.isArray(book.editions));
    assert.ok(Array.isArray(book.genres));
    assert.ok(Array.isArray(book.bookTags));
    assert.ok(Array.isArray(book.reviews));
    assert.equal(book.editions.length, 1);
    assert.equal(book.genres.length, 2);
    assert.equal(book.bookTags.length, 2);
    assert.equal(book.reviews.length, 2);
  });

  // ===========================================
  // describeGenre pattern: genre + books[] (through junction)
  // ===========================================

  it("describeGenre returns genre with books through junction", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const genre = await db.query.genres.findFirst({
      where: { genreId: "genre-2" },
      with: { books: true },
    });

    assert.ok(genre);
    assert.equal(genre.name, "Literary Fiction");
    assert.ok(Array.isArray(genre.books));
    assert.equal(genre.books.length, 2);
  });

  // ===========================================
  // describeBookTag pattern: bookTag + book
  // ===========================================

  it("describeBookTag returns bookTag with book", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const tag = await db.query.bookTags.findFirst({
      where: { bookTagId: "tag-1" },
      with: { book: true },
    });

    assert.ok(tag);
    assert.equal(tag.name, "classic");
    assert.ok(tag.book);
    assert.equal(tag.book.title, "One Hundred Years of Solitude");
  });

  // ===========================================
  // describeTranslator pattern: translator + editions[]
  // ===========================================

  it("describeTranslator returns translator with editions", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const translator = await db.query.translators.findFirst({
      where: { translatorId: "translator-1" },
      with: { editions: true },
    });

    assert.ok(translator);
    assert.equal(translator.name, "Gregory Rabassa");
    assert.ok(Array.isArray(translator.editions));
    assert.equal(translator.editions.length, 1);
  });

  // ===========================================
  // describePublisher pattern: publisher + editions[]
  // ===========================================

  it("describePublisher returns publisher with editions", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const publisher = await db.query.publishers.findFirst({
      where: { publisherId: "publisher-1" },
      with: { editions: true },
    });

    assert.ok(publisher);
    assert.equal(publisher.name, "Harper & Row");
    assert.ok(Array.isArray(publisher.editions));
    assert.equal(publisher.editions.length, 1);
  });

  // ===========================================
  // describeEdition pattern: edition + book + translator + publisher
  // ===========================================

  it("describeEdition returns edition with all FK relations", async () => {
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
    assert.ok(edition.book);
    assert.ok(edition.translator);
    assert.ok(edition.publisher);
    assert.equal(edition.book.title, "One Hundred Years of Solitude");
    assert.equal(edition.translator.name, "Gregory Rabassa");
    assert.equal(edition.publisher.name, "Harper & Row");
  });

  it("describeEdition handles nullable translator (null FK)", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const edition = await db.query.editions.findFirst({
      where: { editionId: "edition-3" },
      with: {
        book: true,
        translator: true,
        publisher: true,
      },
    });

    assert.ok(edition);
    assert.equal(edition.translator, null);
    assert.ok(edition.book);
    assert.ok(edition.publisher);
  });

  // ===========================================
  // describeReview pattern: review + book
  // ===========================================

  it("describeReview returns review with book", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const review = await db.query.reviews.findFirst({
      where: { reviewId: "review-1" },
      with: { book: true },
    });

    assert.ok(review);
    assert.equal(review.rating, 5);
    assert.ok(review.book);
    assert.equal(review.book.title, "One Hundred Years of Solitude");
  });

  // ===========================================
  // Returns undefined for non-existent entity
  // ===========================================

  it("returns undefined for non-existent primary key", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const result = await db.query.books.findFirst({
      where: { bookId: "nonexistent" },
      with: { author: true },
    });

    assert.equal(result, undefined);
  });
});
