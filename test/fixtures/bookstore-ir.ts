import type { EntityDef, EnumDef } from "../../src/ir/types.ts";

// ============================================
// Author
// ============================================

const author: EntityDef = {
  name: "Author",
  service: "bookstore",
  tableName: "authors",
  primaryKey: { tableName: "authors", columns: ["authorId"], isComposite: false },
  fields: [
    {
      name: "authorId",
      columnName: "author_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "name",
      columnName: "name",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "bio",
      columnName: "bio",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "birthYear",
      columnName: "birth_year",
      type: { kind: "integer" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "nationality",
      columnName: "nationality",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

// ============================================
// Book
// ============================================

const book: EntityDef = {
  name: "Book",
  service: "bookstore",
  tableName: "books",
  primaryKey: { tableName: "books", columns: ["bookId"], isComposite: false },
  fields: [
    {
      name: "bookId",
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "authorId",
      columnName: "author_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Author", fieldName: "authorId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "title",
      columnName: "title",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "originalLanguage",
      columnName: "original_language",
      type: { kind: "text" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "publicationYear",
      columnName: "publication_year",
      type: { kind: "integer" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "isbn",
      columnName: "isbn",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
      constraints: { unique: true },
    },
    {
      name: "pageCount",
      columnName: "page_count",
      type: { kind: "integer" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [
    {
      name: "books_author_publication_idx",
      columns: ["authorId", "publicationYear"],
      unique: false,
    },
  ],
  uniqueConstraints: [],
};

// ============================================
// Genre
// ============================================

const genre: EntityDef = {
  name: "Genre",
  service: "bookstore",
  tableName: "genres",
  primaryKey: { tableName: "genres", columns: ["genreId"], isComposite: false },
  fields: [
    {
      name: "genreId",
      columnName: "genre_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "name",
      columnName: "name",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "description",
      columnName: "description",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

// ============================================
// BookGenre (junction)
// ============================================

const bookGenre: EntityDef = {
  name: "BookGenre",
  service: "bookstore",
  tableName: "book_genres",
  primaryKey: {
    tableName: "book_genres",
    columns: ["bookId", "genreId"],
    isComposite: true,
  },
  fields: [
    {
      name: "bookId",
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Book", fieldName: "bookId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "genreId",
      columnName: "genre_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Genre", fieldName: "genreId" },
      createdAt: false,
      updatedAt: false,
    },
  ],
  foreignKeys: [],
  isJunction: true,
  indexes: [],
  uniqueConstraints: [],
};

// ============================================
// BookTag
// ============================================

const bookTag: EntityDef = {
  name: "BookTag",
  service: "bookstore",
  tableName: "book_tags",
  primaryKey: { tableName: "book_tags", columns: ["bookTagId"], isComposite: false },
  fields: [
    {
      name: "bookTagId",
      columnName: "book_tag_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "bookId",
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Book", fieldName: "bookId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "name",
      columnName: "name",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

// ============================================
// Translator
// ============================================

const translator: EntityDef = {
  name: "Translator",
  service: "bookstore",
  tableName: "translators",
  primaryKey: { tableName: "translators", columns: ["translatorId"], isComposite: false },
  fields: [
    {
      name: "translatorId",
      columnName: "translator_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "name",
      columnName: "name",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "nativeLanguage",
      columnName: "native_language",
      type: { kind: "text" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

// ============================================
// Publisher
// ============================================

const publisher: EntityDef = {
  name: "Publisher",
  service: "bookstore",
  tableName: "publishers",
  primaryKey: { tableName: "publishers", columns: ["publisherId"], isComposite: false },
  fields: [
    {
      name: "publisherId",
      columnName: "publisher_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "name",
      columnName: "name",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "country",
      columnName: "country",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "founded",
      columnName: "founded",
      type: { kind: "integer" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

// ============================================
// Edition
// ============================================

const edition: EntityDef = {
  name: "Edition",
  service: "bookstore",
  tableName: "editions",
  primaryKey: { tableName: "editions", columns: ["editionId"], isComposite: false },
  fields: [
    {
      name: "editionId",
      columnName: "edition_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "bookId",
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Book", fieldName: "bookId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "translatorId",
      columnName: "translator_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: true,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Translator", fieldName: "translatorId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "publisherId",
      columnName: "publisher_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Publisher", fieldName: "publisherId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "format",
      columnName: "format",
      type: {
        kind: "enum",
        enumName: "bookFormatEnum",
        values: ["hardcover", "paperback", "ebook", "audiobook"],
      },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "language",
      columnName: "language",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "title",
      columnName: "title",
      type: { kind: "text" },
      nullable: false,
      visibility: "read",
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "isbn",
      columnName: "isbn",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "publicationYear",
      columnName: "publication_year",
      type: { kind: "integer" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [
    {
      name: "edition_book_language_uq",
      columns: ["bookId", "language"],
    },
  ],
};

// ============================================
// Review
// ============================================

const review: EntityDef = {
  name: "Review",
  service: "bookstore",
  tableName: "reviews",
  primaryKey: { tableName: "reviews", columns: ["reviewId"], isComposite: false },
  fields: [
    {
      name: "reviewId",
      columnName: "review_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: true },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "bookId",
      columnName: "book_id",
      type: { kind: "uuid", encoding: "base36" },
      nullable: false,
      uuid: { encoding: "base36", autoGenerate: false },
      references: { entityName: "Book", fieldName: "bookId" },
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "rating",
      columnName: "rating",
      type: { kind: "integer" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
      constraints: { minValue: 1, maxValue: 5 },
    },
    {
      name: "text",
      columnName: "text",
      type: { kind: "text" },
      nullable: true,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "reviewerName",
      columnName: "reviewer_name",
      type: { kind: "text" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "reviewDate",
      columnName: "review_date",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    },
    {
      name: "createdAt",
      columnName: "created_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: true,
      updatedAt: false,
    },
    {
      name: "updatedAt",
      columnName: "updated_at",
      type: { kind: "timestamp" },
      nullable: false,
      createdAt: false,
      updatedAt: true,
    },
  ],
  foreignKeys: [],
  isJunction: false,
  indexes: [],
  uniqueConstraints: [],
};

/** All 9 bookstore entities as IR, ordered for FK resolution */
export const bookstoreEntities: EntityDef[] = [
  author,
  book,
  genre,
  bookGenre,
  bookTag,
  translator,
  publisher,
  edition,
  review,
];

/** BookFormat enum — used by Edition.format */
export const bookstoreEnums: EnumDef[] = [
  {
    name: "bookFormatEnum",
    sqlName: "book_format",
    values: ["hardcover", "paperback", "ebook", "audiobook"],
  },
];
