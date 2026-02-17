# typespec-drizzle-orm-generator

Generate a complete [Drizzle ORM](https://orm.drizzle.team/) package from TypeSpec models. You define your domain in TypeSpec, the emitter gives you table schemas, relations, and typed query functions for PostgreSQL.

## Install

```bash
npm install @kattebak/typespec-drizzle-orm-generator
```

## Quick start

### 1. Define your models

```typespec
import "@kattebak/typespec-drizzle-orm-generator";

using DrizzleEmitter;

@entity("Author", "bookstore")
@primaryKey("authors")
model Author {
  @pk @uuid("base36", true)
  authorId: string;

  name: string;
  bio?: string;

  @createdAt createdAt: utcDateTime;
  @updatedAt updatedAt: utcDateTime;
}

@entity("Book", "bookstore")
@primaryKey("books")
model Book {
  @pk @uuid("base36", true)
  bookId: string;

  @uuid("base36") @references(Author.authorId)
  authorId: string;

  title: string;
  @unique isbn?: string;
  @minValue(1) @maxValue(5) rating: int32;

  @createdAt createdAt: utcDateTime;
  @updatedAt updatedAt: utcDateTime;
}
```

### 2. Configure and run the emitter

Add a `tspconfig.yaml` to your TypeSpec project:

```yaml
emit:
  - "@kattebak/typespec-drizzle-orm-generator"

options:
  "@kattebak/typespec-drizzle-orm-generator":
    "package-name": "@myorg/bookstore-db"
    "package-version": "1.0.0"
```

Then compile:

```bash
npx tsp compile .
```

The emitter produces 6 files as a ready-to-use npm package:

| File           | What's in it                                                         |
| -------------- | -------------------------------------------------------------------- |
| `schema.ts`    | `pgTable()` definitions, `pgEnum()`, constraints                     |
| `relations.ts` | `defineRelations()` with `through()` for many-to-many                |
| `describe.ts`  | One typed query function per entity (fetch by PK with all relations) |
| `types.ts`     | `base36Uuid` custom type, `DrizzleClient` type alias                 |
| `index.ts`     | Barrel re-exports                                                    |
| `package.json` | Package metadata with `drizzle-orm` dependency                       |

### 3. Use the generated code

Install the generated package in your application (e.g. from the emitter output directory or after publishing):

```bash
npm install ./tsp-output/@kattebak/typespec-drizzle-orm-generator
```

Then use it:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "@myorg/bookstore-db/relations.js";
import * as schema from "@myorg/bookstore-db/schema.js";
import { describeAuthor, describeBook } from "@myorg/bookstore-db/describe.js";

// Initialize the client with schema + relations
const db = drizzle({ connection: process.env.DATABASE_URL, schema, relations });

// Fetch an author with all their books in one query
const author = await describeAuthor(db, "abc123");
// author.name, author.books[0].title — fully typed

// Fetch a book with its author
const book = await describeBook(db, "xyz789");
// book.author.name, book.rating — fully typed

// Or use the schema directly for custom queries
import { authors } from "@myorg/bookstore-db/schema.js";
import { eq } from "drizzle-orm";

const result = await db.select().from(authors).where(eq(authors.name, "Tolkien"));
```

## Generated output examples

### schema.ts

```typescript
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { base36Uuid } from "./types.js";

export const authors = pgTable("authors", {
  authorId: base36Uuid("author_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const books = pgTable(
  "books",
  {
    bookId: base36Uuid("book_id").primaryKey().defaultRandom(),
    authorId: base36Uuid("author_id")
      .notNull()
      .references(() => authors.authorId),
    title: text("title").notNull(),
    isbn: text("isbn").unique(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "books_rating_check",
      sql`${table.rating} >= 1 AND ${table.rating} <= 5`,
    ),
  ],
);
```

### relations.ts

```typescript
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.js";

export const relations = defineRelations(schema, (r) => ({
  authors: {
    books: r.many.books(),
  },
  books: {
    author: r.one.authors({
      from: r.books.authorId,
      to: r.authors.authorId,
    }),
  },
}));
```

### describe.ts

```typescript
import type { DrizzleClient } from "./types.js";
import * as schema from "./schema.js";

export type AuthorDescription = typeof schema.authors.$inferSelect & {
  books: (typeof schema.books.$inferSelect)[];
};

export const describeAuthor = (
  db: DrizzleClient,
  authorId: string,
): Promise<AuthorDescription | undefined> =>
  db.query.authors.findFirst({
    where: { authorId },
    with: { books: true },
  });
```

## Decorators

### Defining entities

```typespec
@entity("Author", "bookstore")   // entity name + service grouping
@primaryKey("authors")            // SQL table name
model Author {
  @pk                             // marks field as primary key column
  @uuid("base36", true)           // UUID with base36 encoding, auto-generated
  authorId: string;

  @references(Author.authorId)    // foreign key to another entity
  authorId: string;

  @junction                       // on model: marks as many-to-many junction table

  @createdAt                      // DEFAULT NOW()
  createdAt: utcDateTime;

  @updatedAt                      // DEFAULT NOW() + BEFORE UPDATE trigger
  updatedAt: utcDateTime;
}
```

### Adding constraints

```typespec
@unique                                  // single-column UNIQUE
isbn?: string;

@minValue(1) @maxValue(5)                // CHECK (rating >= 1 AND rating <= 5)
rating: int32;

@check("price > 0")                      // arbitrary CHECK expression
price: float64;

// Model-level decorators:
@compositeUnique("uq_book_lang", [Edition.bookId, Edition.language])
@indexDef("idx_author_year", [Book.authorId, Book.publicationYear])
@indexDef("idx_isbn", [Book.isbn], true)  // unique index
@foreignKeyDef("fk_order", [cols...], [foreignCols...])  // composite FK
```

### Many-to-many with junction tables

```typespec
@entity("BookGenre", "bookstore")
@junction                                 // skip describe generation, enable through()
@primaryKey("book_genres")
model BookGenre {
  @pk @uuid("base36") @references(Book.bookId)
  bookId: string;

  @pk @uuid("base36") @references(Genre.genreId)
  genreId: string;
}
```

This generates many-to-many relations using Drizzle v2's `through()`:

```typescript
books: {
  genres: r.many.genres({
    from: r.books.bookId.through(r.bookGenres.bookId),
    to: r.genres.genreId.through(r.bookGenres.genreId),
  }),
}
```

### Nullable foreign keys

Make a field optional to get a nullable FK. The describe type reflects this as `| null`:

```typespec
@references(Translator.translatorId)
translatorId?: string;                    // nullable FK
```

```typescript
export type EditionDescription = typeof schema.editions.$inferSelect & {
  translator: typeof schema.translators.$inferSelect | null;
};
```

## Type mapping

| TypeSpec               | Drizzle                             | PostgreSQL                |
| ---------------------- | ----------------------------------- | ------------------------- |
| `string`               | `text()`                            | `text`                    |
| `string` (with length) | `varchar({ length })`               | `varchar(n)`              |
| `int32`                | `integer()`                         | `integer`                 |
| `int64`                | `bigint({ mode: "number" })`        | `bigint`                  |
| `float32`              | `real()`                            | `real`                    |
| `float64`              | `doublePrecision()`                 | `double precision`        |
| `boolean`              | `boolean()`                         | `boolean`                 |
| `utcDateTime`          | `timestamp({ withTimezone: true })` | `timestamptz`             |
| `string` + `@uuid`     | `base36Uuid()`                      | `uuid`                    |
| TypeSpec `enum`        | `pgEnum()`                          | `CREATE TYPE ... AS ENUM` |

## Full example

See [test/fixtures/bookstore.tsp](test/fixtures/bookstore.tsp) for a complete 9-entity bookstore domain with authors, books, genres (many-to-many via junction), editions (3 FKs including nullable), reviews, tags, translators, and publishers.

## Contributing

```bash
npm install
npm test            # type-check + 230 tests
npm run lint:fix    # auto-fix with Biome
```

Tests run against SQLite in-memory (no Postgres needed). See [doc/](doc/) for the RFC and implementation plan.

## License

MIT
