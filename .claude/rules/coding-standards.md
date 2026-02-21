# Coding Standards

## Documentation

Use the **context7** MCP server to look up current documentation for any library before implementing.

## Type Safety

- **No `any`**: Use `unknown` and validate
- **No `!` non-null assertions**: Handle null/undefined explicitly
- **Use type guards over casting**
- **Use discriminated unions** for variant types (see `FieldType` in `src/ir/types.ts`)

```typescript
// Type guard example
const isEntityDef = (value: unknown): value is EntityDef => {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.name === "string" && Array.isArray(obj.fields)
}
```

## Error Handling: LET IT CRASH

We follow the **"Let It Crash"** philosophy. The core principle:

> **Infrastructure errors are unrecoverable. Don't catch them — let the process crash.**

### Why Let It Crash?

1. **Clarity**: Crashes have clear stack traces. Swallowed errors create mystery bugs.
2. **Consistency**: A crashed process is in a known state. A process that "handled" an error is in an unknown state.
3. **Simplicity**: Error recovery code is complex, often wrong, and rarely tested.

### What's Unrecoverable (Let It Crash)

| Error Type | Why It's Fatal |
|---|---|
| TypeSpec compiler errors | Input is invalid — generator can't function |
| File system errors | Can't write output — nothing to recover |
| Missing required IR fields | IR is malformed — crash immediately |

### What's Recoverable (Handle Explicitly)

| Error Type | How to Handle |
|---|---|
| Unsupported field type | Emit diagnostic, skip field or use fallback |
| Missing optional decorator | Use sensible default |
| Naming collisions | Deterministic rename strategy |

### Rules

- **NO try/catch** except at the emitter entry point
- **NO error swallowing** — never `.catch(() => {})` or `.catch(() => null)`
- **NO log-and-re-throw** — it's redundant and clutters logs
- Use TypeSpec diagnostics for user-facing warnings/errors

### Anti-Patterns (NEVER DO THIS)

```typescript
// NEVER: Swallowing errors
try {
  const entity = buildEntityDef(model)
} catch {
  // Error swallowed! Generator continues with incomplete output
}

// NEVER: Generic catch-all
try {
  generateSchema(ir)
} catch (error) {
  console.error("Something went wrong")
  // What failed? What state are we in? Nobody knows.
}
```

### Good: Clear Error Boundaries

```typescript
// DO: Let errors crash
const entity = buildEntityDef(model) // Throws if model is invalid — good!

// DO: Handle expected cases explicitly
const field = entity.fields.find((f) => f.name === name)
if (!field) {
  reportDiagnostic(program, { code: "field-not-found", target: prop })
  return
}
```

## Code Style

- Use `.js` extensions for all local imports in `src/` (ESM, required for `tsgo` emit)
- Test files may use `.ts` extensions when importing from `src/` (tsx loader resolves them)
- Return early, avoid nested else statements
- No comments except for complex business logic or non-obvious workarounds
- Use `function` declarations for named exports; arrow functions for callbacks and inline use

```typescript
// Good — named export
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

// Good — return early
export function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`
  }
  if (/(?:s|sh|ch|x|z)$/.test(word)) {
    return `${word}es`
  }
  return `${word}s`
}
```

## Data Processing

- **Flatten first, then process** — avoid nested loops
- Use `.flatMap()`, `.flat()` to normalize data structures
- Process flat arrays with `.map()`, `.filter()`, `.reduce()`

## Tests

Tests live in a separate `test/` directory, mirroring `src/` structure:

```
src/generators/naming.ts
test/generators/naming.test.ts

src/ir/relation-graph.ts
test/ir/relation-graph.test.ts

test/fixtures/          # Shared test data (bookstore IR, etc.)
test/integration/       # End-to-end generator tests with real SQLite
```

### Test Runner

- `node:test` with `tsx` loader (`--import=tsx`)
- `better-sqlite3` for integration tests (in-memory SQLite)

### Scripts

```json
{
  "scripts": {
    "check": "tsgo --noEmit",
    "test": "node --test --import=tsx 'test/**/*.test.ts'",
    "pretest": "npm run check"
  }
}
```

Run: `npm test` (type check + run)

## Toolchain

- `tsgo` for type checking (`tsgo --noEmit`) and building (`tsgo --project tsconfig.build.json`)
- `biome` for linting and formatting (`biome check .`, `biome check --write .`)
- `tsx` loader for runtime TypeScript (resolves `.js` → `.ts` imports)
- `noEmit: true` in base tsconfig; `tsconfig.build.json` overrides to `noEmit: false` for emit

## IDE Diagnostics

Ignore spellcheck warnings on technical terms and abbreviations (e.g., tsconfig, linting, orm, transpile). These are false positives, not actionable.

## Package Configuration

- `"type": "module"` for ESM
- `peerDependencies` for `@typespec/compiler`
- `devDependencies` for everything else (build tool, test infra, drizzle-orm beta)
