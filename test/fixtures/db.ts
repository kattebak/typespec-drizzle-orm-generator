import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { relations } from "./bookstore-relations.ts";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create all tables using raw client (supports multiple statements)
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
      rating INTEGER NOT NULL,
      text TEXT,
      reviewer_name TEXT NOT NULL,
      review_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Wrap with drizzle after tables exist — v2 API uses { client, relations }
  return drizzle({ client: sqlite, relations });
}
