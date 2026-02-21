# EDD-002: Migrate Code Generation to Babel AST

| Field          | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| **Status**     | Complete                                                                        |
| **Author(s)**  | —                                                                               |
| **Created**    | 2026-02-17                                                                      |
| **Updated**    | 2026-02-18 (Phase 4 complete — all phases done)                                 |
| **RFC**        | [RFC: TypeSpec Drizzle ORM Emitter](RFC_typespec_emitter_for_drizzle_orm.md)     |
| **Supersedes** | EDD-001 Q-02 (template literals decision)                                       |

---

## 1. Overview

Replace template literal string concatenation in the code generators with a Babel AST-based approach, as proven in [typespec-electrodb-emitter](https://github.com/mvhenten/typespec-electrodb-emitter).

Current generators manually assemble strings with indentation, commas, and newlines — fragile, hard to compose, and no structural validation. Babel's `generate()` handles formatting automatically and guarantees syntactically valid output.

**What changes:** All 6 generators in `src/generators/` are rewritten to use a new `src/codegen/` module.

**What doesn't change:** IR types, relation graph, TypeSpec decorators, IR builder, assembler interface (`Map<string, string>`), test fixtures.

---

## 2. Design

### 2.1 Codegen Module (`src/codegen/`)

**`stringify.ts`** — port of electrodb's `stringify.ts` (~80 LOC):

- `stringifyObject(obj)` — recursively serializes a JS object to source via Babel parse + generate
- `RawCode` — marker class for verbatim code injection (escape hatch)

**`ast-helpers.ts`** — domain-specific string builders on top of `stringifyObject`:

```typescript
fnCall(name, args)           // text("col_name")
chainCall(base, calls)       // text("col_name").notNull().primaryKey()
objectLiteral(entries)       // { key: value, ... }
importDecl(specs, source)    // import { x } from "y"
exportConst(name, value)     // export const x = ...
```

Helpers return **strings**, not AST nodes. Babel's node construction API (`t.callExpression`, `t.memberExpression`, ...) is verbose and would make every generator 2-3x larger. Strings compose via `RawCode` — same pattern electrodb uses, proven to stay compact.

TypeScript-specific syntax (type aliases, `sql` tagged templates, `defineRelations` callbacks) goes through `RawCode`. Everything else goes through the structured helpers.

### 2.2 Generator Changes (before → after)

**Column mapper:**
```typescript
// Before: ad-hoc string parts
parts.push(`text("${col}")`);
parts.push(".notNull()");
return parts.join("");

// After: composable helpers
let expr = fnCall("text", [quoted(col)]);
return chainCall(expr, [{ method: "notNull" }]);
```

**Schema generator:**
```typescript
// Before: manual indentation
return `export const ${varName} = pgTable("${table.tableName}", {\n${columns}\n});`;

// After: AST-composed
const cols = objectLiteral(table.fields.map(f => [f.name, mapFieldToColumn(f, table)]));
return exportConst(varName, fnCall("pgTable", [quoted(table.tableName), cols]));
```

**Relations/Describe generators** — structural parts use helpers, Drizzle-specific callback patterns and TypeScript type annotations use `RawCode`.

---

## 3. Dependencies

| Package            | devDependency | Purpose                              |
| ------------------ | ------------- | ------------------------------------ |
| `@babel/parser`    | Yes           | Parse code snippets into Babel AST   |
| `@babel/generator` | Yes           | Serialize AST to formatted code      |
| `@babel/types`     | Yes           | AST node type definitions            |

No impact on generated package dependencies.

---

## 4. Migration Phases

Bottom-up, one generator at a time. Each phase keeps all 230 tests green. Test expectations updated to match Babel's formatting (the new canonical format).

### Phase 1: Codegen Foundation ✅

**Status:** Complete — 44 new tests, 274 total (0 failures).

Created `src/codegen/` with `stringify.ts`, `ast-helpers.ts`, unit tests. No existing code touched.

| File                               | Type   |
| ---------------------------------- | ------ |
| `src/codegen/stringify.ts`         | Create |
| `src/codegen/ast-helpers.ts`       | Create |
| `src/codegen/index.ts`             | Create |
| `test/codegen/stringify.test.ts`   | Create |
| `test/codegen/ast-helpers.test.ts` | Create |

**Implementation notes:**

- `@babel/generator` named import `{ generate }` works for both types (`tsgo`) and runtime (`--experimental-strip-types`). Default import required `.default` unwrapping in ESM — avoided.
- `RawCode` class uses explicit field assignment instead of parameter property (`public readonly code`) — `--experimental-strip-types` does not support parameter properties.
- `objectLiteral` parses each key-value pair as `{ key: expr }` via `@babel/parser` with TypeScript plugin, splices properties into the root AST. This handles arbitrary expression values (function calls, chained methods) without quoting.
- `formatCode` parses a full module and re-generates — useful for normalizing multi-statement output.
- Helpers: `fnCall`, `chainCall`, `objectLiteral`, `importDecl`, `exportConst`, `arrayLiteral`, `arrowFn`, `quoted`, `formatCode`.

### Phase 2: Column Mapper + Schema Generator ✅

**Status:** Complete — 274 tests (0 failures), 1 test expectation updated.

Migrated both generators to use codegen helpers. Column mapper output is byte-identical to before — no test changes needed. Schema generator produces single-line imports via `formatCode`, requiring one test assertion update (`"uniqueIndex,"` → `"uniqueIndex"` — last specifier in sorted import has no trailing comma).

| File                                    | Type   |
| --------------------------------------- | ------ |
| `src/generators/column-mapper.ts`       | Modify |
| `src/generators/schema-generator.ts`    | Modify |
| `test/generators/column-mapper.test.ts` | —      |
| `test/generators/schema.test.ts`        | Modify |

**Implementation notes:**

- Column mapper uses `fnCall`, `chainCall`, `quoted` for all column expressions. `objectLiteral(..., { concise: true })` for inline function argument objects like `{ withTimezone: true }`.
- Schema generator keeps manual column object building (`{ key: value }` strings) because `objectLiteral` would re-parse and reformat column mapper output (splitting inline objects across lines). Column mapper output is treated as opaque strings.
- `objectLiteral` `concise` option added in Phase 1 codebase — uses Babel's `generate(ast, { concise: true })` for single-line object output.
- `primaryKey({...})` and `foreignKey({...})` use `objectLiteral(..., { concise: true })` for compact single-line objects in table extras.
- `formatCode(importDecl(...))` normalizes imports to single-line format. Babel omits trailing comma on last specifier.

### Phase 3: Relations + Describe Generators ✅

**Status:** Complete — 274 tests (0 failures), test assertions updated for concise formatting.

Migrated both generators to use codegen helpers. Relation config objects (`from`/`to` fields) and describe `with` objects use `objectLiteral(..., { concise: true })` for single-line output.

| File                                        | Type   |
| ------------------------------------------- | ------ |
| `src/generators/relations-generator.ts`     | Modify |
| `src/generators/describe-generator.ts`      | Modify |
| `test/generators/relations.test.ts`         | Modify |
| `test/generators/describe.test.ts`          | Modify |

**Implementation notes:**

- Relations generator uses `importDecl` for imports and `objectLiteral` with `RawCode` for one/many-through config objects. Config objects use `concise: true` producing single-line format: `r.one.authors({ from: r.books.authorId, to: r.authors.authorId }),`. `generateRelationEntry` returns a single string instead of `string[]`.
- Describe generator uses `importDecl` for imports (with `{ type: true }` for DrizzleClient) and `objectLiteral` with `concise: true` for the `with` object in findFirst calls. TypeScript type aliases and function signatures with type annotations kept as template strings — TypeScript-specific syntax doesn't benefit from Babel AST.
- Q-01 effectively resolved by Phase 3: type annotations stay as template strings (not `RawCode` wrapper, just plain strings). Babel's TypeScript plugin is only used by `objectLiteral` for parsing expression values, not for generating type annotations.

### Phase 4: Types + Index, Cleanup ✅

**Status:** Complete — 274 tests (0 failures), zero test changes needed (byte-identical output).

Migrated both small generators to use codegen helpers. Output unchanged — no test assertion updates required.

| File                                    | Type   |
| --------------------------------------- | ------ |
| `src/generators/types-generator.ts`     | Modify |
| `src/generators/index-generator.ts`     | Modify |
| `test/generators/types.test.ts`         | —      |

**Implementation notes:**

- Types generator uses `importDecl` for named/type imports, `fnCall` for the `short(...)` call, `exportConst` for the `base36Uuid` export. Default import (`import short from "short-uuid"`) kept as manual string with `quoted` — `importDecl` doesn't support default imports.
- TypeScript generics (`customType<{...}>`) and type-annotated callbacks stay as template strings. The config object has TypeScript annotations on arrow functions which can't go through `objectLiteral`.
- Index generator uses `quoted` for source paths in re-export statements. Export re-exports (`export * from`, `export { x } from`) are structurally different from imports — `importDecl` doesn't apply.
- No dead code found to remove. All generators now use codegen helpers for structural parts.

### Phase Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
```

---

## 5. Open Questions

| ID   | Question                                                                                        | Status   | Resolution |
| ---- | ----------------------------------------------------------------------------------------------- | -------- | ---------- |
| Q-01 | Should we enable `@babel/parser`'s TypeScript plugin for type annotations, or keep them as `RawCode`? | Resolved | Type annotations stay as plain template strings. Babel's TypeScript plugin is only used by `objectLiteral` for parsing expression values. No benefit to AST-generating type annotations — they're static strings. |

---

## 6. References

- [typespec-electrodb-emitter `stringify.ts`](https://github.com/mvhenten/typespec-electrodb-emitter/blob/main/src/stringify.ts)
- [EDD-001: TypeSpec Drizzle ORM Emitter](EDD_typespec_drizzle_emitter.md)
