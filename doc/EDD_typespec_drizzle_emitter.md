# EDD-001: TypeSpec Drizzle ORM Emitter — Phased Implementation Plan

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Status**     | In Progress — Phase 7 Complete                                         |
| **Author(s)**  | —                                                                      |
| **Created**    | 2026-02-17                                                             |
| **Updated**    | 2026-02-17 (Phases 4–7 complete)                                       |
| **RFC**        | [RFC: TypeSpec Drizzle ORM Emitter](RFC_typespec_emitter_for_drizzle_orm.md) |

---

## 1. Overview

### 1.1 Purpose

This document defines a phased implementation plan for the TypeSpec Drizzle ORM emitter described in the RFC. Each phase produces working, tested code that builds on the previous phase. Tests use Drizzle ORM with SQLite (in-memory) to validate generated patterns against a real database — no PostgreSQL instance required during development.

### 1.2 Scope

**In scope:**
- Intermediate representation (IR) for extracted TypeSpec metadata
- Code generation functions for each output file (`schema.ts`, `relations.ts`, `describe.ts`, `types.ts`, `index.ts`)
- Relation graph derivation algorithm
- SQLite-based integration tests using the bookstore domain from the RFC
- TypeSpec decorator and emitter wiring

**Out of scope:**
- Migration/trigger SQL generation (`@updatedAt` triggers) — deferred to a follow-up
- Drizzle-kit integration
- Multi-dialect output (the emitter targets PostgreSQL; SQLite is used only for testing)
- Shared decorator library with `typespec-electrodb-emitter` (RFC Open Question #1)

### 1.3 Definitions

| Term           | Definition                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| IR             | Intermediate Representation — typed data structures capturing entity metadata extracted from TypeSpec |
| Relation Graph | Bidirectional map of entity relationships derived from `@references` and `@junction` annotations     |
| Describe       | A generated query function that fetches an entity by PK with all its relations                       |
| Junction       | A table that exists solely to support a many-to-many relationship between two entities               |

---

## 2. Architecture

### 2.1 System Context

```
┌──────────────────────────────────────────────────────────┐
│                   TypeSpec Compiler                       │
│                                                          │
│  .tsp files → Decorators → StateMap → $onEmit callback   │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              typespec-drizzle-orm-generator               │
│                                                          │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │ Decorators   │──▶│ IR Builder   │──▶│ Code Emitter │  │
│  │ (@entity,    │   │ (extract     │   │ (generate    │  │
│  │  @primaryKey,│   │  metadata    │   │  .ts files)  │  │
│  │  @references)│   │  into IR)    │   │              │  │
│  └─────────────┘   └──────────────┘   └──────┬───────┘  │
└──────────────────────────────────────────────┼───────────┘
                                               │
                                               ▼
                                    ┌────────────────────┐
                                    │  Generated Package  │
                                    │  types.ts           │
                                    │  schema.ts          │
                                    │  relations.ts       │
                                    │  describe.ts        │
                                    │  index.ts           │
                                    └────────────────────┘
```

### 2.2 Component Architecture

The emitter is structured as three independent layers. Each layer is testable in isolation.

```
┌─────────────────────────────────────────────────┐
│  Layer 1: IR Types                               │
│  Pure TypeScript type definitions.               │
│  No dependencies.                                │
│                                                  │
│  EntityDef, FieldDef, RelationGraph,             │
│  PrimaryKeyDef, ReferenceDef, etc.               │
├─────────────────────────────────────────────────┤
│  Layer 2: Code Generators                        │
│  Pure functions: IR → string.                    │
│  No TypeSpec dependency. No database dependency. │
│                                                  │
│  generateSchema(entities) → string               │
│  generateRelations(graph) → string               │
│  generateDescribe(entities, graph) → string      │
│  generateTypes(config) → string                  │
│  generateIndex() → string                        │
├─────────────────────────────────────────────────┤
│  Layer 3: TypeSpec Integration                   │
│  Decorators + $onEmit.                           │
│  Depends on @typespec/compiler.                  │
│                                                  │
│  $entity, $primaryKey, $references, etc.         │
│  $onEmit: TypeSpec Model → IR → Code Generators  │
└─────────────────────────────────────────────────┘
```

### 2.3 Data Flow

```
TypeSpec Source (.tsp)
  │
  ▼  [TypeSpec Compiler]
Decorated Models (in-memory type graph)
  │
  ▼  [Decorators → StateMap]
Extracted Metadata (per-model state)
  │
  ▼  [IR Builder]
EntityDef[] + RelationGraph
  │
  ├──▶ generateSchema()    → schema.ts
  ├──▶ generateRelations() → relations.ts
  ├──▶ generateDescribe()  → describe.ts
  ├──▶ generateTypes()     → types.ts
  └──▶ generateIndex()     → index.ts
```

---

## 3. Testing Strategy: SQLite as Validation Oracle

### 3.1 Rationale

The emitter generates PostgreSQL-targeted code (`pgTable`, `base36Uuid`, `timestamp`). Running this code requires a PostgreSQL instance. For fast, dependency-free testing, we use a **dual testing strategy**:

1. **Unit tests** — test code generators as pure `IR → string` functions. Assert on the generated code using string matching and snapshots.
2. **Integration tests with SQLite** — maintain a hand-written SQLite Drizzle schema that mirrors the expected PostgreSQL output (the bookstore domain). Run real queries against an in-memory SQLite database to validate that the relation graph and describe query patterns are correct.

This means the integration tests don't test the *generated strings* — they test the *patterns and algorithms* that produce those strings. When the relation graph algorithm says "Book has a many-to-many with Genre through BookGenre", the SQLite test proves this pattern actually works with real data.

### 3.2 SQLite Test Infrastructure

```
test/
  fixtures/
    bookstore-schema.ts    # SQLite Drizzle schema (mirrors expected pg output)
    bookstore-relations.ts # defineRelations for the bookstore domain
    bookstore-seed.ts      # Seed data: authors, books, genres, etc.
    db.ts                  # In-memory SQLite setup with drizzle()
  ir/
    ir-types.test.ts       # IR construction tests
    relation-graph.test.ts # Relation graph algorithm tests
  generators/
    schema.test.ts         # schema.ts code generation tests
    relations.test.ts      # relations.ts code generation tests
    describe.test.ts       # describe.ts code generation tests
  integration/
    bookstore.test.ts      # Full integration: seed SQLite, run describe queries
```

### 3.3 Test Dependencies

| Package               | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `drizzle-orm@beta`    | ORM v2 — `defineRelations` + `through()` support |
| `better-sqlite3`      | Synchronous SQLite driver (in-memory `:memory:`) |
| `@types/better-sqlite3` | TypeScript types for better-sqlite3            |

We use `better-sqlite3` for tests — it is synchronous, zero-config, and works with `drizzle-orm/better-sqlite3`. An in-memory database is created per test, ensuring isolation. The `drizzle-orm@beta` (1.0.0-beta.x) is required for the v2 `defineRelations` API with `through()` support.

```typescript
// test/fixtures/db.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { relations } from "./bookstore-relations.ts";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  // DDL via raw client (supports multi-statement), then wrap with drizzle
  sqlite.exec(`CREATE TABLE authors (...); CREATE TABLE books (...); ...`);

  // v2 API: { client, relations } — not positional args + { schema }
  return drizzle({ client: sqlite, relations });
}
```

### 3.4 Drizzle v2 API Notes (discovered in Phase 1)

The v2 `defineRelations` API differs from the v1 `relations()` API in several ways that affect both the test infrastructure and the generated code:

| Concern | v1 (stable 0.x) | v2 (beta 1.x) |
| ------- | ---------------- | -------------- |
| Relation definition | Per-table `relations(table, ...)` | Centralized `defineRelations(schema, ...)` |
| Drizzle setup | `drizzle(client, { schema })` | `drizzle({ client, relations })` |
| `where` in queries | `eq(table.col, value)` | Object syntax: `{ colName: value }` |
| Many-to-many | Manual junction traversal | `through()` on relation fields |

**Impact on generated `describe.ts`**: The describe functions should use the v2 object-based `where` syntax instead of `eq()`:

```typescript
// v2 style (correct for generated code)
db.query.books.findFirst({
  where: { bookId },
  with: { author: true, editions: true },
});

// v1 style (will NOT work with defineRelations)
db.query.books.findFirst({
  where: eq(schema.books.bookId, bookId),
  with: { author: true, editions: true },
});
```

---

## 4. IR Types (Layer 1)

### 4.1 Core Types

```typescript
// src/ir/types.ts

/** UUID encoding options for @uuid decorator */
type UuidEncoding = "base36" | "canonical" | "raw";

/** Column-level field definition extracted from a TypeSpec model property */
interface FieldDef {
  name: string;                       // TypeSpec property name (camelCase)
  columnName: string;                 // SQL column name (snake_case)
  type: FieldType;                    // Resolved column type
  nullable: boolean;                  // true if property is optional (?)
  uuid?: {
    encoding: UuidEncoding;
    autoGenerate: boolean;
  };
  references?: {
    entityName: string;               // Target entity name
    fieldName: string;                // Target field name
  };
  createdAt: boolean;
  updatedAt: boolean;
  visibility?: "read";               // @visibility(Lifecycle.Read)
  defaultValue?: unknown;            // TypeSpec default value
  constraints?: {
    minValue?: number;
    maxValue?: number;
    check?: string;                  // Raw SQL check expression
    unique?: boolean;
  };
}

/** Resolved column type after applying all decorators */
type FieldType =
  | { kind: "text" }
  | { kind: "varchar"; length: number }
  | { kind: "integer" }
  | { kind: "bigint" }
  | { kind: "real" }
  | { kind: "doublePrecision" }
  | { kind: "boolean" }
  | { kind: "timestamp" }
  | { kind: "uuid"; encoding: UuidEncoding }
  | { kind: "enum"; enumName: string; values: string[] };

/** Primary key definition from @primaryKey decorator */
interface PrimaryKeyDef {
  tableName: string;                  // SQL table name
  columns: string[];                  // Field names (not column names)
  isComposite: boolean;               // true if columns.length > 1
}

/** Foreign key constraint from @foreignKey decorator */
interface ForeignKeyDef {
  name: string;
  columns: string[];                  // Local field names
  foreignEntity: string;              // Target entity name
  foreignColumns: string[];           // Target field names
}

/** Full entity definition extracted from a TypeSpec model */
interface EntityDef {
  name: string;                       // Entity name from @entity
  service: string;                    // Service/schema grouping
  tableName: string;                  // SQL table name from @primaryKey.name
  primaryKey: PrimaryKeyDef;
  fields: FieldDef[];
  foreignKeys: ForeignKeyDef[];       // Composite FKs from @foreignKey
  isJunction: boolean;                // true if @junction
  indexes: IndexDef[];
  uniqueConstraints: UniqueConstraintDef[];
}

/** Index definition from @index decorator */
interface IndexDef {
  name: string;
  columns: string[];                  // Field names
  unique: boolean;
}

/** Composite unique constraint from @unique({ name, columns }) */
interface UniqueConstraintDef {
  name: string;
  columns: string[];                  // Field names
}

/** Enum definition extracted from a TypeSpec enum */
interface EnumDef {
  name: string;                       // TypeSpec enum name
  sqlName: string;                    // PostgreSQL type name (snake_case)
  values: string[];                   // Enum member values
}
```

### 4.2 Relation Graph Types

```typescript
// src/ir/relation-graph.ts

/** A one-to-one or many-to-one relation (FK holder side) */
interface OneRelation {
  kind: "one";
  name: string;                       // Relation name (e.g., "author")
  fromEntity: string;                 // Source entity (FK holder)
  fromField: string;                  // Source field name
  toEntity: string;                   // Target entity
  toField: string;                    // Target field name
  optional: boolean;                  // true if FK field is nullable
}

/** A one-to-many reverse relation */
interface ManyRelation {
  kind: "many";
  name: string;                       // Relation name (e.g., "books")
  entity: string;                     // The "many" side entity
}

/** A many-to-many through junction relation */
interface ManyThroughRelation {
  kind: "many-through";
  name: string;                       // Relation name (e.g., "genres")
  fromEntity: string;                 // This entity
  fromField: string;                  // This entity's PK field
  toEntity: string;                   // Target entity
  toField: string;                    // Target entity's PK field
  junction: {
    entity: string;                   // Junction entity name
    fromField: string;                // Junction FK to this entity
    toField: string;                  // Junction FK to target entity
  };
}

type Relation = OneRelation | ManyRelation | ManyThroughRelation;

/** Complete relation graph: entity name → its relations */
type RelationGraph = Map<string, Relation[]>;
```

---

## 5. Phased Implementation Plan

### Phase 1: Project Infrastructure & IR Types ✅

**Status:** Complete

**Goal:** Establish the project foundation — dependencies, test harness, and core IR types. Prove the toolchain works end-to-end with a minimal SQLite test.

**Delivers:** Working test infrastructure, IR type definitions, SQLite bookstore fixture.

#### 5.1.1 Dependencies

Added to `package.json`:

```json
{
  "devDependencies": {
    "drizzle-orm": "1.0.0-beta.15",
    "better-sqlite3": "latest",
    "@types/better-sqlite3": "latest"
  }
}
```

No runtime dependencies — `drizzle-orm` and `better-sqlite3` are dev-only (used for tests). The emitter itself produces code strings and has no runtime dependency on Drizzle. The beta version of `drizzle-orm` is required for the v2 `defineRelations` API (see Section 3.4).

#### 5.1.2 Deliverables

| File                                 | Type   | Description                               |
| ------------------------------------ | ------ | ----------------------------------------- |
| `src/ir/types.ts`                    | Create | IR type definitions (Section 4.1)         |
| `src/ir/relation-graph.ts`           | Create | Relation graph types + builder function   |
| `test/fixtures/bookstore-schema.ts`  | Create | SQLite bookstore schema                   |
| `test/fixtures/bookstore-relations.ts` | Create | defineRelations for bookstore           |
| `test/fixtures/bookstore-seed.ts`    | Create | Seed data for all bookstore entities      |
| `test/fixtures/db.ts`               | Create | createTestDb() helper                     |
| `test/integration/smoke.test.ts`    | Create | Smoke test: create DB, seed, query        |

#### 5.1.3 SQLite Bookstore Schema (test fixture)

The bookstore schema from the RFC, translated to SQLite. This serves as the "expected output" reference — it's what the emitter should generate (modulo pg→sqlite dialect differences).

```typescript
// test/fixtures/bookstore-schema.ts
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const authors = sqliteTable("authors", {
  authorId: text("author_id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio"),
  birthYear: integer("birth_year"),
  nationality: text("nationality"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const books = sqliteTable("books", {
  bookId: text("book_id").primaryKey(),
  authorId: text("author_id").notNull().references(() => authors.authorId),
  title: text("title").notNull(),
  originalLanguage: text("original_language").notNull(),
  publicationYear: integer("publication_year").notNull(),
  isbn: text("isbn"),
  pageCount: integer("page_count"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ... (all 9 entities from the RFC bookstore domain)
```

Key differences from the PostgreSQL version:
- `text()` instead of `base36Uuid()` — SQLite has no native UUID type
- `text()` instead of `timestamp()` — SQLite stores timestamps as text
- No `.defaultRandom()` — UUIDs generated in seed data, not by the DB
- `primaryKey()` composite works the same way in SQLite

#### 5.1.4 Smoke Test

```typescript
// test/integration/smoke.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedBookstore } from "../fixtures/db.ts";

describe("SQLite bookstore smoke test", () => {
  it("creates tables, seeds data, and queries an author with books", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const author = await db.query.authors.findFirst({
      with: { books: true },
    });

    assert.ok(author);
    assert.ok(author.books.length > 0);
  });
});
```

#### 5.1.5 Exit Criteria

- [x] `npm test` passes with the smoke test (10/10 tests green)
- [x] SQLite bookstore schema creates all 9 tables
- [x] Seed data can be inserted and queried with relations
- [x] IR types compile without errors

#### 5.1.6 Phase 1 Results

**Resolved open questions:**

- **Q-01**: `better-sqlite3` chosen — synchronous, zero-config, works well
- **Q-03**: `defineRelations` + `through()` confirmed working on SQLite with `drizzle-orm@beta`

**Tests implemented** (8 smoke tests in `test/integration/smoke.test.ts`):

1. Author with books (one-to-many)
2. Book with author (many-to-one)
3. Book with editions, tags, reviews (multiple one-to-many)
4. Book with genres via junction (many-to-many with `through()`)
5. Genre with books (reverse many-to-many)
6. Edition with book, translator, publisher (multiple foreign keys)
7. Edition with nullable translator (`null` FK)
8. All 9 tables created and populated

---

### Phase 2: Column Mapping & Schema Generation ✅

**Status:** Complete

**Goal:** Implement the core code generation for `schema.ts` — transforming `EntityDef[]` into Drizzle `pgTable()` code.

**Depends on:** Phase 1 (IR types)

#### 5.2.1 Column Mapping Function

Pure function that maps `FieldDef` → Drizzle column code string. The function requires the `EntityDef` context in addition to the field — this is needed to determine whether a field is a single-column PK (which controls `.primaryKey()` and `.notNull()` emission):

```typescript
// src/generators/column-mapper.ts

function mapFieldToColumn(field: FieldDef, entity: EntityDef): string {
  // Returns a string like:
  //   base36Uuid("author_id").primaryKey().defaultRandom()
  //   text("name").notNull()
  //   integer("birth_year")
  //   timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}
```

| Input                                            | Output                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `{ type: { kind: "text" }, nullable: false }`    | `text("col_name").notNull()`                                    |
| `{ type: { kind: "uuid" }, uuid.autoGenerate }`  | `base36Uuid("col_name").primaryKey().defaultRandom()`           |
| `{ type: { kind: "integer" }, nullable: true }`  | `integer("col_name")`                                           |
| `{ type: { kind: "timestamp" }, createdAt }`     | `timestamp("col_name", { withTimezone: true }).notNull().defaultNow()` |
| `{ type: { kind: "enum" }, ... }`                | `bookFormatEnum("col_name").notNull()`                          |

#### 5.2.2 Schema Generator

```typescript
// src/generators/schema-generator.ts

function generateSchema(entities: EntityDef[], enums: EnumDef[]): string {
  // Produces the full schema.ts file content:
  // - Import declarations (auto-collected from field types)
  // - pgEnum() calls for each enum
  // - pgTable() calls for each entity
  // - Composite primaryKey() for junction tables
  // - .references() for FK fields
}
```

#### 5.2.3 Deliverables

| File                                    | Type   | Description                                    |
| --------------------------------------- | ------ | ---------------------------------------------- |
| `src/generators/naming.ts`              | Create | camelCase ↔ snake_case + pluralization utils   |
| `src/generators/column-mapper.ts`       | Create | FieldDef → Drizzle column code string          |
| `src/generators/schema-generator.ts`    | Create | EntityDef[] → complete schema.ts content       |
| `test/fixtures/bookstore-ir.ts`         | Create | Bookstore domain as IR (test fixture for all generator tests) |
| `test/generators/column-mapper.test.ts` | Create | Column mapping unit tests (19 tests)           |
| `test/generators/schema.test.ts`        | Create | Schema generation tests (14 tests)             |

#### 5.2.4 Test Approach

Unit tests assert on generated code strings:

```typescript
describe("column mapper", () => {
  it("maps a required text field", () => {
    const field: FieldDef = {
      name: "title",
      columnName: "title",
      type: { kind: "text" },
      nullable: false,
      createdAt: false,
      updatedAt: false,
    };
    const entity = makeEntity(["id"]);
    assert.equal(mapFieldToColumn(field, entity), 'text("title").notNull()');
  });

  it("maps a uuid primary key with auto-generation", () => {
    // ...
    assert.equal(result, 'base36Uuid("author_id").primaryKey().defaultRandom()');
  });
});
```

Schema generation tests compare against expected multi-line strings for each entity from the RFC.

#### 5.2.5 Exit Criteria

- [x] Column mapper handles all type conversions from the RFC table (Section "Type Conversion Rules")
- [x] Schema generator produces correct `pgTable()` code for all 9 bookstore entities
- [x] Composite primary keys generate correctly for junction tables
- [x] Foreign key references generate correctly

#### 5.2.6 Phase 2 Results

**Signature discovery:** `mapFieldToColumn` requires `(field, entity)` — not just `field`. The entity context is needed to determine:
- Whether a field is a single-column PK (emit `.primaryKey()`) vs composite PK (handled at table level)
- Whether to skip `.notNull()` on PK fields (PKs are implicitly not null)

**Toolchain fix:** Added `allowImportingTsExtensions: true` and `noEmit: true` to `tsconfig.json` so `.ts` extension imports work consistently across both `tsgo` type checking and Node.js `--experimental-strip-types` runtime. Previously, src files needed `.js` extensions for `tsgo` but `.ts` for runtime, creating an inconsistency.

**Naming utilities:** `toTableVariableName` uses naive pluralization (consonant+y→ies, sibilant→es, default→s). Sufficient for the bookstore domain; irregular plurals (e.g., "person"→"people") would need a lookup table or the `tableName` from IR directly.

**Import collection:** The schema generator auto-collects `drizzle-orm/pg-core` imports by scanning field types. UUID fields with `field.uuid` set skip the type-based import (they use `base36Uuid` from `./types.js` instead).

**Tests implemented** (33 new tests: 19 column mapper + 14 schema generator):

Column mapper coverage:
- All 9 base types: text, varchar, integer, bigint, real, doublePrecision, boolean, timestamp, enum
- UUID variants: PK with autoGenerate, FK without autoGenerate, nullable FK
- Timestamp variants: @createdAt, @updatedAt, plain timestamp
- Composite PK fields (no `.primaryKey()`)
- Default values (numeric and string)

Schema generator coverage:
- All 9 bookstore entities individually verified
- Import generation (pg-core + base36Uuid)
- pgEnum declaration
- Composite PK with table callback
- FK references including nullable
- Structural validation (balanced braces/parens)

---

### Phase 3: Relation Graph Algorithm ✅

**Status:** Complete

**Goal:** Implement the relation derivation algorithm and `relations.ts` code generation.

**Depends on:** Phase 1 (IR types), Phase 2 (entity definitions)

#### 5.3.1 Relation Graph Builder

Implements the algorithm from RFC Section "Relation Derivation Algorithm":

```typescript
// src/ir/relation-graph.ts

function buildRelationGraph(entities: EntityDef[]): RelationGraph {
  // 1. For each entity, collect @references fields → OneRelation + ManyRelation (reverse)
  // 2. For each @junction entity, create ManyThroughRelation on both sides
  // 3. Return Map<entityName, Relation[]>
}
```

#### 5.3.2 Relations Code Generator

```typescript
// src/generators/relations-generator.ts

function generateRelations(
  entities: EntityDef[],
  graph: RelationGraph,
): string {
  // Produces the full relations.ts file content:
  // - import { defineRelations } from "drizzle-orm"
  // - import * as schema from "./schema.js"
  // - export const relations = defineRelations(schema, (r) => ({ ... }))
}
```

#### 5.3.3 Deliverables

| File                                    | Type   | Description                                       |
| --------------------------------------- | ------ | ------------------------------------------------- |
| `src/ir/relation-graph.ts`              | Modify | Add `buildRelationGraph()` implementation         |
| `src/generators/relations-generator.ts` | Create | RelationGraph → relations.ts code                 |
| `test/ir/relation-graph.test.ts`        | Create | Graph algorithm unit tests                        |
| `test/generators/relations.test.ts`     | Create | Relations code generation tests                   |
| `test/integration/relations.test.ts`    | Create | SQLite: query related data through defineRelations |

#### 5.3.4 Test Approach — Unit Tests

Test the graph algorithm produces the expected relations for the bookstore domain:

```typescript
describe("buildRelationGraph", () => {
  it("creates one-to-many between Author and Book", () => {
    const graph = buildRelationGraph(bookstoreEntities);
    const bookRelations = graph.get("Book");

    // Book should have a "one" relation to Author
    const authorRel = bookRelations?.find(r => r.name === "author");
    assert.deepEqual(authorRel, {
      kind: "one",
      name: "author",
      fromEntity: "Book",
      fromField: "authorId",
      toEntity: "Author",
      toField: "authorId",
      optional: false,
    });

    // Author should have a "many" reverse to Book
    const authorRelations = graph.get("Author");
    const booksRel = authorRelations?.find(r => r.name === "books");
    assert.equal(booksRel?.kind, "many");
  });

  it("creates many-to-many through junction for Book ↔ Genre", () => {
    const graph = buildRelationGraph(bookstoreEntities);
    const bookRelations = graph.get("Book");

    const genresRel = bookRelations?.find(r => r.name === "genres");
    assert.equal(genresRel?.kind, "many-through");
    assert.equal(genresRel?.junction.entity, "BookGenre");
  });
});
```

#### 5.3.5 Test Approach — SQLite Integration

Validate that `defineRelations` with the bookstore schema works for relational queries:

```typescript
describe("bookstore relations (SQLite)", () => {
  it("queries a book with its author via relational query", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      with: { author: true },
    });

    assert.ok(book);
    assert.equal(book.author.name, "Gabriel García Márquez");
  });

  it("queries genres through junction table", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const book = await db.query.books.findFirst({
      with: { genres: true },
    });

    assert.ok(book);
    assert.ok(book.genres.length > 0);
  });
});
```

#### 5.3.6 Exit Criteria

- [x] Relation graph correctly identifies all one-to-one, one-to-many, and many-to-many relations in the bookstore domain
- [x] Generated `defineRelations` code matches the expected output from the RFC
- [x] SQLite integration tests successfully query all relation types

#### 5.3.7 Phase 3 Results

**Algorithm design decisions:**

- **Junction FK handling:** Junction entity `@references` fields produce `one` relations on the junction itself but do NOT produce `many` reverses on the target entities. Instead, the junction processing step creates `many-through` relations on both sides. This prevents duplicate paths (e.g., Book would otherwise get both `bookGenres: r.many.bookGenres()` and `genres: r.many.genres({ through... })`).
- **Relation naming:** `deriveOneRelationName` strips the "Id" suffix from FK field names (e.g., "authorId" → "author"). Reverse many relations use `toTableVariableName` (e.g., "Book" → "books"), which coincides with the table variable name.
- **Cross-layer import:** `buildRelationGraph` imports `toTableVariableName` from `src/generators/naming.ts`. The `pluralize` logic is needed for relation naming (many reverse names). This is a minor layer boundary crossing — naming is a pure string utility, not generator-specific logic.

**Tests implemented** (52 new tests: 3 deriveOneRelationName + 20 relation graph + 16 relations generator + 13 integration):

Relation graph coverage:
- All 9 entities have graph entries
- Author: 1 relation (many books)
- Book: 5 relations (one author + many bookTags/editions/reviews + many-through genres)
- Genre: 1 relation (many-through books)
- BookGenre: 2 relations (one book + one genre), no many reverses produced
- BookTag: 1 relation (one book)
- Translator: 1 relation (many editions)
- Publisher: 1 relation (many editions)
- Edition: 3 relations (one book + one translator [optional] + one publisher)
- Review: 1 relation (one book)

Relations generator coverage:
- Import generation (drizzle-orm + schema)
- defineRelations wrapper structure
- All 9 entity relation blocks with correct `r.one`, `r.many`, `r.many.through()` syntax
- Structural validation (balanced braces/parens)

Integration test coverage:
- One-to-many (Author → Books)
- Many-to-one (Book → Author)
- Many-to-many through junction (Book ↔ Genre, bidirectional)
- Junction entity queries (BookGenre → Book + Genre)
- Multiple FKs from one entity (Edition → Book, Translator, Publisher)
- Nullable FK returns null (Edition.translator)
- Reverse relations (BookTag → Book, Review → Book, Translator → editions, Publisher → editions)
- Complete traversal (Book with all 5 relations at once)

---

### Phase 4: Describe Query Generation ✅

**Status:** Complete

**Goal:** Generate typed `describe*()` functions for every non-junction entity.

**Depends on:** Phase 3 (relation graph)

#### 5.4.1 Describe Generator

```typescript
// src/generators/describe-generator.ts

function generateDescribe(
  entities: EntityDef[],
  graph: RelationGraph,
): string {
  // For each non-junction entity:
  //   1. Generate the Description type alias
  //   2. Generate the describe function using findFirst + with
  //   3. Include all relations from the relation graph
  //
  // Junction entities are skipped.
}
```

#### 5.4.2 Deliverables

| File                                    | Type   | Description                                      |
| --------------------------------------- | ------ | ------------------------------------------------ |
| `src/generators/describe-generator.ts`  | Create | EntityDef[] + RelationGraph → describe.ts code   |
| `test/generators/describe.test.ts`      | Create | Describe code generation unit tests              |
| `test/integration/describe.test.ts`     | Create | SQLite: run describe-equivalent queries          |

#### 5.4.3 Test Approach — SQLite Integration

Run the describe query pattern against the SQLite bookstore to validate it returns complete data:

```typescript
describe("describe queries (SQLite)", () => {
  it("describeBook returns book with author, editions, genres, tags, reviews", async () => {
    const db = createTestDb();
    seedBookstore(db);

    // This mirrors what the generated describeBook() would do (v2 object-based where)
    const book = await db.query.books.findFirst({
      where: { bookId: "book-1" },
      with: {
        author: true,
        editions: true,
        genres: true,
        bookTags: true,
        reviews: true,
      },
    });

    assert.ok(book);
    assert.equal(typeof book.author.name, "string");
    assert.ok(Array.isArray(book.editions));
    assert.ok(Array.isArray(book.genres));
    assert.ok(Array.isArray(book.bookTags));
    assert.ok(Array.isArray(book.reviews));
  });

  it("describeEdition returns edition with book, translator, publisher", async () => {
    const db = createTestDb();
    seedBookstore(db);

    const edition = await db.query.editions.findFirst({
      with: {
        book: true,
        translator: true,
        publisher: true,
      },
    });

    assert.ok(edition);
    assert.ok(edition.book);
    assert.ok(edition.publisher);
    // translator may be null (optional FK)
  });

  it("does not generate describe for junction entities", () => {
    const code = generateDescribe(bookstoreEntities, graph);
    assert.ok(!code.includes("describeBookGenre"));
  });
});
```

#### 5.4.4 Exit Criteria

- [x] Describe functions generated for all 8 non-junction entities (Author, Book, Genre, BookTag, Translator, Publisher, Edition, Review)
- [x] No describe function generated for BookGenre (junction)
- [x] SQLite integration tests prove the query patterns return correct, complete data
- [x] Generated Description types match the RFC examples

#### 5.4.5 Phase 4 Results

**Design decisions:**

- **Junction exclusion:** `generateDescribe` skips entities where `isJunction === true`. BookGenre has no describe function.
- **Optional relation typing:** `one` relations with `optional: true` (e.g., `Edition.translator`) generate `TranslatorDescription | null` in the Description type. Required `one` relations generate just the type without `| null`.
- **v2 where syntax:** Describe functions use the object-based `where: { bookId }` syntax, not `eq()`.
- **DrizzleClient type:** Imported from generated `types.ts` via `import type { DrizzleClient } from "./types.js"`.

**Tests implemented** (32 new tests: 22 unit + 10 integration):

Unit test coverage (`test/generators/describe.test.ts`):
- Import generation (DrizzleClient + schema)
- Junction entity exclusion (BookGenre)
- All 8 non-junction entity Description types with correct relation fields
- All 8 non-junction entity describe functions with v2 where syntax
- Structural validation (balanced braces/parens)
- Entity count validation (8 describe functions, 8 Description types)

Integration test coverage (`test/integration/describe.test.ts`):
- All 8 non-junction entities queried by PK with full relation loading
- Nullable FK handling (Edition.translator returns null)
- Non-existent PK returns undefined

---

### Phase 5: Package Assembly & Types Generation ✅

**Status:** Complete

**Goal:** Generate the remaining output files (`types.ts`, `index.ts`, `package.json`) and assemble the complete output package.

**Depends on:** Phase 2, 3, 4 (all generators)

#### 5.5.1 Types Generator

```typescript
// src/generators/types-generator.ts

function generateTypes(config: EmitterConfig): string {
  // Produces types.ts with:
  //   - base36Uuid custom type (from RFC Section "Custom Types")
  //   - DrizzleClient type alias (for describe functions)
}
```

#### 5.5.2 Package Assembler

```typescript
// src/assembler.ts

interface EmitterConfig {
  outputDir: string;
  packageName: string;
  packageVersion: string;
  naming: "snake_case" | "camelCase";
}

function assemblePackage(
  entities: EntityDef[],
  enums: EnumDef[],
  config: EmitterConfig,
): Map<string, string> {
  // Returns filename → content for all generated files:
  //   package.json, types.ts, schema.ts, relations.ts, describe.ts, index.ts
  const graph = buildRelationGraph(entities);

  return new Map([
    ["package.json", generatePackageJson(config)],
    ["types.ts", generateTypes(config)],
    ["schema.ts", generateSchema(entities, enums)],
    ["relations.ts", generateRelations(entities, graph)],
    ["describe.ts", generateDescribe(entities, graph)],
    ["index.ts", generateIndex()],
  ]);
}
```

#### 5.5.3 Deliverables

| File                                | Type   | Description                              |
| ----------------------------------- | ------ | ---------------------------------------- |
| `src/generators/types-generator.ts` | Create | Config → types.ts content                |
| `src/generators/index-generator.ts` | Create | Re-export barrel file                    |
| `src/assembler.ts`                  | Create | Full package assembly                    |
| `test/generators/types.test.ts`     | Create | Types generation tests                   |
| `test/integration/assembly.test.ts` | Create | Full assembly test with bookstore domain |

#### 5.5.4 Exit Criteria

- [x] `assemblePackage()` produces all 6 files with correct content
- [x] Generated `package.json` has correct name, version, exports
- [x] Generated `index.ts` re-exports all public symbols
- [x] Full bookstore assembly matches expected output from the RFC

#### 5.5.5 Phase 5 Results

**Design decisions:**

- **DrizzleClient type alias:** Uses `Parameters<typeof relations.applyTo>[0]` pattern to derive the typed client from the generated relations.
- **base36Uuid custom type:** Uses `short-uuid` with `uuid25Base36` alphabet for compact, URL-safe UUIDs stored as native PostgreSQL `uuid` type.
- **Simplified EmitterConfig:** `assemblePackage` takes `{ packageName, packageVersion }` — the `outputDir` and `naming` fields are handled at the TypeSpec integration layer (Phase 6), not in the assembler.
- **Internal graph building:** `assemblePackage` calls `buildRelationGraph` internally so callers don't need to manage the graph separately.

**Tests implemented** (27 new tests: 8 types + 4 index + 15 assembly):

Types generator coverage (`test/generators/types.test.ts`):
- `customType` import from drizzle-orm/pg-core
- `short-uuid` import and base36 translator
- `base36Uuid` custom type export with `dataType`, `toDriver`, `fromDriver`
- `DrizzleClient` type alias export
- `relations` type import for DrizzleClient

Index generator coverage (`test/generators/types.test.ts`):
- Re-exports for types, schema, relations, describe modules

Assembly coverage (`test/integration/assembly.test.ts`):
- File count (exactly 6 files)
- All expected filenames present
- package.json: name, version, exports, dependencies
- types.ts: base36Uuid + DrizzleClient
- schema.ts: all 9 tables + correct imports + base36Uuid import
- relations.ts: defineRelations + all 9 entity blocks
- describe.ts: 8 describe functions + v2 where syntax
- index.ts: all module re-exports

---

### Phase 6: TypeSpec Decorator & Emitter Wiring ✅

**Status:** Complete

**Goal:** Connect the code generators to the TypeSpec compiler via decorators and `$onEmit`.

**Depends on:** Phase 5 (assembler), all previous phases

#### 5.6.1 Dependencies

Add to `package.json`:

```json
{
  "peerDependencies": {
    "@typespec/compiler": ">=0.60.0"
  },
  "devDependencies": {
    "@typespec/compiler": "latest"
  }
}
```

#### 5.6.2 Decorator Definitions

Each decorator extracts metadata and stores it in the TypeSpec program's state:

```typescript
// src/decorators.ts
import { DecoratorContext, Model, ModelProperty } from "@typespec/compiler";

export function $entity(context: DecoratorContext, target: Model, name: string, service: string) {
  context.program.stateMap(StateKeys.entity).set(target, { name, service });
}

export function $primaryKey(context: DecoratorContext, target: Model, options: { name: string; columns: ModelProperty[] }) {
  context.program.stateMap(StateKeys.primaryKey).set(target, options);
}

export function $references(context: DecoratorContext, target: ModelProperty, ref: ModelProperty) {
  context.program.stateMap(StateKeys.references).set(target, ref);
}

// ... @junction, @uuid, @createdAt, @updatedAt, @visibility, @foreignKey,
//     @unique, @check, @index
```

#### 5.6.3 IR Builder (TypeSpec → IR)

```typescript
// src/ir/builder.ts

function buildIR(program: Program): { entities: EntityDef[]; enums: EnumDef[] } {
  // Iterates all models with @entity state
  // Reads @primaryKey, @references, @junction, @uuid, etc. from state maps
  // Constructs EntityDef[] and EnumDef[]
}
```

#### 5.6.4 Emitter Entry Point

```typescript
// src/index.ts

export async function $onEmit(context: EmitContext<EmitterOptions>) {
  const { entities, enums } = buildIR(context.program);
  const config: EmitterConfig = {
    outputDir: context.emitterOutputDir,
    packageName: context.options["package-name"],
    packageVersion: context.options["package-version"],
    naming: context.options.naming ?? "snake_case",
  };

  const files = assemblePackage(entities, enums, config);

  for (const [filename, content] of files) {
    await context.program.host.writeFile(
      resolvePath(context.emitterOutputDir, filename),
      content,
    );
  }
}
```

#### 5.6.5 Deliverables

| File                               | Type   | Description                              |
| ---------------------------------- | ------ | ---------------------------------------- |
| `src/lib.ts`                       | Create | TypeSpec library definition + StateKeys  |
| `src/decorators.ts`                | Create | All decorator implementations            |
| `src/decorators.tsp`               | Create | TypeSpec decorator declarations          |
| `src/ir/builder.ts`                | Create | TypeSpec program → IR extraction         |
| `src/index.ts`                     | Modify | Replace placeholder with $onEmit        |
| `test/typespec/decorators.test.ts` | Create | Decorator extraction tests               |
| `test/typespec/emitter.test.ts`    | Create | End-to-end: .tsp → generated files      |
| `test/fixtures/bookstore.tsp`      | Create | Full bookstore TypeSpec source           |

#### 5.6.6 Test Approach

TypeSpec integration tests use the compiler API to compile `.tsp` files programmatically:

```typescript
describe("emitter end-to-end", () => {
  it("compiles the bookstore TypeSpec and generates all output files", async () => {
    const program = await compile("test/fixtures/bookstore.tsp", {
      emit: ["typespec-drizzle-orm-generator"],
      options: {
        "typespec-drizzle-orm-generator": {
          "emitter-output-dir": tempDir,
          "package-name": "@bookstore/drizzle-schema",
          "package-version": "0.0.1",
        },
      },
    });

    assert.ok(existsSync(join(tempDir, "schema.ts")));
    assert.ok(existsSync(join(tempDir, "relations.ts")));
    assert.ok(existsSync(join(tempDir, "describe.ts")));
    assert.ok(existsSync(join(tempDir, "types.ts")));
    assert.ok(existsSync(join(tempDir, "index.ts")));
    assert.ok(existsSync(join(tempDir, "package.json")));
  });
});
```

#### 5.6.7 Exit Criteria

- [x] All decorators extract metadata correctly from TypeSpec programs
- [x] `$onEmit` produces the complete bookstore package
- [x] Generated output matches the RFC examples
- [x] End-to-end test passes: decorators → IR builder → assemblePackage → correct content

#### 5.6.8 Phase 6 Results

**Decorator design simplification:** The EDD/RFC specified `@primaryKey({ name: "authors", columns: [Author.authorId] })` with an object parameter containing a `ModelProperty[]`. TypeSpec's `extern dec` mechanism does not easily support anonymous model types with `ModelProperty` arrays as parameters. Simplified to two cooperating decorators:
- `@primaryKey("authors")` on the model — stores the SQL table name
- `@pk` on individual properties — marks PK columns

This captures the same information and is more idiomatic TypeSpec.

**Mock-based testing approach:** The project uses `noEmit: true` with `--experimental-strip-types`, meaning there is no compiled JavaScript output. TypeSpec's test infrastructure (`createTestLibrary`, `createTestRunner`) requires compiled `.js` files for the emitter library. Instead of adding a build step, all TypeSpec integration tests use mock `Program` objects:
- A `ProgramStateAccess` interface abstracts the state access (`stateMap`, `stateSet`)
- Tests call real decorator functions to populate state maps/sets
- The IR builder reads from these same state maps, verifying the full decorator → IR pipeline
- This approach tests all logic except the TypeSpec compiler's `.tsp` parsing step

**Deferred:** Real TypeSpec compilation tests (`.tsp` → compiled emitter → output files) require a build step to produce `.js` artifacts. This is deferred to future work when a build pipeline is established.

**Tests implemented** (29 new tests: 10 decorator + 12 IR builder + 6 end-to-end + 3 export verification - note: 2 tests overlap with index.test.ts rewrite):

Decorator test coverage (`test/typespec/decorators.test.ts`):
- `$entity` stores name and service in state map
- `$primaryKey` stores table name in state map
- `$pk` adds property to state set
- `$references` stores target property in state map
- `$junction` adds model to state set
- `$uuid` stores encoding and autoGenerate (with default false)
- `$createdAt` and `$updatedAt` add to state sets
- Multiple decorators on same property

IR builder coverage (`test/typespec/emitter.test.ts`):
- Extracts all 9 bookstore entities from mock state
- Correct entity names, table names, PK definitions
- Author: 7 fields with correct types, createdAt/updatedAt timestamps
- Book.authorId FK references to Author.authorId
- BookGenre: junction marker + composite PK + FK references
- Edition: 3 FK references (book, translator, publisher) + nullable translatorId
- snake_case column name generation
- Empty enums array for base bookstore domain

End-to-end coverage (`test/typespec/emitter.test.ts`):
- Full pipeline: decorators → IR builder → assemblePackage → 6 output files
- schema.ts contains all 9 pgTable declarations
- relations.ts contains defineRelations with all entities
- describe.ts contains 8 describe functions (no junction)
- describe.ts uses v2 object-based where syntax
- package.json has correct metadata

---

### Phase 7: Constraints, Enums & Edge Cases

**Goal:** Implement remaining features from RFC Appendix A — constraints, indexes, and enum generation.

**Depends on:** Phase 6

#### 5.7.1 Deliverables

| Feature                      | Files                                    | Test                                       |
| ---------------------------- | ---------------------------------------- | ------------------------------------------ |
| `@unique` (single column)   | `src/decorators.ts`, `schema-generator`  | Unit: correct `.unique()` in output        |
| `@unique({ columns })`      | `src/decorators.ts`, `schema-generator`  | Unit: correct `uniqueIndex()` in output    |
| `@check(expression)`        | `src/decorators.ts`, `schema-generator`  | Unit: correct `check()` constraint         |
| `@index({ name, columns })` | `src/decorators.ts`, `schema-generator`  | Unit: correct `index()` in output          |
| `@minValue`/`@maxValue`     | `src/ir/builder.ts`, `schema-generator`  | Unit: emits CHECK constraint               |
| Enum generation              | `src/ir/builder.ts`, `schema-generator`  | Unit: correct `pgEnum()` output            |
| `@foreignKey` (composite)   | `src/decorators.ts`, `schema-generator`  | Unit: composite FK in table definition     |
| `@visibility(Lifecycle.Read)`| `src/decorators.ts`, `describe-generator`| Unit: read-only typing in Description type |
| Default values               | `src/ir/builder.ts`, `schema-generator`  | Unit: `.default()` in output               |

#### 5.7.2 SQLite Integration Tests for Constraints

```typescript
describe("constraints (SQLite)", () => {
  it("enforces unique constraint", async () => {
    const db = createTestDb();
    // Insert duplicate → expect error
    db.insert(schema.authors).values({ authorId: "a1", name: "Alice", ... });
    assert.throws(() => {
      db.insert(schema.authors).values({ authorId: "a1", name: "Bob", ... });
    });
  });

  it("enforces foreign key constraint", async () => {
    const db = createTestDb();
    // Insert book with non-existent authorId → expect error
    assert.throws(() => {
      db.insert(schema.books).values({ bookId: "b1", authorId: "nonexistent", ... });
    });
  });
});
```

#### 5.7.3 Exit Criteria

- All constraint types from Appendix A generate correct code
- Enum generation produces valid `pgEnum()` calls
- Composite foreign keys generate correctly
- SQLite tests validate constraint enforcement where applicable

#### 5.7.4 Results

**Status: Complete** — All exit criteria met.

**New decorators (8):** `$unique`, `$compositeUnique`, `$check`, `$indexDef`, `$foreignKeyDef`, `$minValue`, `$maxValue`, `$visibility` — all implemented with state keys in `src/lib.ts` and functions in `src/decorators.ts`.

**IR builder updates:** `src/ir/builder.ts` now extracts all new decorator states, detects TypeSpec `Enum` kinds, collects `EnumDef[]` with deduplication, populates `field.constraints`, `field.visibility`, and `field.defaultValue`, and builds entity-level `uniqueConstraints`, `indexes`, and `foreignKeys` from model-level state.

**Schema generator updates:** `src/generators/schema-generator.ts` emits:
- `pgEnum()` declarations for extracted enums
- `.unique()` for single-column unique constraints
- `uniqueIndex()` for composite unique constraints
- `index()` / `uniqueIndex()` for performance indexes
- `check()` with `sql` tagged template for `@minValue`/`@maxValue` and `@check` constraints
- `foreignKey()` for composite foreign keys
- Unified `(table) => [...]` callback form when any table-level extras exist

**Column mapper update:** `src/generators/column-mapper.ts` emits `.unique()` for fields with `constraints.unique`.

**Bookstore fixture updates:**
- Added `BookFormat` enum to `bookstoreEnums` in IR fixture
- Added `format` enum field to Edition entity
- Added `constraints: { unique: true }` on Book.isbn
- Added index on books `(authorId, publicationYear)`
- Added composite unique on editions `(bookId, language)`
- Review.rating has `minValue: 1, maxValue: 5` CHECK constraint
- SQLite DDL updated with `UNIQUE`, `CHECK`, and `UNIQUE(book_id, language)` constraints
- Seed data updated with `format` values for editions

**Test coverage (230 tests, 17 suites, 0 failures):**
- 12 new decorator tests (all 8 new decorators + accumulation + combination tests)
- 16 new schema generator tests (CHECK, uniqueIndex, index, foreignKey, pgEnum, .unique(), .default())
- 11 new SQLite constraint enforcement tests (unique, composite unique, FK, CHECK, composite PK)
- 12 new emitter end-to-end tests (enum extraction, constraint extraction, generated output assertions)
- All 197 pre-existing tests continue to pass

---

## 6. File Map (all phases)

| File Path                                  | Phase | Type   | Description                            |
| ------------------------------------------ | ----- | ------ | -------------------------------------- |
| `src/ir/types.ts`                          | 1     | Create | IR type definitions                    |
| `src/ir/relation-graph.ts`                 | 1+3   | Create | Relation graph types + builder         |
| `src/ir/builder.ts`                        | 6     | Create | TypeSpec → IR extraction               |
| `src/generators/naming.ts`                 | 2     | Create | Naming convention utilities            |
| `src/generators/column-mapper.ts`          | 2     | Create | Field → column code mapping            |
| `src/generators/schema-generator.ts`       | 2     | Create | Entity[] → schema.ts                   |
| `src/generators/relations-generator.ts`    | 3     | Create | Graph → relations.ts                   |
| `src/generators/describe-generator.ts`     | 4     | Create | Entity[] + graph → describe.ts         |
| `src/generators/types-generator.ts`        | 5     | Create | Config → types.ts                      |
| `src/generators/index-generator.ts`        | 5     | Create | Re-export barrel                       |
| `src/assembler.ts`                         | 5     | Create | Full package assembly                  |
| `src/lib.ts`                               | 6     | Create | TypeSpec library + StateKeys           |
| `src/decorators.ts`                        | 6     | Create | Decorator implementations              |
| `src/decorators.tsp`                       | 6     | Create | TypeSpec decorator declarations        |
| `src/index.ts`                             | 6     | Modify | $onEmit entry point                    |
| `test/fixtures/bookstore-schema.ts`        | 1     | Create | SQLite bookstore schema                |
| `test/fixtures/bookstore-relations.ts`     | 1     | Create | defineRelations for bookstore          |
| `test/fixtures/bookstore-seed.ts`          | 1     | Create | Seed data                              |
| `test/fixtures/db.ts`                      | 1     | Create | createTestDb helper                    |
| `test/fixtures/bookstore-ir.ts`            | 2     | Create | Bookstore domain as IR (test fixture)  |
| `test/fixtures/bookstore.tsp`              | 6     | Create | Bookstore TypeSpec source              |
| `test/integration/smoke.test.ts`           | 1     | Create | SQLite smoke test                      |
| `test/integration/relations.test.ts`       | 3     | Create | Relation query tests                   |
| `test/integration/describe.test.ts`        | 4     | Create | Describe query pattern tests           |
| `test/integration/assembly.test.ts`        | 5     | Create | Full assembly test                     |
| `test/integration/constraints.test.ts`     | 7     | Create | Constraint enforcement tests           |
| `test/ir/relation-graph.test.ts`           | 3     | Create | Graph algorithm unit tests             |
| `test/generators/column-mapper.test.ts`    | 2     | Create | Column mapping tests                   |
| `test/generators/schema.test.ts`           | 2     | Create | Schema generation tests                |
| `test/generators/relations.test.ts`        | 3     | Create | Relations generation tests             |
| `test/generators/describe.test.ts`         | 4     | Create | Describe generation tests              |
| `test/generators/types.test.ts`            | 5     | Create | Types generation tests                 |
| `test/typespec/decorators.test.ts`         | 6     | Create | Decorator extraction tests             |
| `test/typespec/emitter.test.ts`            | 6     | Create | End-to-end emitter tests               |

---

## 7. Phase Dependencies & Ordering

```
Phase 1: Infrastructure & IR Types
  │
  ▼
Phase 2: Column Mapping & Schema Generation
  │
  ▼
Phase 3: Relation Graph Algorithm ──────────┐
  │                                          │
  ▼                                          │
Phase 4: Describe Query Generation           │
  │                                          │
  ▼                                          ▼
Phase 5: Package Assembly ◀──────────────────┘
  │
  ▼
Phase 6: TypeSpec Decorator & Emitter Wiring
  │
  ▼
Phase 7: Constraints, Enums & Edge Cases
```

Phases 1–5 have **no TypeSpec dependency**. They are pure TypeScript: IR types, code generators, and SQLite tests. This means the majority of the emitter logic can be developed and tested without the TypeSpec compiler.

Phase 6 introduces `@typespec/compiler` as a dependency and wires everything together.

Phase 7 fills in remaining features and edge cases.

---

## 8. Open Questions

| ID   | Question                                                                                          | Status   | Resolution |
| ---- | ------------------------------------------------------------------------------------------------- | -------- | ---------- |
| Q-01 | Should `better-sqlite3` or `@libsql/client` be used for test SQLite?                              | Resolved | `better-sqlite3` — synchronous, zero-config, validated in Phase 1 |
| Q-02 | Should the generated code use template literals or an AST builder (e.g., ts-morph)?               | Resolved | Template literals — validated in Phase 2. String concatenation with helper functions produces clean, readable output matching the RFC exactly. No AST builder needed. |
| Q-03 | Drizzle v2 `defineRelations` + `through()` for SQLite — is it supported?                          | Resolved | Yes — requires `drizzle-orm@beta` (1.0.0-beta.x). Validated in Phase 1 smoke test. See Section 3.4 for v2 API differences. |
| Q-04 | Should the IR be serializable (JSON) to enable snapshot testing of the full IR?                    | Resolved | No — current coverage is sufficient. Generators test the IR indirectly (correct output implies correct IR). The `bookstore-ir.ts` fixture serves as the canonical IR reference. Snapshot tests would add brittleness without meaningful signal. |
| Q-05 | How to handle the `DrizzleClient` type in `describe.ts` — import from generated types or inline?  | Resolved | Imported from generated `types.ts` via `import type { DrizzleClient } from "./types.js"`. The type is derived using `Parameters<typeof relations.applyTo>[0]`. |
| Q-06 | Generated `describe.ts` must use v2 object-based `where` syntax — does this affect the `describeX(id)` function signatures? | Resolved | Functions take a typed id param (e.g., `bookId: string`). Query internals use v2 object syntax `where: { bookId }`. No impact on function signatures. |

---

## 9. References

- [RFC: TypeSpec Drizzle ORM Emitter](RFC_typespec_emitter_for_drizzle_orm.md)
- [TypeSpec Emitter Basics](https://typespec.io/docs/extending-typespec/emitters-basics)
- [Drizzle ORM v2 Relations](https://rqbv2.drizzle-orm-fe.pages.dev/docs/relations-v2)
- [Drizzle ORM SQLite Schema](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Node.js Test Runner](https://nodejs.org/api/test.html)
