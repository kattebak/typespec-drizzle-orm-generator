import { defineRelations } from "drizzle-orm";
import * as schema from "./bookstore-schema.ts";

export const relations = defineRelations(schema, (r) => ({
  // ============================================
  // Author
  // ============================================
  authors: {
    books: r.many.books(),
  },

  // ============================================
  // Book
  // ============================================
  books: {
    author: r.one.authors({
      from: r.books.authorId,
      to: r.authors.authorId,
    }),
    editions: r.many.editions(),
    bookTags: r.many.bookTags(),
    reviews: r.many.reviews(),
    genres: r.many.genres({
      from: r.books.bookId.through(r.bookGenres.bookId),
      to: r.genres.genreId.through(r.bookGenres.genreId),
    }),
  },

  // ============================================
  // Genre
  // ============================================
  genres: {
    books: r.many.books({
      from: r.genres.genreId.through(r.bookGenres.genreId),
      to: r.books.bookId.through(r.bookGenres.bookId),
    }),
  },

  // ============================================
  // BookGenre (junction)
  // ============================================
  bookGenres: {
    book: r.one.books({
      from: r.bookGenres.bookId,
      to: r.books.bookId,
    }),
    genre: r.one.genres({
      from: r.bookGenres.genreId,
      to: r.genres.genreId,
    }),
  },

  // ============================================
  // BookTag
  // ============================================
  bookTags: {
    book: r.one.books({
      from: r.bookTags.bookId,
      to: r.books.bookId,
    }),
  },

  // ============================================
  // Translator
  // ============================================
  translators: {
    editions: r.many.editions(),
  },

  // ============================================
  // Publisher
  // ============================================
  publishers: {
    editions: r.many.editions(),
  },

  // ============================================
  // Edition
  // ============================================
  editions: {
    book: r.one.books({
      from: r.editions.bookId,
      to: r.books.bookId,
    }),
    translator: r.one.translators({
      from: r.editions.translatorId,
      to: r.translators.translatorId,
    }),
    publisher: r.one.publishers({
      from: r.editions.publisherId,
      to: r.publishers.publisherId,
    }),
  },

  // ============================================
  // Review
  // ============================================
  reviews: {
    book: r.one.books({
      from: r.reviews.bookId,
      to: r.books.bookId,
    }),
  },
}));
