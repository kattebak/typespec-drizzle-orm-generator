import * as schema from "./bookstore-schema.ts";
import type { createTestDb } from "./db.ts";

const now = "2026-01-15T10:00:00.000Z";

export function seedBookstore(db: ReturnType<typeof createTestDb>): void {
  // Authors
  db.insert(schema.authors)
    .values([
      {
        authorId: "author-1",
        name: "Gabriel García Márquez",
        bio: "Colombian novelist",
        birthYear: 1927,
        nationality: "Colombian",
        createdAt: now,
        updatedAt: now,
      },
      {
        authorId: "author-2",
        name: "Haruki Murakami",
        bio: "Japanese writer",
        birthYear: 1949,
        nationality: "Japanese",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // Books
  db.insert(schema.books)
    .values([
      {
        bookId: "book-1",
        authorId: "author-1",
        title: "One Hundred Years of Solitude",
        originalLanguage: "Spanish",
        publicationYear: 1967,
        isbn: "978-0-06-088328-7",
        pageCount: 417,
        createdAt: now,
        updatedAt: now,
      },
      {
        bookId: "book-2",
        authorId: "author-2",
        title: "Norwegian Wood",
        originalLanguage: "Japanese",
        publicationYear: 1987,
        isbn: "978-0-375-70402-4",
        pageCount: 296,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // Genres
  db.insert(schema.genres)
    .values([
      {
        genreId: "genre-1",
        name: "Magical Realism",
        description: "Literary fiction with magical elements",
        createdAt: now,
        updatedAt: now,
      },
      {
        genreId: "genre-2",
        name: "Literary Fiction",
        description: "Character-driven narrative fiction",
        createdAt: now,
        updatedAt: now,
      },
      {
        genreId: "genre-3",
        name: "Romance",
        description: "Love and relationships",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // BookGenres (junction)
  db.insert(schema.bookGenres)
    .values([
      { bookId: "book-1", genreId: "genre-1" },
      { bookId: "book-1", genreId: "genre-2" },
      { bookId: "book-2", genreId: "genre-2" },
      { bookId: "book-2", genreId: "genre-3" },
    ])
    .run();

  // BookTags
  db.insert(schema.bookTags)
    .values([
      {
        bookTagId: "tag-1",
        bookId: "book-1",
        name: "classic",
        createdAt: now,
        updatedAt: now,
      },
      {
        bookTagId: "tag-2",
        bookId: "book-1",
        name: "latin-american",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // Translators
  db.insert(schema.translators)
    .values([
      {
        translatorId: "translator-1",
        name: "Gregory Rabassa",
        nativeLanguage: "English",
        createdAt: now,
        updatedAt: now,
      },
      {
        translatorId: "translator-2",
        name: "Jay Rubin",
        nativeLanguage: "English",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // Publishers
  db.insert(schema.publishers)
    .values([
      {
        publisherId: "publisher-1",
        name: "Harper & Row",
        country: "United States",
        founded: 1817,
        createdAt: now,
        updatedAt: now,
      },
      {
        publisherId: "publisher-2",
        name: "Kodansha",
        country: "Japan",
        founded: 1909,
        createdAt: now,
        updatedAt: now,
      },
      {
        publisherId: "publisher-3",
        name: "Vintage Books",
        country: "United States",
        founded: 1954,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // Editions
  db.insert(schema.editions)
    .values([
      {
        editionId: "edition-1",
        bookId: "book-1",
        translatorId: "translator-1",
        publisherId: "publisher-1",
        format: "hardcover",
        language: "English",
        title: "One Hundred Years of Solitude",
        isbn: "978-0-06-088328-7",
        publicationYear: 1970,
        createdAt: now,
        updatedAt: now,
      },
      {
        editionId: "edition-2",
        bookId: "book-2",
        translatorId: "translator-2",
        publisherId: "publisher-3",
        format: "paperback",
        language: "English",
        title: "Norwegian Wood",
        isbn: "978-0-375-70402-4",
        publicationYear: 2000,
        createdAt: now,
        updatedAt: now,
      },
      {
        editionId: "edition-3",
        bookId: "book-2",
        translatorId: null,
        publisherId: "publisher-2",
        format: "hardcover",
        language: "Japanese",
        title: "ノルウェイの森",
        isbn: null,
        publicationYear: 1987,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // Reviews
  db.insert(schema.reviews)
    .values([
      {
        reviewId: "review-1",
        bookId: "book-1",
        rating: 5,
        text: "A masterpiece of magical realism",
        reviewerName: "Alice",
        reviewDate: "2025-06-15T00:00:00.000Z",
        createdAt: now,
        updatedAt: now,
      },
      {
        reviewId: "review-2",
        bookId: "book-1",
        rating: 4,
        text: "Beautifully written",
        reviewerName: "Bob",
        reviewDate: "2025-07-01T00:00:00.000Z",
        createdAt: now,
        updatedAt: now,
      },
      {
        reviewId: "review-3",
        bookId: "book-2",
        rating: 5,
        text: "Deeply moving",
        reviewerName: "Charlie",
        reviewDate: "2025-08-10T00:00:00.000Z",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();
}
