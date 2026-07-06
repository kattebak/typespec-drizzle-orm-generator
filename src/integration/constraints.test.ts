import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { relations } from "../fixtures/bookstore-relations.ts";
import * as schema from "../fixtures/bookstore-schema.ts";

function createConstraintDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE authors (
      author_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bio TEXT,
      birth_year INTEGER,
      nationality TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE books (
      book_id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES authors(author_id),
      title TEXT NOT NULL,
      original_language TEXT NOT NULL,
      publication_year INTEGER NOT NULL,
      isbn TEXT UNIQUE,
      page_count INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE genres (
      genre_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE book_genres (
      book_id TEXT NOT NULL REFERENCES books(book_id),
      genre_id TEXT NOT NULL REFERENCES genres(genre_id),
      PRIMARY KEY (book_id, genre_id)
    );

    CREATE TABLE book_tags (
      book_tag_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE translators (
      translator_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      native_language TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE publishers (
      publisher_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      founded INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE editions (
      edition_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      translator_id TEXT REFERENCES translators(translator_id),
      publisher_id TEXT NOT NULL REFERENCES publishers(publisher_id),
      format TEXT NOT NULL,
      language TEXT NOT NULL,
      title TEXT NOT NULL,
      isbn TEXT,
      publication_year INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(book_id, language)
    );

    CREATE TABLE reviews (
      review_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      text TEXT,
      reviewer_name TEXT NOT NULL,
      review_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return drizzle({ client: sqlite, relations });
}

const now = "2026-01-15T10:00:00.000Z";

function seedMinimal(db: ReturnType<typeof createConstraintDb>): void {
  db.insert(schema.authors)
    .values({
      authorId: "author-1",
      name: "Test Author",
      bio: null,
      birthYear: null,
      nationality: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.books)
    .values({
      bookId: "book-1",
      authorId: "author-1",
      title: "Test Book",
      originalLanguage: "English",
      publicationYear: 2024,
      isbn: "978-0-000-00000-1",
      pageCount: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.publishers)
    .values({
      publisherId: "pub-1",
      name: "Test Publisher",
      country: null,
      founded: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.translators)
    .values({
      translatorId: "trans-1",
      name: "Test Translator",
      nativeLanguage: "English",
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe("constraint enforcement (SQLite integration)", () => {
  // ===========================================
  // UNIQUE constraint on books.isbn
  // ===========================================

  it("rejects duplicate isbn on books table", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    assert.throws(
      () => {
        db.insert(schema.books)
          .values({
            bookId: "book-2",
            authorId: "author-1",
            title: "Another Book",
            originalLanguage: "English",
            publicationYear: 2025,
            isbn: "978-0-000-00000-1", // same ISBN as book-1
            pageCount: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      },
      (err: Error) => {
        assert.ok(err.message.includes("UNIQUE constraint failed"), err.message);
        return true;
      },
    );
  });

  it("allows null isbn on multiple books (UNIQUE allows multiple NULLs)", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    // Insert two books with null isbn — should not throw
    db.insert(schema.books)
      .values({
        bookId: "book-null-1",
        authorId: "author-1",
        title: "Book Without ISBN 1",
        originalLanguage: "English",
        publicationYear: 2024,
        isbn: null,
        pageCount: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.books)
      .values({
        bookId: "book-null-2",
        authorId: "author-1",
        title: "Book Without ISBN 2",
        originalLanguage: "English",
        publicationYear: 2024,
        isbn: null,
        pageCount: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // No assertion needed — the absence of an error is the test
    assert.ok(true);
  });

  // ===========================================
  // Composite UNIQUE on editions(book_id, language)
  // ===========================================

  it("rejects duplicate (book_id, language) on editions", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    db.insert(schema.editions)
      .values({
        editionId: "ed-1",
        bookId: "book-1",
        translatorId: "trans-1",
        publisherId: "pub-1",
        format: "hardcover",
        language: "English",
        title: "Test Book",
        isbn: null,
        publicationYear: 2024,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    assert.throws(
      () => {
        db.insert(schema.editions)
          .values({
            editionId: "ed-2",
            bookId: "book-1",
            translatorId: null,
            publisherId: "pub-1",
            format: "paperback",
            language: "English", // same book_id + language
            title: "Test Book Paperback",
            isbn: null,
            publicationYear: 2025,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      },
      (err: Error) => {
        assert.ok(err.message.includes("UNIQUE constraint failed"), err.message);
        return true;
      },
    );
  });

  it("allows same book_id with different language on editions", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    db.insert(schema.editions)
      .values({
        editionId: "ed-1",
        bookId: "book-1",
        translatorId: "trans-1",
        publisherId: "pub-1",
        format: "hardcover",
        language: "English",
        title: "Test Book",
        isbn: null,
        publicationYear: 2024,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.editions)
      .values({
        editionId: "ed-2",
        bookId: "book-1",
        translatorId: "trans-1",
        publisherId: "pub-1",
        format: "hardcover",
        language: "Spanish", // different language — allowed
        title: "Libro de Prueba",
        isbn: null,
        publicationYear: 2025,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    assert.ok(true);
  });

  // ===========================================
  // FK constraint enforcement
  // ===========================================

  it("rejects book with non-existent author_id", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    assert.throws(
      () => {
        db.insert(schema.books)
          .values({
            bookId: "book-orphan",
            authorId: "author-nonexistent",
            title: "Orphan Book",
            originalLanguage: "English",
            publicationYear: 2024,
            isbn: null,
            pageCount: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      },
      (err: Error) => {
        assert.ok(err.message.includes("FOREIGN KEY constraint failed"), err.message);
        return true;
      },
    );
  });

  it("rejects edition with non-existent publisher_id", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    assert.throws(
      () => {
        db.insert(schema.editions)
          .values({
            editionId: "ed-bad",
            bookId: "book-1",
            translatorId: null,
            publisherId: "pub-nonexistent",
            format: "paperback",
            language: "English",
            title: "Bad Edition",
            isbn: null,
            publicationYear: 2024,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      },
      (err: Error) => {
        assert.ok(err.message.includes("FOREIGN KEY constraint failed"), err.message);
        return true;
      },
    );
  });

  it("allows edition with null translator_id (nullable FK)", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    db.insert(schema.editions)
      .values({
        editionId: "ed-no-trans",
        bookId: "book-1",
        translatorId: null,
        publisherId: "pub-1",
        format: "hardcover",
        language: "English",
        title: "Original Edition",
        isbn: null,
        publicationYear: 2024,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    assert.ok(true);
  });

  // ===========================================
  // CHECK constraint on reviews.rating
  // ===========================================

  it("rejects review with rating below minimum (< 1)", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    assert.throws(
      () => {
        db.insert(schema.reviews)
          .values({
            reviewId: "rev-bad",
            bookId: "book-1",
            rating: 0,
            text: "Bad rating",
            reviewerName: "Test",
            reviewDate: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      },
      (err: Error) => {
        assert.ok(err.message.includes("CHECK constraint failed"), err.message);
        return true;
      },
    );
  });

  it("rejects review with rating above maximum (> 5)", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    assert.throws(
      () => {
        db.insert(schema.reviews)
          .values({
            reviewId: "rev-bad-high",
            bookId: "book-1",
            rating: 6,
            text: "Too high",
            reviewerName: "Test",
            reviewDate: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      },
      (err: Error) => {
        assert.ok(err.message.includes("CHECK constraint failed"), err.message);
        return true;
      },
    );
  });

  it("accepts review with rating at boundaries (1 and 5)", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    db.insert(schema.reviews)
      .values({
        reviewId: "rev-min",
        bookId: "book-1",
        rating: 1,
        text: "Minimum valid",
        reviewerName: "Test",
        reviewDate: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.reviews)
      .values({
        reviewId: "rev-max",
        bookId: "book-1",
        rating: 5,
        text: "Maximum valid",
        reviewerName: "Test",
        reviewDate: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    assert.ok(true);
  });

  // ===========================================
  // Composite PK on book_genres
  // ===========================================

  it("rejects duplicate composite PK on book_genres", () => {
    const db = createConstraintDb();
    seedMinimal(db);

    db.insert(schema.genres)
      .values({
        genreId: "genre-1",
        name: "Fiction",
        description: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.bookGenres).values({ bookId: "book-1", genreId: "genre-1" }).run();

    assert.throws(
      () => {
        db.insert(schema.bookGenres)
          .values({ bookId: "book-1", genreId: "genre-1" }) // duplicate
          .run();
      },
      (err: Error) => {
        assert.ok(
          err.message.includes("UNIQUE constraint failed") || err.message.includes("PRIMARY KEY"),
          err.message,
        );
        return true;
      },
    );
  });
});
