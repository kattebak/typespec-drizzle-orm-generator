import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assemblePackage } from "../../src/assembler.ts";
import { bookstoreEnums, bookstoreTables } from "../fixtures/bookstore-ir.ts";

const config = {
  packageName: "@bookstore/drizzle-schema",
  packageVersion: "0.0.1",
  dialect: "pg" as const,
  pluralize: true,
};

const files = assemblePackage(bookstoreTables, bookstoreEnums, config);

describe("package assembly", () => {
  // ===========================================
  // All 7 files generated
  // ===========================================

  it("produces exactly 7 files", () => {
    assert.equal(files.size, 7);
  });

  it("produces all expected filenames", () => {
    const expected = [
      "package.json",
      "tsconfig.json",
      "types.ts",
      "schema.ts",
      "relations.ts",
      "describe.ts",
      "index.ts",
    ];
    for (const name of expected) {
      assert.ok(files.has(name), `Missing file: ${name}`);
    }
  });

  // ===========================================
  // package.json
  // ===========================================

  it("generates valid package.json with correct name and version", () => {
    const content = files.get("package.json");
    assert.ok(content);
    const pkg = JSON.parse(content);
    assert.equal(pkg.name, "@bookstore/drizzle-schema");
    assert.equal(pkg.version, "0.0.1");
    assert.equal(pkg.type, "module");
  });

  it("package.json has correct exports", () => {
    const content = files.get("package.json");
    assert.ok(content);
    const pkg = JSON.parse(content);
    assert.ok(pkg.exports["."]);
    assert.equal(pkg.exports["."].import, "./dist/index.js");
    assert.equal(pkg.exports["."].types, "./dist/index.d.ts");
  });

  it("package.json includes build and prepare scripts", () => {
    const content = files.get("package.json");
    assert.ok(content);
    const pkg = JSON.parse(content);
    assert.equal(pkg.scripts.build, "tsc");
    assert.equal(pkg.scripts.prepare, "tsc");
  });

  it("package.json includes build and prepare scripts", () => {
    const content = files.get("package.json");
    assert.ok(content);
    const pkg = JSON.parse(content);
    assert.equal(pkg.scripts.build, "tsc");
    assert.equal(pkg.scripts.prepare, "tsc");
  });

  it("package.json includes short-uuid dependency and drizzle-orm peerDependency", () => {
    const content = files.get("package.json");
    assert.ok(content);
    const pkg = JSON.parse(content);
    assert.ok(pkg.dependencies["short-uuid"]);
    assert.equal(pkg.peerDependencies["drizzle-orm"], ">=1.0.0-beta.1");
    assert.equal(pkg.peerDependencies.typescript, ">=5.0.0");
  });

  // ===========================================
  // tsconfig.json
  // ===========================================

  it("tsconfig.json has correct compiler options", () => {
    const content = files.get("tsconfig.json");
    assert.ok(content);
    const tsconfig = JSON.parse(content);
    assert.equal(tsconfig.compilerOptions.module, "NodeNext");
    assert.equal(tsconfig.compilerOptions.declaration, true);
    assert.equal(tsconfig.compilerOptions.skipLibCheck, true);
    assert.equal(tsconfig.compilerOptions.outDir, "dist");
  });

  // ===========================================
  // types.ts
  // ===========================================

  it("types.ts contains base36Uuid custom type", () => {
    const types = files.get("types.ts");
    assert.ok(types);
    assert.ok(types.includes("export const base36Uuid"));
    assert.ok(types.includes("customType"));
  });

  it("types.ts contains DrizzleClient type", () => {
    const types = files.get("types.ts");
    assert.ok(types);
    assert.ok(types.includes("export type DrizzleClient"));
  });

  // ===========================================
  // schema.ts
  // ===========================================

  it("schema.ts contains all 9 table declarations", () => {
    const schema = files.get("schema.ts");
    assert.ok(schema);
    const tables = [
      "authors",
      "books",
      "genres",
      "bookGenres",
      "bookTags",
      "translators",
      "publishers",
      "editions",
      "reviews",
    ];
    for (const name of tables) {
      assert.ok(schema.includes(`export const ${name} = pgTable(`), `Missing table: ${name}`);
    }
  });

  it("schema.ts imports from drizzle-orm/pg-core", () => {
    const schema = files.get("schema.ts");
    assert.ok(schema);
    assert.ok(schema.includes('from "drizzle-orm/pg-core"'));
  });

  it("schema.ts imports base36Uuid, generateBase36Id, and nullable wrappers from types", () => {
    const schema = files.get("schema.ts");
    assert.ok(schema);
    assert.ok(schema.includes('from "./types.js"'));
    assert.ok(schema.includes("base36Uuid"));
    assert.ok(schema.includes("generateBase36Id"));
    assert.ok(schema.includes("nullableInteger"));
    assert.ok(schema.includes("nullableText"));
  });

  // ===========================================
  // relations.ts
  // ===========================================

  it("relations.ts contains defineRelations call", () => {
    const relations = files.get("relations.ts");
    assert.ok(relations);
    assert.ok(relations.includes("export const relations = defineRelations(schema, (r) => ({"));
  });

  it("relations.ts contains all 9 table relation blocks", () => {
    const relations = files.get("relations.ts");
    assert.ok(relations);
    const tableVars = [
      "authors",
      "books",
      "genres",
      "bookGenres",
      "bookTags",
      "translators",
      "publishers",
      "editions",
      "reviews",
    ];
    for (const name of tableVars) {
      assert.ok(relations.includes(`  ${name}: {`), `Missing relation block: ${name}`);
    }
  });

  // ===========================================
  // describe.ts
  // ===========================================

  it("describe.ts contains 8 describe functions (no junction)", () => {
    const describe = files.get("describe.ts");
    assert.ok(describe);
    const functions = [
      "describeAuthor",
      "describeBook",
      "describeGenre",
      "describeBookTag",
      "describeTranslator",
      "describePublisher",
      "describeEdition",
      "describeReview",
    ];
    for (const name of functions) {
      assert.ok(
        describe.includes(`export const ${name} = (`),
        `Missing describe function: ${name}`,
      );
    }
    assert.ok(!describe.includes("describeBookGenre"), "Should not generate describeBookGenre");
  });

  it("describe.ts uses v2 object-based where syntax", () => {
    const describe = files.get("describe.ts");
    assert.ok(describe);
    assert.ok(describe.includes("where: { bookId },"));
    assert.ok(describe.includes("where: { authorId },"));
  });

  // ===========================================
  // index.ts
  // ===========================================

  it("index.ts re-exports all modules", () => {
    const index = files.get("index.ts");
    assert.ok(index);
    assert.ok(index.includes('export * from "./types.js"'));
    assert.ok(index.includes('export * from "./schema.js"'));
    assert.ok(index.includes('export { relations } from "./relations.js"'));
    assert.ok(index.includes('export * from "./describe.js"'));
  });
});
