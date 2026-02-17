# TypeSpec Drizzle ORM Emitter

A TypeSpec emitter that generates Drizzle ORM schemas for PostgreSQL from annotated TypeSpec model definitions — producing table schemas, relation declarations, and typed describe queries.

## Abstract

The existing `typespec-electrodb-emitter` generates ElectroDB entity schemas from TypeSpec definitions targeting DynamoDB. This RFC proposes a companion emitter, `typespec-drizzle-emitter`, that generates Drizzle ORM code for PostgreSQL from TypeSpec models using **explicit relational annotations**.

Rather than translating DynamoDB-specific concepts (GSI indexes, collections, single-table design), the Drizzle emitter uses PostgreSQL-native annotations: `@primaryKey` for table names and primary keys, `@references` for foreign keys, `@foreignKey` for composite foreign keys, and `@junction` to mark junction tables. From these, the emitter generates table definitions, `defineRelations` declarations, and typed **describe** query functions for every non-junction entity.

## Motivation

- **PostgreSQL-native schema generation**: TypeSpec models should emit idiomatic PostgreSQL — native types, foreign key constraints, triggers, and enum types.
- **Preserve the `describe()` pattern**: Typed query functions that fetch an entity with all related data in one call are central to the service layer. The Drizzle emitter generates these automatically for every non-junction entity.
- **Type safety end-to-end**: Generated table schemas, relation types, and describe query return types are fully inferred from TypeSpec — no manual type definitions.
- **No inference**: All relationships are explicit. Foreign keys come from `@references`, junction tables from `@junction`. The emitter does not guess.

## Domain Model: Bookstore

All examples use the following bookstore domain.

### Entity Relationship Diagram

```
Author (1) ──────── (N) Book
                         │
                    ┌────┴────────────────────┐
                    │                         │
              (N) Edition               (N) BookGenre ── (1) Genre
                    │                     (@junction)
                    │                    (N) BookTag
              (1) Translator
                                        (N) Review
              (1) Publisher
```

### Entities

| Entity     | Table         | Primary Key         | Junction |
| ---------- | ------------- | ------------------- | -------- |
| Author     | `authors`     | `authorId`          | No       |
| Book       | `books`       | `bookId`            | No       |
| Genre      | `genres`      | `genreId`           | No       |
| BookGenre  | `book_genres` | `(bookId, genreId)` | Yes      |
| BookTag    | `book_tags`   | `bookTagId`         | No       |
| Translator | `translators` | `translatorId`      | No       |
| Publisher  | `publishers`  | `publisherId`       | No       |
| Edition    | `editions`    | `editionId`         | No       |
| Review     | `reviews`     | `reviewId`          | No       |

## TypeSpec Definitions

### Decorators

The Drizzle emitter introduces its own decorator set — similar in spirit to the ElectroDB emitter but designed for relational databases.

| Decorator                                        | Target        | Purpose                                                      |
| ------------------------------------------------ | ------------- | ------------------------------------------------------------ |
| `@entity(name, service)`                         | Model         | Entity name and service/schema grouping                      |
| `@primaryKey({ name, columns })`                 | Model         | Table name and primary key column(s)                         |
| `@references(Model.field)`                       | ModelProperty | Single-column foreign key to another entity's field          |
| `@foreignKey({ columns, foreignColumns, name })` | Model         | Composite (multi-column) foreign key constraint              |
| `@junction`                                      | Model         | Marks entity as a junction table — skips describe generation |
| `@uuid(encoding, autoGenerate?)`                 | ModelProperty | UUID storage encoding and optional auto-generation           |
| `@createdAt`                                     | ModelProperty | Timestamp with `DEFAULT NOW()`                               |
| `@updatedAt`                                     | ModelProperty | Timestamp with `DEFAULT NOW()` + `BEFORE UPDATE` trigger     |
| `@visibility(Lifecycle.Read)`                    | ModelProperty | Marks field as read-only in generated types                  |

### Models

```typespec
import "typespec-drizzle-emitter";

namespace Bookstore;

// ============================================
// Author
// ============================================

@entity("author", "bookstore")
@primaryKey({
  name: "authors",
  columns: [Author.authorId],
})
model Author {
  @uuid("base36", true)
  authorId: string;

  @visibility(Lifecycle.Read)
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

@entity("book", "bookstore")
@primaryKey({
  name: "books",
  columns: [Book.bookId],
})
model Book {
  @uuid("base36", true)
  bookId: string;

  @uuid("base36")
  @references(Author.authorId)
  authorId: string;

  @visibility(Lifecycle.Read)
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

@entity("genre", "bookstore")
@primaryKey({
  name: "genres",
  columns: [Genre.genreId],
})
model Genre {
  @uuid("base36", true)
  genreId: string;

  @visibility(Lifecycle.Read)
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

@entity("book_genre", "bookstore")
@junction
@primaryKey({
  name: "book_genres",
  columns: [BookGenre.bookId, BookGenre.genreId],
})
model BookGenre {
  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  @uuid("base36")
  @references(Genre.genreId)
  genreId: string;
}

// ============================================
// BookTag
// ============================================

@entity("book_tag", "bookstore")
@primaryKey({
  name: "book_tags",
  columns: [BookTag.bookTagId],
})
model BookTag {
  @uuid("base36", true)
  bookTagId: string;

  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  @visibility(Lifecycle.Read)
  name: string;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Translator
// ============================================

@entity("translator", "bookstore")
@primaryKey({
  name: "translators",
  columns: [Translator.translatorId],
})
model Translator {
  @uuid("base36", true)
  translatorId: string;

  @visibility(Lifecycle.Read)
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

@entity("publisher", "bookstore")
@primaryKey({
  name: "publishers",
  columns: [Publisher.publisherId],
})
model Publisher {
  @uuid("base36", true)
  publisherId: string;

  @visibility(Lifecycle.Read)
  name: string;

  country?: string;

  founded?: int32;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}

// ============================================
// Edition (a book in a specific language)
// ============================================

@entity("edition", "bookstore")
@primaryKey({
  name: "editions",
  columns: [Edition.editionId],
})
model Edition {
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

  @visibility(Lifecycle.Read)
  language: string;

  @visibility(Lifecycle.Read)
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

@entity("review", "bookstore")
@primaryKey({
  name: "reviews",
  columns: [Review.reviewId],
})
model Review {
  @uuid("base36", true)
  reviewId: string;

  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  @minValue(1)
  @maxValue(5)
  rating: int32;

  text?: string;

  reviewerName: string;

  reviewDate: utcDateTime;

  @createdAt
  createdAt: utcDateTime;

  @updatedAt
  updatedAt: utcDateTime;
}
```

### Composite Foreign Keys

For multi-column foreign keys that can't be expressed with a single `@references`, use the `@foreignKey` decorator on the model:

```typespec
@entity("book_author", "bookstore")
@primaryKey({
  name: "book_authors",
  columns: [BookAuthor.bookId, BookAuthor.authorId],
})
@foreignKey({
  columns: [BookAuthor.authorId, BookAuthor.authorFullName],
  foreignColumns: [Author.authorId, Author.fullName],
  name: "author_name_fk",
})
model BookAuthor {
  @references(Book.bookId)
  bookId: string;

  @references(Author.authorId)
  authorId: string;

  @references(Author.fullName)
  authorFullName: string;
}
```

This generates a named composite foreign key constraint in addition to the individual column references.

## Generated Output

The emitter produces a package with five categories of output:

```
build/drizzle-schema/
  package.json
  types.ts           # Custom column types (base36Uuid)
  schema.ts          # Table definitions
  relations.ts       # Drizzle defineRelations declarations
  describe.ts        # Typed describe query functions
  index.ts           # Re-exports
```

### 1. Custom Types (`types.ts`)

The `base36Uuid` custom type stores native PostgreSQL `uuid` values but automatically marshals to/from base36 strings at the application boundary:

```typescript
// Generated: build/drizzle-schema/types.ts

import { customType } from "drizzle-orm/pg-core";
import short from "short-uuid";

const translator = short(short.constants.uuid25Base36);

/** UUID column that stores as native pg uuid, reads/writes as base36 */
export const base36Uuid = customType<{
  data: string; // Application sees base36 strings
  driverData: string; // Database sees uuid strings
}>({
  dataType: () => "uuid",
  toDriver: (value: string): string => translator.toUUID(value),
  fromDriver: (value: string): string => translator.fromUUID(value),
});
```

With this approach, marshaling is transparent — Drizzle handles it at the driver level. Application code works exclusively with base36 strings; the database stores native `uuid` values with optimized indexing.

### 2. Table Definitions (`schema.ts`)

Each `@entity` produces a `pgTable()` call. The `@primaryKey` provides the table name and primary key columns. Fields with `@references` emit `.references()` constraints.

```typescript
// Generated: build/drizzle-schema/schema.ts

import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { base36Uuid } from "./types.js";

// ============================================
// Author
// ============================================

export const authors = pgTable("authors", {
  authorId: base36Uuid("author_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  bio: text("bio"),
  birthYear: integer("birth_year"),
  nationality: text("nationality"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// Book
// ============================================

export const books = pgTable("books", {
  bookId: base36Uuid("book_id").primaryKey().defaultRandom(),
  authorId: base36Uuid("author_id")
    .notNull()
    .references(() => authors.authorId),
  title: text("title").notNull(),
  originalLanguage: text("original_language").notNull(),
  publicationYear: integer("publication_year").notNull(),
  isbn: text("isbn"),
  pageCount: integer("page_count"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// Genre
// ============================================

export const genres = pgTable("genres", {
  genreId: base36Uuid("genre_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// BookGenre (junction — composite primary key)
// ============================================

export const bookGenres = pgTable(
  "book_genres",
  {
    bookId: base36Uuid("book_id")
      .notNull()
      .references(() => books.bookId),
    genreId: base36Uuid("genre_id")
      .notNull()
      .references(() => genres.genreId),
  },
  (table) => [
    primaryKey({
      name: "book_genres_pk",
      columns: [table.bookId, table.genreId],
    }),
  ],
);

// ============================================
// BookTag
// ============================================

export const bookTags = pgTable("book_tags", {
  bookTagId: base36Uuid("book_tag_id").primaryKey().defaultRandom(),
  bookId: base36Uuid("book_id")
    .notNull()
    .references(() => books.bookId),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// Translator
// ============================================

export const translators = pgTable("translators", {
  translatorId: base36Uuid("translator_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nativeLanguage: text("native_language").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// Publisher
// ============================================

export const publishers = pgTable("publishers", {
  publisherId: base36Uuid("publisher_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  country: text("country"),
  founded: integer("founded"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// Edition
// ============================================

export const editions = pgTable("editions", {
  editionId: base36Uuid("edition_id").primaryKey().defaultRandom(),
  bookId: base36Uuid("book_id")
    .notNull()
    .references(() => books.bookId),
  translatorId: base36Uuid("translator_id").references(
    () => translators.translatorId,
  ),
  publisherId: base36Uuid("publisher_id")
    .notNull()
    .references(() => publishers.publisherId),
  language: text("language").notNull(),
  title: text("title").notNull(),
  isbn: text("isbn"),
  publicationYear: integer("publication_year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================
// Review
// ============================================

export const reviews = pgTable("reviews", {
  reviewId: base36Uuid("review_id").primaryKey().defaultRandom(),
  bookId: base36Uuid("book_id")
    .notNull()
    .references(() => books.bookId),
  rating: integer("rating").notNull(),
  text: text("text"),
  reviewerName: text("reviewer_name").notNull(),
  reviewDate: timestamp("review_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

#### `@uuid` Encoding and Auto-Generation

The `@uuid(encoding, autoGenerate?)` decorator controls two concerns:

| Parameter      | Values                               | Purpose                                         |
| -------------- | ------------------------------------ | ----------------------------------------------- |
| `encoding`     | `"base36"`, `"canonical"`, `"raw"`   | How the UUID appears outside the database       |
| `autoGenerate` | `true` (optional, defaults to false) | Whether PostgreSQL generates the UUID on insert |

| Annotation              | Generated Column                                 |
| ----------------------- | ------------------------------------------------ |
| `@uuid("base36", true)` | `base36Uuid("col").primaryKey().defaultRandom()` |
| `@uuid("base36")`       | `base36Uuid("col").notNull()`                    |
| No `@uuid`              | `text("col")` (plain string, no marshaling)      |

The `defaultRandom()` call maps to PostgreSQL's `gen_random_uuid()` — the database generates the UUID, and the `base36Uuid` custom type marshals it to base36 when reading.

#### Type Conversion Rules

Every TypeSpec type maps to its native PostgreSQL counterpart. If PostgreSQL has a native type, we use it.

| TypeSpec Type                         | Drizzle Column                        | PostgreSQL Type                  |
| ------------------------------------- | ------------------------------------- | -------------------------------- |
| `string` with `@uuid("base36")`       | `base36Uuid()` custom type            | `uuid`                           |
| `string` with `@uuid("base36", true)` | `base36Uuid().defaultRandom()`        | `uuid DEFAULT gen_random_uuid()` |
| `string`                              | `text()`                              | `text`                           |
| `String256` (length scalars)          | `varchar("col", { length: 256 })`     | `varchar(256)`                   |
| `int32`                               | `integer()`                           | `integer`                        |
| `int64`                               | `bigint({ mode: "number" })`          | `bigint`                         |
| `float32`                             | `real()`                              | `real`                           |
| `float64`                             | `doublePrecision()`                   | `double precision`               |
| `boolean`                             | `boolean()`                           | `boolean`                        |
| `utcDateTime`                         | `timestamp({ withTimezone: true })`   | `timestamptz`                    |
| Enum                                  | `pgEnum()` + generated enum type      | `CREATE TYPE ... AS ENUM`        |
| Optional (`?`)                        | No `.notNull()` (nullable by default) | nullable                         |
| Required                              | `.notNull()`                          | `NOT NULL`                       |

#### Enum Generation

TypeSpec enums emit as PostgreSQL native enum types via Drizzle's `pgEnum()`:

```typespec
enum BookFormat {
  Hardcover: "hardcover",
  Paperback: "paperback",
  Ebook: "ebook",
  Audiobook: "audiobook",
}
```

Generated:

```typescript
export const bookFormatEnum = pgEnum("book_format", [
  "hardcover",
  "paperback",
  "ebook",
  "audiobook",
]);

// Usage in table definition
export const editions = pgTable("editions", {
  // ...
  format: bookFormatEnum("format").notNull(),
});
```

Database-enforced value constraints, efficient storage (internally stored as integers by PostgreSQL), and clean `WHERE format = 'ebook'` queries.

#### Timestamp Handling: `@createdAt` / `@updatedAt`

Timestamps use PostgreSQL native `timestamptz` with database-side defaults — not client-side `Date.now()`.

**`@createdAt`**: Uses `DEFAULT NOW()` — the database sets the value on insert:

```typescript
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

**`@updatedAt`**: Uses `DEFAULT NOW()` for the initial value, plus a **database trigger** for automatic updates:

```typescript
updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

The emitter generates a reusable trigger function and per-table triggers:

```sql
-- Generated: migrations/0000_timestamps.sql

-- Reusable trigger function (created once)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Per-table triggers (generated for each @entity with @updatedAt)
CREATE TRIGGER authors_updated_at
  BEFORE UPDATE ON authors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ... one trigger per table with @updatedAt
```

This means `updatedAt` is always correct regardless of which client performs the update — ORM, raw SQL, migration scripts, or manual `psql` queries.

**Comparison with ElectroDB approach:**

| Concern        | ElectroDB (DynamoDB)                 | Drizzle (PostgreSQL)                     |
| -------------- | ------------------------------------ | ---------------------------------------- |
| `@createdAt`   | `default: () => Date.now()` (client) | `DEFAULT NOW()` (database)               |
| `@updatedAt`   | `watch: "*", set: () => Date.now()`  | `BEFORE UPDATE` trigger (database)       |
| Clock source   | Application server                   | Database server (single source of truth) |
| Works from SQL | No (only through ElectroDB)          | Yes (any client)                         |

### 3. Relations (`relations.ts`)

Generated from `@references` annotations using Drizzle's v2 `defineRelations` API. The emitter builds a relation graph:

1. Each `@references(Target.field)` creates a **one** relation on the source entity (FK holder) and a **many** relation on the target entity (reverse).
2. Each `@junction` entity creates **many-to-many through** relations on both sides of the junction, using `through()` syntax.

```typescript
// Generated: build/drizzle-schema/relations.ts

import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.js";

export const relations = defineRelations(schema, (r) => ({
  // ============================================
  // Author
  // ============================================
  authors: {
    // Book.authorId → Author.authorId (one-to-many reverse)
    books: r.many.books(),
  },

  // ============================================
  // Book
  // ============================================
  books: {
    // Book.authorId → Author.authorId (many-to-one)
    author: r.one.authors({
      from: r.books.authorId,
      to: r.authors.authorId,
    }),

    // Direct one-to-many children
    editions: r.many.editions(),
    bookTags: r.many.bookTags(),
    reviews: r.many.reviews(),

    // Many-to-many through @junction BookGenre
    genres: r.many.genres({
      from: r.books.bookId.through(r.bookGenres.bookId),
      to: r.genres.genreId.through(r.bookGenres.genreId),
    }),
  },

  // ============================================
  // Genre
  // ============================================
  genres: {
    // Many-to-many through @junction BookGenre
    books: r.many.books({
      from: r.genres.genreId.through(r.bookGenres.genreId),
      to: r.books.bookId.through(r.bookGenres.bookId),
    }),
  },

  // ============================================
  // BookGenre (@junction)
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
```

#### Relation Derivation Algorithm

The algorithm is mechanical — no heuristics or inference:

```
1. For each model with @entity:
   a. Collect all fields with @references(Target.field)
   b. For each @references field:
      - Add a `one` relation on this entity → target entity
      - Add a `many` relation on target entity → this entity (reverse)

2. For each @junction model:
   a. It must have exactly 2 @references fields (to sides A and B)
   b. Add a `many.B.through(junction)` on entity A
   c. Add a `many.A.through(junction)` on entity B

3. Emit all relations in a single defineRelations() call
```

### 4. Describe Queries (`describe.ts`)

**Every non-junction entity gets a typed describe function.** The describe function fetches the entity by primary key with all its relations included via Drizzle's relational query API.

Junction entities (`@junction`) are excluded — they exist solely to support many-to-many relationships and have no meaningful standalone describe.

```typescript
// Generated: build/drizzle-schema/describe.ts

import type { DrizzleClient } from "./types.js";
import * as schema from "./schema.js";

// ============================================
// describeAuthor
// Fetches: author + books[]
// ============================================

export type AuthorDescription = typeof schema.authors.$inferSelect & {
  books: (typeof schema.books.$inferSelect)[];
};

export const describeAuthor = (
  db: DrizzleClient,
  authorId: string,
): Promise<AuthorDescription | undefined> =>
  db.query.authors.findFirst({
    where: { authorId },
    with: {
      books: true,
    },
  });

// ============================================
// describeBook
// Fetches: book + author + editions[] + genres[] + bookTags[] + reviews[]
// ============================================

export type BookDescription = typeof schema.books.$inferSelect & {
  author: typeof schema.authors.$inferSelect;
  editions: (typeof schema.editions.$inferSelect)[];
  genres: (typeof schema.genres.$inferSelect)[];
  bookTags: (typeof schema.bookTags.$inferSelect)[];
  reviews: (typeof schema.reviews.$inferSelect)[];
};

export const describeBook = (
  db: DrizzleClient,
  bookId: string,
): Promise<BookDescription | undefined> =>
  db.query.books.findFirst({
    where: { bookId },
    with: {
      author: true,
      editions: true,
      genres: true,
      bookTags: true,
      reviews: true,
    },
  });

// ============================================
// describeGenre
// Fetches: genre + books[] (through junction)
// ============================================

export type GenreDescription = typeof schema.genres.$inferSelect & {
  books: (typeof schema.books.$inferSelect)[];
};

export const describeGenre = (
  db: DrizzleClient,
  genreId: string,
): Promise<GenreDescription | undefined> =>
  db.query.genres.findFirst({
    where: { genreId },
    with: {
      books: true,
    },
  });

// ============================================
// describeBookTag
// Fetches: bookTag + book
// ============================================

export type BookTagDescription = typeof schema.bookTags.$inferSelect & {
  book: typeof schema.books.$inferSelect;
};

export const describeBookTag = (
  db: DrizzleClient,
  bookTagId: string,
): Promise<BookTagDescription | undefined> =>
  db.query.bookTags.findFirst({
    where: { bookTagId },
    with: {
      book: true,
    },
  });

// ============================================
// describeTranslator
// Fetches: translator + editions[]
// ============================================

export type TranslatorDescription = typeof schema.translators.$inferSelect & {
  editions: (typeof schema.editions.$inferSelect)[];
};

export const describeTranslator = (
  db: DrizzleClient,
  translatorId: string,
): Promise<TranslatorDescription | undefined> =>
  db.query.translators.findFirst({
    where: { translatorId },
    with: {
      editions: true,
    },
  });

// ============================================
// describePublisher
// Fetches: publisher + editions[]
// ============================================

export type PublisherDescription = typeof schema.publishers.$inferSelect & {
  editions: (typeof schema.editions.$inferSelect)[];
};

export const describePublisher = (
  db: DrizzleClient,
  publisherId: string,
): Promise<PublisherDescription | undefined> =>
  db.query.publishers.findFirst({
    where: { publisherId },
    with: {
      editions: true,
    },
  });

// ============================================
// describeEdition
// Fetches: edition + book + translator + publisher
// ============================================

export type EditionDescription = typeof schema.editions.$inferSelect & {
  book: typeof schema.books.$inferSelect;
  translator: typeof schema.translators.$inferSelect | null;
  publisher: typeof schema.publishers.$inferSelect;
};

export const describeEdition = (
  db: DrizzleClient,
  editionId: string,
): Promise<EditionDescription | undefined> =>
  db.query.editions.findFirst({
    where: { editionId },
    with: {
      book: true,
      translator: true,
      publisher: true,
    },
  });

// ============================================
// describeReview
// Fetches: review + book
// ============================================

export type ReviewDescription = typeof schema.reviews.$inferSelect & {
  book: typeof schema.books.$inferSelect;
};

export const describeReview = (
  db: DrizzleClient,
  reviewId: string,
): Promise<ReviewDescription | undefined> =>
  db.query.reviews.findFirst({
    where: { reviewId },
    with: {
      book: true,
    },
  });
```

#### Generated SQL

Drizzle compiles `findFirst({ with: { ... } })` into a **single SQL query** using lateral joins. The generated SQL for `describeBook(db, "abc123")`:

```sql
SELECT
  "d0"."book_id"           AS "bookId",
  "d0"."author_id"         AS "authorId",
  "d0"."title"             AS "title",
  "d0"."original_language" AS "originalLanguage",
  "d0"."publication_year"  AS "publicationYear",
  "d0"."isbn"              AS "isbn",
  "d0"."page_count"        AS "pageCount",
  "d0"."created_at"        AS "createdAt",
  "d0"."updated_at"        AS "updatedAt",
  "author"."r"             AS "author",
  "editions"."r"           AS "editions",
  "genres"."r"             AS "genres",
  "bookTags"."r"           AS "bookTags",
  "reviews"."r"            AS "reviews"
FROM "books" AS "d0"
LEFT JOIN LATERAL (
  SELECT row_to_json("t".*) AS "r"
  FROM (
    SELECT "d1".* FROM "authors" AS "d1"
    WHERE "d0"."author_id" = "d1"."author_id"
  ) AS "t"
) AS "author" ON true
LEFT JOIN LATERAL (
  SELECT coalesce(json_agg(row_to_json("t".*)), '[]') AS "r"
  FROM (
    SELECT "d1".* FROM "editions" AS "d1"
    WHERE "d0"."book_id" = "d1"."book_id"
  ) AS "t"
) AS "editions" ON true
LEFT JOIN LATERAL (
  SELECT coalesce(json_agg(row_to_json("t".*)), '[]') AS "r"
  FROM (
    SELECT "d1".* FROM "genres" AS "d1"
    INNER JOIN "book_genres" AS "j" ON "j"."genre_id" = "d1"."genre_id"
    WHERE "d0"."book_id" = "j"."book_id"
  ) AS "t"
) AS "genres" ON true
LEFT JOIN LATERAL (
  SELECT coalesce(json_agg(row_to_json("t".*)), '[]') AS "r"
  FROM (
    SELECT "d1".* FROM "book_tags" AS "d1"
    WHERE "d0"."book_id" = "d1"."book_id"
  ) AS "t"
) AS "bookTags" ON true
LEFT JOIN LATERAL (
  SELECT coalesce(json_agg(row_to_json("t".*)), '[]') AS "r"
  FROM (
    SELECT "d1".* FROM "reviews" AS "d1"
    WHERE "d0"."book_id" = "d1"."book_id"
  ) AS "t"
) AS "reviews" ON true
WHERE "d0"."book_id" = $1
LIMIT 1
```

Single round trip. All related data. Typed result. The many-to-many `genres` relation joins through the junction table automatically.

#### Why Generate Every Describe?

The emitter generates describe functions for **all** non-junction entities, not a curated subset. This is deliberate:

- **Zero runtime cost**: Generated code that isn't imported is never executed.
- **Tree-shaking**: Bundlers eliminate unused exports — `describeBookTag` costs nothing if you never import it.
- **No annotation overhead**: No need to decide up-front which entities "deserve" a describe.
- **Complete API surface**: Every entity can be fetched with relations from day one.

The `@junction` annotation is the only exclusion signal. Everything else gets a describe.

## Service Layer Usage

How describe functions are consumed in the service layer:

### ElectroDB (current — DynamoDB)

```typescript
import { Service, Entity } from "electrodb";
import {
  Book,
  Edition,
  BookGenre,
  BookTag,
  Review,
} from "@bookstore/ddb-entities";

class BookService {
  private get bookDetailsService() {
    const { client, table } = this.config;
    return new Service(
      {
        book: new Entity(Book, { client, table }),
        edition: new Entity(Edition, { client, table }),
        bookGenre: new Entity(BookGenre, { client, table }),
        bookTag: new Entity(BookTag, { client, table }),
        review: new Entity(Review, { client, table }),
      },
      { client, table },
    );
  }

  describe = async (bookId: string): Promise<BookDetailsDescription> => {
    const { bookDetailsService } = this;
    const result = await bookDetailsService.collections
      .bookDetails({ bookId })
      .go({ pages: "all" });

    if (result.data.book.length === 0) {
      throw new NotFoundError(`Book not found: ${bookId}`);
    }

    return result.data;
  };
}
```

### Drizzle (generated)

```typescript
import { describeBook, type BookDescription } from "@bookstore/drizzle-schema";

class BookService {
  describe = async (bookId: string): Promise<BookDescription> => {
    const { db } = this.config;
    const result = await describeBook(db, bookId);

    if (!result) {
      throw new NotFoundError(`Book not found: ${bookId}`);
    }

    return result;
  };
}
```

Key differences:

- No manual `Service` construction — the generated describe function encapsulates everything
- Return type is a single book (not `book[]`) — PostgreSQL primary key guarantees uniqueness
- No `pages: "all"` — PostgreSQL lateral joins return all related data in a single query
- Many-to-many joins (genres) are transparent — the junction table is handled by `defineRelations`

## Emitter Architecture

### Implementation Approach

```
TypeSpec Models
  → Decorators extract metadata into StateMap
  → $onEmit iterates StateMap entries
  → Build relation graph from @references + @junction
  → Emit types.ts     (base36Uuid custom type)
  → Emit schema.ts    (table definitions from @primaryKey + @references)
  → Emit relations.ts (defineRelations from relation graph)
  → Emit describe.ts  (one per non-junction entity, includes all relations)
  → Emit index.ts     (re-exports)
```

### Emitter Logic: Relation Graph

The core algorithm for building the relation graph:

```
1. For each model with @entity:
   a. Record table name from @primaryKey.name
   b. Record primary key columns from @primaryKey.columns
   c. For each field with @references(Target.field):
      - Add edge: this.field → Target.field (FK)
   d. If model has @foreignKey:
      - Add composite FK constraint

2. Build bidirectional relation graph:
   a. For each FK edge (Source.field → Target.field):
      - Source gets: r.one.target({ from: source.field, to: target.field })
      - Target gets: r.many.sources()
   b. For each @junction entity with refs to A and B:
      - A gets: r.many.B({ from: A.pk.through(junction.aField), to: B.pk.through(junction.bField) })
      - B gets: r.many.A({ from: B.pk.through(junction.bField), to: A.pk.through(junction.aField) })

3. Generate describe functions:
   a. For each non-junction entity:
      - findFirst by primary key
      - with: { ...all relations from step 2 }
```

### Configuration

```yaml
# tspconfig.yaml
emit:
  - "typespec-drizzle-emitter"
options:
  "typespec-drizzle-emitter":
    emitter-output-dir: "{cwd}/build/drizzle-schema"
    package-name: "@bookstore/drizzle-schema"
    package-version: "0.0.1"
    naming: "snake_case" # Column naming: snake_case (default) or camelCase
```

## Migration Generation

The emitter generates the Drizzle schema; `drizzle-kit` handles migration diffing:

```bash
# Generate schema from TypeSpec
npx tsp compile ./typespec

# Generate SQL migrations from schema diff
npx drizzle-kit generate --schema build/drizzle-schema/schema.ts

# Apply migrations
npx drizzle-kit migrate
```

The emitter also generates the `set_updated_at()` trigger function and per-table triggers as a separate migration file for tables with `@updatedAt` fields.

## Annotation Mapping Reference

Complete mapping from TypeSpec annotations to emitter output:

| TypeSpec Annotation                        | Emitter Output                                                        |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `@entity("book", "bookstore")`             | `pgTable("books", { ... })` (table name from `@primaryKey`)           |
| `@primaryKey({ name, columns })`           | Table name + `.primaryKey()` or composite `primaryKey()`              |
| `@references(Author.authorId)`             | `.references(() => authors.authorId)` + relation in `defineRelations` |
| `@foreignKey({ columns, foreignColumns })` | Composite FK constraint in table definition                           |
| `@junction`                                | Excluded from describe generation; enables `through()` relations      |
| `@uuid("base36")`                          | `base36Uuid()` custom type (native pg `uuid`, auto-marshaled)         |
| `@uuid("base36", true)`                    | `base36Uuid().defaultRandom()` (pg generates UUID on insert)          |
| `@createdAt`                               | `timestamp().defaultNow()` (database `DEFAULT NOW()`)                 |
| `@updatedAt`                               | `timestamp().defaultNow()` + `BEFORE UPDATE` trigger                  |
| `@visibility(Lifecycle.Read)`              | Marks field as read-only in generated types                           |
| `enum`                                     | `pgEnum()` (native `CREATE TYPE ... AS ENUM`)                         |
| `@minValue(n) @maxValue(n)`                | `CHECK` constraint                                                    |
| `@maxLength(n)` (length scalars)           | `varchar(n)`                                                          |
| `utcDateTime`                              | `timestamptz` (native PostgreSQL timestamp)                           |
| Optional property (`?`)                    | Nullable column (no `.notNull()`)                                     |
| Required property                          | `.notNull()`                                                          |

## Design Decisions

1. **No inference.** All relationships are declared explicitly via `@references` and `@junction`. The emitter does not attempt to guess foreign keys from naming conventions or collection membership. This makes the generated output predictable and debuggable.

2. **Generate every describe.** Every non-junction entity gets a typed describe function. Tree-shaking eliminates unused exports at zero runtime cost. The only exclusion signal is `@junction`.

3. **`defineRelations` (Drizzle v2).** Relations are declared in a single centralized call rather than per-table `relations()` declarations. This provides full autocomplete and enables `through()` syntax for many-to-many relations via junction tables.

4. **Enums → native PostgreSQL enums.** TypeSpec `enum` definitions emit as `pgEnum()` which generates `CREATE TYPE ... AS ENUM`. Database-enforced, efficient storage, clean queries.

5. **Timestamps → native `timestamptz`.** `@createdAt` and `@updatedAt` emit as `timestamp({ withTimezone: true })` with `DEFAULT NOW()`. `@updatedAt` additionally generates a `BEFORE UPDATE` trigger. No client-side `Date.now()`.

6. **UUIDs → native `uuid` type.** All UUID fields use PostgreSQL native `uuid` storage. External marshaling (base36) handled transparently via Drizzle `customType`. Application code works with base36 strings; the database stores and indexes native UUIDs.

7. **`@primaryKey` controls table naming.** The table name comes from `@primaryKey.name`, not from the entity name. This gives explicit control over the SQL table name (e.g., plural, snake_case).

8. **Separate decorator set.** The Drizzle emitter defines its own decorators rather than reusing ElectroDB's `@index`/`collection` syntax. The annotations are similar in spirit but designed for relational databases. A shared decorator library could be extracted later if both emitters coexist.

## Open Questions

1. **Decorator library**: Should `typespec-drizzle-emitter` define all decorators internally, or share a base set with `typespec-electrodb-emitter`? Shared decorators like `@entity`, `@uuid`, `@createdAt`, `@updatedAt` are identical — a `typespec-entity-decorators` package could hold them.

2. **Scalar-level `@uuid`**: The current design annotates each field individually. An alternative: annotate the scalar type once (`@uuid("base36") scalar UUID extends string;`) and have all fields of that type inherit the encoding. Both could be supported — scalar as default, field-level as override.

3. **Trigger generation**: Should the emitter output trigger SQL as a separate `.sql` file, or integrate with Drizzle's migration system? Current proposal: separate SQL file in the migrations directory.

4. **Describe depth**: Currently describe includes one level of relations (`with: { books: true }`). Should the emitter support configurable depth (e.g., `describeBook` including each edition's publisher)?

## Appendix A: Constraint Annotations

PostgreSQL supports several column and table-level constraints beyond foreign keys. This appendix describes how the emitter handles each constraint type, distinguishing between constraints that require new annotations and those covered by native TypeSpec syntax.

### Constraints Handled by Native TypeSpec (No New Annotations)

#### `NOT NULL`

TypeSpec's required/optional field syntax maps directly to nullability:

```typespec
model Book {
  title: string;        // required → .notNull()
  isbn?: string;        // optional → nullable (no .notNull())
}
```

Generated:

```typescript
export const books = pgTable("books", {
  title: text("title").notNull(),
  isbn: text("isbn"), // nullable by default in Drizzle
});
```

No annotation needed. TypeSpec enforces this at the type level; the emitter mirrors it in the schema.

#### `DEFAULT`

TypeSpec supports default values via `@defaultValue()` on scalar types and model properties:

```typespec
model Review {
  @minValue(1)
  @maxValue(5)
  rating: int32 = 3;            // TypeSpec default value syntax

  status: ReviewStatus = ReviewStatus.Draft;  // Enum default
}
```

Generated:

```typescript
export const reviews = pgTable("reviews", {
  rating: integer("rating").notNull().default(3),
  status: reviewStatusEnum("status").notNull().default("draft"),
});
```

For computed defaults like `DEFAULT NOW()` or `DEFAULT gen_random_uuid()`, the emitter uses dedicated annotations (`@createdAt`, `@updatedAt`, `@uuid(..., true)`) rather than a generic default mechanism — these map to specific PostgreSQL features.

### Constraints Requiring New Annotations

#### `@unique` — Unique Constraints

Single-column unique constraint on a field:

```typespec
model Author {
  @uuid("base36", true)
  authorId: string;

  @unique
  email: string;

  name: string;
}
```

Generated:

```typescript
export const authors = pgTable("authors", {
  authorId: base36Uuid("author_id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
});
```

#### `@unique({ name, columns })` — Composite Unique Constraints

For multi-column uniqueness, apply `@unique` at the model level:

```typespec
@entity("edition", "bookstore")
@primaryKey({
  name: "editions",
  columns: [Edition.editionId],
})
@unique({
  name: "edition_book_language_uq",
  columns: [Edition.bookId, Edition.language],
})
model Edition {
  @uuid("base36", true)
  editionId: string;

  @uuid("base36")
  @references(Book.bookId)
  bookId: string;

  language: string;

  // ...
}
```

Generated:

```typescript
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const editions = pgTable(
  "editions",
  {
    editionId: base36Uuid("edition_id").primaryKey().defaultRandom(),
    bookId: base36Uuid("book_id")
      .notNull()
      .references(() => books.bookId),
    language: text("language").notNull(),
    // ...
  },
  (table) => [
    uniqueIndex("edition_book_language_uq").on(table.bookId, table.language),
  ],
);
```

This enforces that no two editions of the same book can share the same language.

#### `@check(expression)` — Check Constraints

For arbitrary SQL check constraints beyond what `@minValue`/`@maxValue` can express:

```typespec
model Review {
  @minValue(1)
  @maxValue(5)
  rating: int32;

  @check("length(text) <= 10000")
  text?: string;

  reviewDate: utcDateTime;

  @check("review_date <= NOW()")
  @createdAt
  createdAt: utcDateTime;
}
```

Generated:

```typescript
import {
  pgTable,
  integer,
  text,
  timestamp,
  check,
  sql,
} from "drizzle-orm/pg-core";

export const reviews = pgTable(
  "reviews",
  {
    rating: integer("rating").notNull(),
    text: text("text"),
    reviewDate: timestamp("review_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "reviews_rating_check",
      sql`${table.rating} >= 1 AND ${table.rating} <= 5`,
    ),
    check("reviews_text_length_check", sql`length(${table.text}) <= 10000`),
    check("reviews_review_date_check", sql`${table.reviewDate} <= NOW()`),
  ],
);
```

Note that `@minValue`/`@maxValue` are syntactic sugar that emit `CHECK` constraints — they're equivalent to `@check` but more readable for simple range bounds.

#### `@index({ name, columns })` — Performance Indexes

Indexes are not constraints (they don't enforce data integrity) but are essential for query performance. The emitter supports explicit index declarations:

```typespec
@entity("book", "bookstore")
@primaryKey({
  name: "books",
  columns: [Book.bookId],
})
@index({
  name: "books_author_publication_idx",
  columns: [Book.authorId, Book.publicationYear],
})
@index({
  name: "books_isbn_idx",
  columns: [Book.isbn],
  unique: true,       // unique index (alternative to @unique)
})
model Book {
  @uuid("base36", true)
  bookId: string;

  @uuid("base36")
  @references(Author.authorId)
  authorId: string;

  publicationYear: int32;

  isbn?: string;

  // ...
}
```

Generated:

```typescript
import { pgTable, index, uniqueIndex } from "drizzle-orm/pg-core";

export const books = pgTable(
  "books",
  {
    bookId: base36Uuid("book_id").primaryKey().defaultRandom(),
    authorId: base36Uuid("author_id")
      .notNull()
      .references(() => authors.authorId),
    publicationYear: integer("publication_year").notNull(),
    isbn: text("isbn"),
    // ...
  },
  (table) => [
    index("books_author_publication_idx").on(
      table.authorId,
      table.publicationYear,
    ),
    uniqueIndex("books_isbn_idx").on(table.isbn),
  ],
);
```

### Constraint Summary

| Constraint      | Annotation                               | Source                 | PostgreSQL Output                         |
| --------------- | ---------------------------------------- | ---------------------- | ----------------------------------------- |
| `NOT NULL`      | (none — TypeSpec required fields)        | `field: string`        | `NOT NULL`                                |
| Nullable        | (none — TypeSpec optional fields)        | `field?: string`       | (no constraint)                           |
| `DEFAULT`       | (none — TypeSpec default values)         | `field: int32 = 3`     | `DEFAULT 3`                               |
| `DEFAULT NOW()` | `@createdAt` / `@updatedAt`              | Dedicated annotations  | `DEFAULT NOW()` (+ trigger for updatedAt) |
| `DEFAULT uuid`  | `@uuid("base36", true)`                  | Auto-generation flag   | `DEFAULT gen_random_uuid()`               |
| `PRIMARY KEY`   | `@primaryKey({ name, columns })`         | Model-level annotation | `PRIMARY KEY (col1, col2)`                |
| `FOREIGN KEY`   | `@references` / `@foreignKey`            | Field or model-level   | `REFERENCES table(col)`                   |
| `UNIQUE`        | `@unique` / `@unique({ columns })`       | Field or model-level   | `UNIQUE` / `UNIQUE (col1, col2)`          |
| `CHECK`         | `@check(expr)` / `@minValue`/`@maxValue` | Field or model-level   | `CHECK (expression)`                      |
| `INDEX`         | `@index({ name, columns })`              | Model-level annotation | `CREATE INDEX ... ON table (col1, col2)`  |
