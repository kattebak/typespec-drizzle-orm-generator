import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ============================================
// Author
// ============================================

export const authors = sqliteTable("authors", {
  authorId: text("author_id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio"),
  birthYear: integer("birth_year"),
  nationality: text("nationality"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// Book
// ============================================

export const books = sqliteTable("books", {
  bookId: text("book_id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => authors.authorId),
  title: text("title").notNull(),
  originalLanguage: text("original_language").notNull(),
  publicationYear: integer("publication_year").notNull(),
  isbn: text("isbn"),
  pageCount: integer("page_count"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// Genre
// ============================================

export const genres = sqliteTable("genres", {
  genreId: text("genre_id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// BookGenre (junction — composite primary key)
// ============================================

export const bookGenres = sqliteTable(
  "book_genres",
  {
    bookId: text("book_id")
      .notNull()
      .references(() => books.bookId),
    genreId: text("genre_id")
      .notNull()
      .references(() => genres.genreId),
  },
  (table) => [primaryKey({ columns: [table.bookId, table.genreId] })],
);

// ============================================
// BookTag
// ============================================

export const bookTags = sqliteTable("book_tags", {
  bookTagId: text("book_tag_id").primaryKey(),
  bookId: text("book_id")
    .notNull()
    .references(() => books.bookId),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// Translator
// ============================================

export const translators = sqliteTable("translators", {
  translatorId: text("translator_id").primaryKey(),
  name: text("name").notNull(),
  nativeLanguage: text("native_language").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// Publisher
// ============================================

export const publishers = sqliteTable("publishers", {
  publisherId: text("publisher_id").primaryKey(),
  name: text("name").notNull(),
  country: text("country"),
  founded: integer("founded"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// Edition
// ============================================

export const editions = sqliteTable("editions", {
  editionId: text("edition_id").primaryKey(),
  bookId: text("book_id")
    .notNull()
    .references(() => books.bookId),
  translatorId: text("translator_id").references(() => translators.translatorId),
  publisherId: text("publisher_id")
    .notNull()
    .references(() => publishers.publisherId),
  format: text("format").notNull(),
  language: text("language").notNull(),
  title: text("title").notNull(),
  isbn: text("isbn"),
  publicationYear: integer("publication_year").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================
// Review
// ============================================

export const reviews = sqliteTable("reviews", {
  reviewId: text("review_id").primaryKey(),
  bookId: text("book_id")
    .notNull()
    .references(() => books.bookId),
  rating: integer("rating").notNull(),
  text: text("text"),
  reviewerName: text("reviewer_name").notNull(),
  reviewDate: text("review_date").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
