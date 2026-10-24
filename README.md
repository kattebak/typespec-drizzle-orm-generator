# typespec-drizzle-orm-generator

Generate a complete [Drizzle ORM](https://orm.drizzle.team/) package from TypeSpec models. You define your domain in TypeSpec, the emitter gives you table schemas, relations, and typed query functions. Supports PostgreSQL (default) and SQLite dialects.

## Install

```bash
npm install @kattebak/typespec-drizzle-orm-generator
```

## Quick start

### 1. Define your models

```typespec
import "@kattebak/typespec-drizzle-orm-generator";

using Drizzle;

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
    dialect: pg          # "pg" (default) or "sqlite"
```

Then compile:

```bash
npx tsp compile .
```

The emitter produces 6 files as a ready-to-use npm package:

| File           | What's in it                                                           |
| -------------- | ---------------------------------------------------------------------- |
| `schema.ts`    | Table definitions (`pgTable`/`sqliteTable`), enums, constraints        |
| `relations.ts` | `defineRelations()` with `through()` for many-to-many                |
| `describe.ts`  | One typed query function per entity (fetch by PK with all relations) |
| `types.ts`     | UUID custom types (one per encoding), `DrizzleClient` type alias     |
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

Decorators live in the `Drizzle` namespace. Reference them qualified
(`@Drizzle.table`) or bring them into scope for a file with `using Drizzle;`.

`@minValue`, `@maxValue`, `@createdAt` and `@updatedAt` are names the TypeSpec
standard library and other emitters also declare. In a project that loads one of
those alongside this library, `using Drizzle;` leaves those four references
ambiguous — qualify them:

```typespec
using Drizzle;

model Order {
  @Drizzle.minValue(1)
  @Drizzle.maxValue(5)
  rating?: int32;
}
```

### Defining entities

```typespec
@entity("Author", "bookstore")   // entity name + service grouping
@primaryKey("authors")            // SQL table name
model Author {
  @pk                             // marks field as primary key column
  @uuid("base36", true)           // UUID stored as base36, auto-generated
  authorId: string;

  @references(Author.authorId)             // foreign key to another entity
  authorId: string;

  @references(Author.authorId, "CASCADE")  // foreign key with ON DELETE policy
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
@indexDef("idx_live_isbn", [Book.isbn], true, "deleted_at IS NULL")  // partial index
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

## Dialect option

Set `dialect` in your `tspconfig.yaml` to control the target database. Defaults to `pg`.

| Value    | Table function  | Import source             | Enum support |
| -------- | --------------- | ------------------------- | ------------ |
| `pg`     | `pgTable`       | `drizzle-orm/pg-core`     | `pgEnum()`   |
| `sqlite` | `sqliteTable`   | `drizzle-orm/sqlite-core` | mapped to `text()` |

When using `sqlite`, types that don't exist natively in SQLite are mapped to compatible alternatives:

| TypeSpec type | PostgreSQL                          | SQLite                                  |
| ------------- | ----------------------------------- | --------------------------------------- |
| `boolean`     | `boolean()`                         | `integer({ mode: "boolean" })`          |
| `utcDateTime` | `timestamp({ withTimezone: true })` | `integer({ mode: "timestamp" })`        |
| `float64`     | `doublePrecision()`                 | `real()`                                |
| `int64`       | `bigint({ mode: "number" })`        | `integer({ mode: "number" })`           |
| `string` (with length) | `varchar({ length })`     | `text({ length })`                      |
| `bytes`       | `bytea()`                           | `blob({ mode: "buffer" })`              |
| TypeSpec `enum` | `pgEnum()`                        | `text()` (no native enums in SQLite)    |

## Front-end option

Set `frontend` in your `tspconfig.yaml` to choose which TypeSpec vocabulary the emitter reads. Defaults to `drizzle`.

| Value     | Reads                                                                 |
| --------- | -------------------------------------------------------------------- |
| `drizzle` | This library's own `@table` / `@pk` / `@references` decorators.       |
| `remit`   | The ElectroDB vocabulary (`@entity` / `@index`) from `typespec-electrodb-emitter`. |

The `remit` front-end maps an ElectroDB model to a table:

- **Primary key** is the entity's own identity field, `<entity>Id`, as a single column. The ElectroDB primary index is a DynamoDB access pattern, not the entity's identity, so it becomes an ordinary secondary index. An entity with no `<entity>Id` field keeps the ElectroDB primary composite as its key.
- Every `@index` becomes a named secondary index, and every `@indexDef` adds an index that exists in SQL only (see below).
- **Enums** are text columns narrowed by a `$type` union, not pgEnums — a store that mirrors a DynamoDB port keeps enum values as strings and avoids an `ALTER TYPE` per new value.
- A `collection` shared by two or more entities becomes an `ON DELETE CASCADE` foreign key from each member to the entity that owns the shared partition key (unless `foreign-keys: false`).

### SQL-only indexes

`@indexDef` declares an index this generator emits and no one else reads. It is
the tool for an index the SQL schema needs but the DynamoDB table must not get:
`@index` is the ElectroDB vocabulary, so an `@index` added for a SQL predicate
also mints a DynamoDB secondary index — write amplification on every write, and
against a hard limit of five local secondary indexes per table.

```typespec
@entity("threadMessage", "remit")
@index("ThreadMessage", { pk: [ThreadMessage.accountConfigId], sk: [ThreadMessage.threadMessageId] })
@Drizzle.indexDef(
  "tm_by_mailbox_category_date",
  [
    ThreadMessage.accountConfigId,
    ThreadMessage.mailboxId,
    ThreadMessage.category,
    ThreadMessage.sentDate
  ]
)
model ThreadMessage { ... }
```

Both front-ends emit it, and the name is used verbatim, so it is the name your
migration history is keyed on. An `@indexDef` on a model the selected front-end
generates no table for is a compile error, not a dropped index.

A fifth argument makes it a partial index. The predicate is raw SQL over column
names, emitted verbatim as `.where(sql\`...\`)` in both dialects:

```typespec
@Drizzle.indexDef("tm_live_by_mailbox", [ThreadMessage.mailboxId], false, "deleted_at IS NULL")
```

```yaml
options:
  "@kattebak/typespec-drizzle-orm-generator":
    frontend: "remit"
    schema-only: true
    foreign-keys: false
    id-default: true
```

## Schema-only output

`relations.ts`, `describe.ts`, and the `DrizzleClient` type use the Drizzle v2 relational API (`defineRelations`, `PgAsyncDatabase`). Set `schema-only: true` to emit just the table schema (`schema.ts` + the `base36Uuid` / nullable custom types), which stays compatible with Drizzle v1 consumers that manage relations themselves. The generated `package.json` then declares a `drizzle-orm` peer range of `>=0.30.0`.

## Foreign keys and id defaults

`foreign-keys: false` drops the collection-derived foreign keys for a consumer that manages referential integrity and delete cascades in the application (a database `ON DELETE CASCADE` would otherwise fight an app-managed cascade). `id-default: true` attaches `.$defaultFn(() => generateBase36Id())` to single-column text primary keys so a caller may omit the id. Both are honoured by the `remit` front-end.

## UUID columns

`@uuid` marks a column the application reads and writes as a 25-character base36 string. The `encoding` argument picks how that id is stored, and only the stored bytes change — every encoding round-trips to the same base36 string.

| `encoding`  | Stored form                     | PostgreSQL | SQLite | Bytes per value (PG / SQLite) |
| ----------- | ------------------------------- | ---------- | ------ | ----------------------------- |
| `canonical` | 36-character hyphenated UUID    | `uuid`     | `text` | 16 / 36                       |
| `base36`    | the 25-character base36 string  | `text`     | `text` | 25 / 25                       |
| `raw`       | the UUID's 16 bytes             | `uuid`     | `blob` | 16 / 16                       |

`canonical` is the default when the decorator names no encoding. PostgreSQL stores its native `uuid` type as 16 bytes, so `canonical` and `raw` are the same column there and only the SQLite side has a compact form to choose. SQLite has no native UUID type; `raw` is where a large table wins, at 16 bytes against 36.

Each encoding is backed by its own generated custom type — `canonicalUuid`, `base36Uuid`, `rawUuid` — exported from `types.ts` alongside `generateBase36Id()`, which mints a fresh base36 id for any of them. The conversion is emitted into the package, so a generated package has no runtime dependencies.

`base36` stores the id verbatim and converts nothing. `canonical` and `raw` convert every value in both directions, at about a microsecond each: a query passing 25,000 ids spends roughly 25 ms encoding them and 25 ms decoding the result.

```typespec
@pk @uuid("raw", true)
sessionId: string;

@uuid("base36") @references(Account.accountId)
accountId: string;
```

## Type mapping (PostgreSQL)

| TypeSpec                        | Drizzle                             | PostgreSQL                |
| ------------------------------- | ----------------------------------- | ------------------------- |
| `string`                        | `text()`                            | `text`                    |
| `string` (with length)          | `varchar({ length })`               | `varchar(n)`              |
| `int32`                         | `integer()`                         | `integer`                 |
| `int64`                         | `bigint({ mode: "number" })`        | `bigint`                  |
| `float32`                       | `real()`                            | `real`                    |
| `float64`                       | `doublePrecision()`                 | `double precision`        |
| `boolean`                       | `boolean()`                         | `boolean`                 |
| `utcDateTime`                   | `timestamp({ withTimezone: true })` | `timestamptz`             |
| `bytes`                         | `bytea()`                           | `bytea`                   |
| `string` + `@uuid("canonical")` | `canonicalUuid()`                   | `uuid`                    |
| `string` + `@uuid("base36")`    | `base36Uuid()`                      | `text`                    |
| `string` + `@uuid("raw")`       | `rawUuid()`                         | `uuid`                    |
| TypeSpec `enum`                 | `pgEnum()`                          | `CREATE TYPE ... AS ENUM` |

## Full example

See [src/fixtures/bookstore.tsp](src/fixtures/bookstore.tsp) for a complete 9-entity bookstore domain with authors, books, genres (many-to-many via junction), editions (3 FKs including nullable), reviews, tags, translators, and publishers.

## Contributing

```bash
npm install
npm test            # type-check + 461 tests
npm run lint:fix    # auto-fix with Biome
```

Tests run against SQLite in-memory (no Postgres needed). See [doc/](doc/) for the RFC and implementation plan.

## License

MIT
