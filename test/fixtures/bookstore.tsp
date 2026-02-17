import "@kattebak/typespec-drizzle-orm-generator";

using DrizzleEmitter;

namespace Bookstore;

// ============================================
// Author
// ============================================

@entity("Author", "bookstore")
@primaryKey("authors")
model Author {
  @pk
  @uuid("base36", true)
  authorId: string;

  name: string;

  bio?: string;

  birthYear?: int32;

  nationality?: string;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Book
// ============================================

@entity("Book", "bookstore")
@primaryKey("books")
model Book {
  @pk
  @uuid("base36", true)
  bookId: string;

  @uuid("base36")
  @references(Author.authorId)
  authorId: string;

  title: string;

  originalLanguage: string;

  publicationYear: int32;

  isbn?: string;

  pageCount?: int32;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Genre
// ============================================

@entity("Genre", "bookstore")
@primaryKey("genres")
model Genre {
  @pk
  @uuid("base36", true)
  genreId: string;

  name: string;

  description?: string;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// BookGenre (junction — links Book ↔ Genre)
// ============================================

@entity("BookGenre", "bookstore")
@junction
@primaryKey("book_genres")
model BookGenre {
  @pk
  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  @pk
  @uuid("base36")
  @references(Genre.genreId)
  genreId: string;
}

// ============================================
// BookTag
// ============================================

@entity("BookTag", "bookstore")
@primaryKey("book_tags")
model BookTag {
  @pk
  @uuid("base36", true)
  bookTagId: string;

  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  name: string;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Translator
// ============================================

@entity("Translator", "bookstore")
@primaryKey("translators")
model Translator {
  @pk
  @uuid("base36", true)
  translatorId: string;

  name: string;

  nativeLanguage: string;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Publisher
// ============================================

@entity("Publisher", "bookstore")
@primaryKey("publishers")
model Publisher {
  @pk
  @uuid("base36", true)
  publisherId: string;

  name: string;

  country?: string;

  founded?: int32;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Edition
// ============================================

@entity("Edition", "bookstore")
@primaryKey("editions")
model Edition {
  @pk
  @uuid("base36", true)
  editionId: string;

  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  @uuid("base36")
  @references(Translator.translatorId)
  translatorId?: string;

  @uuid("base36")
  @references(Publisher.publisherId)
  publisherId: string;

  language: string;

  title: string;

  isbn?: string;

  publicationYear: int32;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Review
// ============================================

@entity("Review", "bookstore")
@primaryKey("reviews")
model Review {
  @pk
  @uuid("base36", true)
  reviewId: string;

  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  rating: int32;

  text?: string;

  reviewerName: string;

  reviewDate: utcDateTime;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}
